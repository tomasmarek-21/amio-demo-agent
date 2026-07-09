import {
  createHash,
  randomBytes,
} from "node:crypto";
import type { NotionOAuthRepository } from "./notion-oauth-repository";
import type { TokenCipher } from "./token-crypto";

const NOTION_MCP_ORIGIN = "https://mcp.notion.com";
const ACCESS_REFRESH_MARGIN_MS = 5 * 60 * 1_000;
const OAUTH_STATE_LIFETIME_MS = 10 * 60 * 1_000;
const REFRESH_INACTIVITY_MS = 30 * 24 * 60 * 60 * 1_000;
const REFRESH_ABSOLUTE_MS = 180 * 24 * 60 * 60 * 1_000;

interface OAuthMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface NotionConnectionStatus {
  connected: boolean;
}

export class NotionOAuthService {
  private refreshPromise: Promise<string | null> | null = null;

  constructor(
    private readonly repository: NotionOAuthRepository,
    private readonly cipher: TokenCipher,
  ) {}

  async getStatus(): Promise<NotionConnectionStatus> {
    const connection = await this.repository.getConnection();
    if (!connection?.accessToken || !connection.refreshToken) {
      return { connected: false };
    }
    const now = Date.now();
    const authorizedAt = connection.authorizedAt?.getTime() ?? 0;
    const lastRefreshAt =
      connection.lastRefreshAt?.getTime() ?? authorizedAt;
    if (
      !authorizedAt ||
      now >= authorizedAt + REFRESH_ABSOLUTE_MS ||
      now >= lastRefreshAt + REFRESH_INACTIVITY_MS
    ) {
      await this.repository.disconnect();
      return { connected: false };
    }
    return { connected: true };
  }

