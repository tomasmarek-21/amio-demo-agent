import type { SupabaseClient } from "@supabase/supabase-js";

const CONNECTION_ID = "primary";

export interface NotionTokenUpdate {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  authorizedAt?: Date;
  lastRefreshAt: Date;
}

export class NotionOAuthRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getConnection() {
    const { data } = await this.client
      .from("notion_connections")
      .select("*")
      .eq("id", CONNECTION_ID)
      .maybeSingle();
    return data ? mapConnection(data) : null;
  }

  async saveRegistration(input: {
    redirectUri: string;
    clientId: string;
    clientSecret: string | null;
  }) {
    const now = new Date().toISOString();
    const { error } = await this.client.from("notion_connections").upsert({
      id: CONNECTION_ID,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      access_token: null,
      refresh_token: null,
      access_token_expires_at: null,
      authorized_at: null,
      last_refresh_at: null,
      updated_at: now,
    });
    if (error) throw error;
  }

  async saveOAuthState(input: {
    state: string;
    codeVerifier: string;
    redirectUri: string;
    expiresAt: Date;
  }) {
    const { error } = await this.client.from("notion_oauth_states").insert({
      state: input.state,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      expires_at: input.expiresAt.toISOString(),
    });
    if (error) throw error;
  }

  async consumeOAuthState(state: string) {
    const { data } = await this.client
      .from("notion_oauth_states")
      .select("*")
      .eq("state", state)
      .maybeSingle();
    if (data) {
      await this.client.from("notion_oauth_states").delete().eq("state", state);
    }
    return data ? mapOAuthState(data) : null;
  }

  async saveTokens(input: NotionTokenUpdate) {
    const update: Record<string, string | null> = {
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      access_token_expires_at: input.accessTokenExpiresAt.toISOString(),
      last_refresh_at: input.lastRefreshAt.toISOString(),
      updated_at: input.lastRefreshAt.toISOString(),
    };
    if (input.authorizedAt) update.authorized_at = input.authorizedAt.toISOString();
    const { error } = await this.client
      .from("notion_connections")
      .update(update)
      .eq("id", CONNECTION_ID);
    if (error) throw error;
  }

  async disconnect() {
    const { error } = await this.client
      .from("notion_connections")
      .update({
        access_token: null,
        refresh_token: null,
        access_token_expires_at: null,
        authorized_at: null,
        last_refresh_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", CONNECTION_ID);
    if (error) throw error;
  }
}

function mapConnection(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    redirectUri: row.redirect_uri as string,
    clientId: row.client_id as string,
    clientSecret: (row.client_secret as string | null) ?? null,
    accessToken: (row.access_token as string | null) ?? null,
    refreshToken: (row.refresh_token as string | null) ?? null,
    accessTokenExpiresAt: row.access_token_expires_at
      ? new Date(row.access_token_expires_at as string)
      : null,
    authorizedAt: row.authorized_at ? new Date(row.authorized_at as string) : null,
    lastRefreshAt: row.last_refresh_at ? new Date(row.last_refresh_at as string) : null,
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapOAuthState(row: Record<string, unknown>) {
  return {
    state: row.state as string,
    codeVerifier: row.code_verifier as string,
    redirectUri: row.redirect_uri as string,
    expiresAt: new Date(row.expires_at as string),
  };
}
