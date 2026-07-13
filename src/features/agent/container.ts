import "server-only";
import OpenAI from "openai";
import { db } from "@/db/client";
import { SupabaseChatRepository } from "@/features/chat/chat-repository";
import { getServerEnv } from "@/lib/env";
import { notionOAuthService } from "@/features/notion/container";
import { AgentRunner } from "./agent-runner";
import type { AgentProvider } from "./types";
import {
  AzureResponsesProvider,
  type ResponsesClientLike,
} from "./azure-responses-provider";
import { createPostHogMcpTool } from "./posthog-capability";
import { createNotionMcpTool } from "./notion-capability";
import { FakeAgentProvider } from "./fake-agent-provider";
import { createStripeMcpTool } from "./stripe-capability";
import { createSupabaseMcpTool } from "./supabase-capability";
import {
  AMIO_DEMO_BOT_ID,
  createAmioConversationsTools,
} from "./amio-conversations-capability";
import { createMrrFunctionTool } from "./mrr-capability";

const env = getServerEnv();

export const chatRepository = new SupabaseChatRepository(db);

let provider: AgentProvider;
let model: string;

if (env.AGENT_PROVIDER === "fake") {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Fake agent provider is disabled in production");
  }
  provider = new FakeAgentProvider();
  model = "fake-agent";
} else {
  if (
    Boolean(env.SUPABASE_ACCESS_TOKEN) !== Boolean(env.SUPABASE_PROJECT_REF)
  ) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be configured together",
    );
  }
  const openai = new OpenAI({
    apiKey: env.AZURE_OPENAI_API_KEY,
    baseURL: `${env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, "")}/openai/v1/`,
  });
  provider = new AzureResponsesProvider(
    openai as unknown as ResponsesClientLike,
    {
      deployment: env.AZURE_OPENAI_DEPLOYMENT,
      mcpTools: [
        createPostHogMcpTool({
          apiKey: env.POSTHOG_API_KEY,
          organizationId: env.POSTHOG_ORGANIZATION_ID,
          projectId: env.POSTHOG_PROJECT_ID,
        }),
        createStripeMcpTool({
          apiKey: env.STRIPE_API_KEY,
        }),
        ...(env.SUPABASE_ACCESS_TOKEN && env.SUPABASE_PROJECT_REF
          ? [
              createSupabaseMcpTool({
                accessToken: env.SUPABASE_ACCESS_TOKEN,
                projectRef: env.SUPABASE_PROJECT_REF,
              }),
            ]
          : []),
      ],
      functionTools: [
        ...(env.AMIO_API_KEY
          ? createAmioConversationsTools({
              apiKey: env.AMIO_API_KEY,
              baseUrl:
                env.AMIO_API_BASE_URL ?? "https://chatbot-engine.amio.io",
              botId: AMIO_DEMO_BOT_ID,
              maxConversations: env.AMIO_MAX_CONVERSATIONS ?? 50,
            })
          : []),
        ...(env.SUPABASE_PROJECT_REF && env.SUPABASE_SERVICE_ROLE_KEY
          ? [
              createMrrFunctionTool({
                supabaseUrl: `https://${env.SUPABASE_PROJECT_REF}.supabase.co`,
                serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
              }),
            ]
          : []),
      ],
      getMcpTools: async () => {
        try {
          const accessToken =
            await notionOAuthService.getValidAccessToken();
          return accessToken ? [createNotionMcpTool(accessToken)] : [];
        } catch {
          return [];
        }
      },
    },
  );
  model = env.AZURE_OPENAI_DEPLOYMENT;
}

export const agentRunner = new AgentRunner(
  chatRepository,
  provider,
  model,
);