  async startAuthorization(origin: string): Promise<string> {
    const redirectUri = `${origin}/api/integrations/notion/callback`;
    const metadata = await discoverOAuthMetadata();
    let connection = await this.repository.getConnection();
    if (
      !connection ||
      connection.redirectUri !== redirectUri ||
      !connection.clientId
    ) {
      const registration = await registerClient(metadata, origin, redirectUri);
      await this.repository.saveRegistration({
        redirectUri,
        clientId: registration.client_id,
        clientSecret: registration.client_secret
          ? this.cipher.encrypt(registration.client_secret)
          : null,
      });
      connection = await this.repository.getConnection();
    }
    if (!connection) {
      throw new Error("Failed to register the Notion OAuth client.");
    }

    const state = randomBytes(32).toString("hex");
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    await this.repository.saveOAuthState({
      state,
      codeVerifier: this.cipher.encrypt(verifier),
      redirectUri,
      expiresAt: new Date(Date.now() + OAUTH_STATE_LIFETIME_MS),
    });

    const url = new URL(metadata.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", connection.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "consent");
    return url.toString();
  }

  async completeAuthorization(input: {
    code: string;
    state: string;
    origin: string;
  }): Promise<void> {
    const oauthState = await this.repository.consumeOAuthState(input.state);
    if (
      !oauthState ||
      oauthState.expiresAt.getTime() <= Date.now() ||
      oauthState.redirectUri !==
        `${input.origin}/api/integrations/notion/callback`
    ) {
      throw new Error("The Notion OAuth request expired or is invalid.");
    }
    const connection = await this.repository.getConnection();
    if (!connection || connection.redirectUri !== oauthState.redirectUri) {
      throw new Error("Notion OAuth registration was not found.");
    }
    const metadata = await discoverOAuthMetadata();
    const tokens = await requestTokens(metadata.token_endpoint, {
      grant_type: "authorization_code",
      code: input.code,
      client_id: connection.clientId,
      redirect_uri: oauthState.redirectUri,
      code_verifier: this.cipher.decrypt(oauthState.codeVerifier),
      client_secret: connection.clientSecret
        ? this.cipher.decrypt(connection.clientSecret)
        : undefined,
    });
    if (!tokens.refresh_token) {
      throw new Error("Notion did not return a refresh token.");
    }
    const now = new Date();
    await this.repository.saveTokens({
      accessToken: this.cipher.encrypt(tokens.access_token),
      refreshToken: this.cipher.encrypt(tokens.refresh_token),
      accessTokenExpiresAt: expiresAt(tokens),
      authorizedAt: now,
      lastRefreshAt: now,
    });
  }

  async getValidAccessToken(): Promise<string | null> {
    if (!(await this.getStatus()).connected) return null;
    const connection = await this.repository.getConnection();
    if (!connection?.accessToken || !connection.accessTokenExpiresAt) {
      return null;
    }
    if (
      connection.accessTokenExpiresAt.getTime() >
      Date.now() + ACCESS_REFRESH_MARGIN_MS
    ) {
      try {
        return this.cipher.decrypt(connection.accessToken);
      } catch {
        await this.repository.disconnect();
        return null;
      }
    }
    this.refreshPromise ??= this.refreshAccessToken().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async refreshAccessToken(): Promise<string | null> {
    const connection = await this.repository.getConnection();
    if (!connection?.refreshToken) return null;
    try {
      const metadata = await discoverOAuthMetadata();
      const currentRefreshToken = this.cipher.decrypt(connection.refreshToken);
      const tokens = await requestTokens(metadata.token_endpoint, {
        grant_type: "refresh_token",
        refresh_token: currentRefreshToken,
        client_id: connection.clientId,
        client_secret: connection.clientSecret
          ? this.cipher.decrypt(connection.clientSecret)
          : undefined,
      });
      const nextRefreshToken =
        tokens.refresh_token ?? currentRefreshToken;
      const now = new Date();
      await this.repository.saveTokens({
        accessToken: this.cipher.encrypt(tokens.access_token),
        refreshToken: this.cipher.encrypt(nextRefreshToken),
        accessTokenExpiresAt: expiresAt(tokens),
        lastRefreshAt: now,
      });
      return tokens.access_token;
    } catch (error) {
      if (error instanceof OAuthTokenError && error.code === "invalid_grant") {
        await this.repository.disconnect();
        return null;
      }
      throw error;
    }
  }
}

class OAuthTokenError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function discoverOAuthMetadata(): Promise<OAuthMetadata> {
  const resourceResponse = await fetch(
    `${NOTION_MCP_ORIGIN}/.well-known/oauth-protected-resource`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  if (!resourceResponse.ok) {
    throw new Error("Notion OAuth discovery failed.");
  }
  const resource = (await resourceResponse.json()) as {
    authorization_servers?: string[];
  };
  const authorizationServer = resource.authorization_servers?.[0];
  if (!authorizationServer) {
    throw new Error("Notion did not return an OAuth authorization server.");
  }
  const metadataResponse = await fetch(
    `${authorizationServer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  if (!metadataResponse.ok) {
    throw new Error("Notion OAuth metadata could not be loaded.");
  }
  const metadata = (await metadataResponse.json()) as OAuthMetadata;
  if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
    throw new Error("Notion OAuth metadata is incomplete.");
  }
  return metadata;
}

async function registerClient(
  metadata: OAuthMetadata,
  origin: string,
  redirectUri: string,
) {
  if (!metadata.registration_endpoint) {
    throw new Error("Notion does not support dynamic client registration.");
  }
  const response = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "AMIO-Analytics-Agent/1.0",
    },
    body: JSON.stringify({
      client_name: "AMIO Analytics Agent",
      client_uri: origin,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!response.ok) {
    throw new Error("AMIO client registration in Notion failed.");
  }
  return (await response.json()) as {
    client_id: string;
    client_secret?: string;
  };
}

async function requestTokens(
  endpoint: string,
  input: Record<string, string | undefined>,
): Promise<TokenResponse> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value) body.set(key, value);
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "AMIO-Analytics-Agent/1.0",
    },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    error_description?: string;
  } & Partial<TokenResponse>;
  if (!response.ok || !payload.access_token) {
    throw new OAuthTokenError(
      payload.error ?? "token_exchange_failed",
      payload.error_description ?? "Notion OAuth token exchange failed.",
    );
  }
  return payload as TokenResponse;
}

function expiresAt(tokens: TokenResponse) {
  return new Date(Date.now() + (tokens.expires_in ?? 3_600) * 1_000);
}
