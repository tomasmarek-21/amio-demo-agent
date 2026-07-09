import "server-only";
import { notionOAuthService } from "@/features/notion/container";
import {
  AMIO_DEMO_BOT_ID,
  type AmioCapabilityConfig,
} from "@/features/agent/amio-conversations-capability";
import { AmioConversationsApi } from "@/features/amio-conversations/amio-conversations-api";
import { createPostHogMcpTool } from "@/features/agent/posthog-capability";
import {
  STRIPE_READ_ONLY_TOOLS,
  createStripeMcpTool,
} from "@/features/agent/stripe-capability";
import {
  SUPABASE_READ_ONLY_TOOLS,
  createSupabaseMcpTool,
} from "@/features/agent/supabase-capability";
import type {
  ConnectorHealth,
  ConnectorId,
  ConnectorStatus,
  IntegrationsHealth,
} from "./types";
import { checkMcpTools } from "./mcp-health";

type HealthBase = Omit<
  ConnectorHealth,
  "status" | "connected" | "message" | "lastCheckedAt"
>;

export async function getIntegrationsHealth(): Promise<IntegrationsHealth> {
  const lastCheckedAt = new Date().toISOString();
  const connectors = await Promise.all([
    amioHealth(lastCheckedAt),
    notionHealth(lastCheckedAt),
    posthogHealth(lastCheckedAt),
    stripeHealth(lastCheckedAt),
    supabaseHealth(lastCheckedAt),
  ]);
  return { connectors };
}

async function amioHealth(lastCheckedAt: string): Promise<ConnectorHealth> {
  const apiKey = emptyToUndefined(process.env.AMIO_API_KEY);
  const baseUrl =
    emptyToUndefined(process.env.AMIO_API_BASE_URL) ??
    "https://chatbot-engine.amio.io";
  const base = connector("amio", "AMIO", Boolean(apiKey), "env");
  if (!apiKey) {
    return status(
      base,
      "misconfigured",
      "Missing AMIO_API_KEY in .env.local.",
      lastCheckedAt,
    );
  }

  try {
    const api = new AmioConversationsApi({
      apiKey,
      baseUrl,
      botId: AMIO_DEMO_BOT_ID,
    });
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    await api.searchConversations(
      {
        dateFrom: oneHourAgo.toISOString(),
        dateTo: now.toISOString(),
        maxConversations: 1,
      },
      undefined,
      1,
    );
    return status(
      base,
      "connected",
      "AMIO analytics API is available.",
      lastCheckedAt,
    );
  } catch (error) {
    return status(
      base,
      "disconnected",
      readableError(error),
      lastCheckedAt,
    );
  }
}

async function notionHealth(lastCheckedAt: string): Promise<ConnectorHealth> {
  const base = connector("notion", "Notion", true, "oauth");
  try {
    const token = await notionOAuthService.getValidAccessToken();
    return status(
      base,
      token ? "connected" : "disconnected",
      token ? "OAuth token is valid." : "Notion OAuth is not connected.",
      lastCheckedAt,
    );
  } catch (error) {
    return status(
      base,
      "disconnected",
      readableError(error),
      lastCheckedAt,
    );
  }
}

async function posthogHealth(lastCheckedAt: string): Promise<ConnectorHealth> {
  const apiKey = process.env.POSTHOG_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const base = connector(
    "posthog",
    "PostHog",
    Boolean(apiKey && projectId),
    "env",
  );
  if (!apiKey || !projectId) {
    return status(
      base,
      "misconfigured",
      "Missing POSTHOG_API_KEY or POSTHOG_PROJECT_ID in .env.local.",
      lastCheckedAt,
    );
  }
  const tool = createPostHogMcpTool({
    apiKey,
    projectId,
    organizationId: emptyToUndefined(process.env.POSTHOG_ORGANIZATION_ID),
  });
  return mcpStatus(base, tool.server_url, apiKey, lastCheckedAt);
}

async function stripeHealth(lastCheckedAt: string): Promise<ConnectorHealth> {
  const apiKey = process.env.STRIPE_API_KEY;
  const base = connector("stripe", "Stripe", Boolean(apiKey), "env");
  if (!apiKey) {
    return status(
      base,
      "misconfigured",
      "Missing STRIPE_API_KEY in .env.local.",
      lastCheckedAt,
    );
  }
  if (!apiKey.startsWith("rk_live_")) {
    return status(
      base,
      "misconfigured",
      "STRIPE_API_KEY must be a production restricted key starting with rk_live_.",
      lastCheckedAt,
    );
  }
  const tool = createStripeMcpTool({ apiKey });
  return mcpStatus(
    base,
    tool.server_url,
    apiKey,
    lastCheckedAt,
    STRIPE_READ_ONLY_TOOLS.slice(0, 1),
  );
}

async function supabaseHealth(lastCheckedAt: string): Promise<ConnectorHealth> {
  const accessToken = emptyToUndefined(process.env.SUPABASE_ACCESS_TOKEN);
  const projectRef = emptyToUndefined(process.env.SUPABASE_PROJECT_REF);
  const base = connector(
    "supabase",
    "Supabase",
    Boolean(accessToken && projectRef),
    "env",
  );
  if (!accessToken || !projectRef) {
    return status(
      base,
      "misconfigured",
      "Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF in .env.local.",
      lastCheckedAt,
    );
  }
  const tool = createSupabaseMcpTool({ accessToken, projectRef });
  return mcpStatus(
    base,
    tool.server_url,
    accessToken,
    lastCheckedAt,
    SUPABASE_READ_ONLY_TOOLS.slice(0, 1),
  );
}

async function mcpStatus(
  base: HealthBase,
  serverUrl: string,
  authorization: string,
  lastCheckedAt: string,
  expectedTools?: string[],
): Promise<ConnectorHealth> {
  const result = await checkMcpTools({
    serverUrl,
    authorization,
    expectedTools,
  });
  return status(
    base,
    result.ok ? "connected" : "disconnected",
    result.message,
    lastCheckedAt,
  );
}

function connector(
  id: ConnectorId,
  name: string,
  configured: boolean,
  action: ConnectorHealth["action"],
): HealthBase {
  return { id, name, configured, action };
}

function status(
  base: HealthBase,
  value: ConnectorStatus,
  message: string,
  lastCheckedAt: string,
): ConnectorHealth {
  return {
    ...base,
    status: value,
    connected: value === "connected",
    message,
    lastCheckedAt,
  };
}

function emptyToUndefined(value: string | undefined) {
  return value === "" ? undefined : value;
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Health check failed.";
}
