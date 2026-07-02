import "server-only";
import OpenAI from "openai";
import { db } from "@/db/client";
import { SqliteChatRepository } from "@/features/chat/sqlite-chat-repository";
import { getServerEnv } from "@/lib/env";
import { AgentRunner } from "./agent-runner";
import {
  AzureResponsesProvider,
  type ResponsesClientLike,
} from "./azure-responses-provider";
import { createPostHogMcpTool } from "./posthog-capability";

const env = getServerEnv();

export const chatRepository = new SqliteChatRepository(db);

const openai = new OpenAI({
  apiKey: env.AZURE_OPENAI_API_KEY,
  baseURL: `${env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, "")}/openai/v1/`,
});

const provider = new AzureResponsesProvider(
  openai as unknown as ResponsesClientLike,
  {
    deployment: env.AZURE_OPENAI_DEPLOYMENT,
    mcpTool: createPostHogMcpTool({
      apiKey: env.POSTHOG_API_KEY,
      organizationId: env.POSTHOG_ORGANIZATION_ID,
      projectId: env.POSTHOG_PROJECT_ID,
    }),
  },
);

export const agentRunner = new AgentRunner(
  chatRepository,
  provider,
  env.AZURE_OPENAI_DEPLOYMENT,
);
