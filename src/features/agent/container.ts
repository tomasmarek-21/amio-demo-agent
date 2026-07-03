import "server-only";
import OpenAI from "openai";
import { db } from "@/db/client";
import { SqliteChatRepository } from "@/features/chat/sqlite-chat-repository";
import { getServerEnv } from "@/lib/env";
import { AgentRunner } from "./agent-runner";
import type { AgentProvider } from "./types";
import {
  AzureResponsesProvider,
  type ResponsesClientLike,
} from "./azure-responses-provider";
import { createPostHogMcpTool } from "./posthog-capability";
import { FakeAgentProvider } from "./fake-agent-provider";
import { createStripeMcpTool } from "./stripe-capability";
import { createSupabaseMcpTool } from "./supabase-capability";

const env = getServerEnv();

export const chatRepository = new SqliteChatRepository(db);

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
    },
  );
  model = env.AZURE_OPENAI_DEPLOYMENT;
}

export const agentRunner = new AgentRunner(
  chatRepository,
  provider,
  model,
);
