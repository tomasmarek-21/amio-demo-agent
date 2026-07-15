import "server-only";
import OpenAI from "openai";
import { chatRepository } from "@/features/agent/container";
import { getServerEnv } from "@/lib/env";
import { AgentRunner } from "@/features/agent/agent-runner";
import {
  AzureResponsesProvider,
  type ResponsesClientLike,
} from "@/features/agent/azure-responses-provider";
import { createPostHogMcpTool } from "@/features/agent/posthog-capability";
import { createStripeMcpTool } from "@/features/agent/stripe-capability";
import { createSupabaseMcpTool } from "@/features/agent/supabase-capability";
import {
  AMIO_DEMO_BOT_ID,
  createAmioConversationsTools,
} from "@/features/agent/amio-conversations-capability";
import { createMrrFunctionTool } from "@/features/agent/mrr-capability";
import { getWorkflow, type Capability } from "./workflows";
import { createCompleteScheduledRunTool } from "./complete-run-tool";

export async function runScheduledWorkflow(
  sessionId: string,
  workflowId: string,
  callbackUrl: string | null,
): Promise<void> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) return;

  const env = getServerEnv();
  if (env.AGENT_PROVIDER === "fake") return;

  let capturedSlackMessage: string | null = null;
  const completeRunTool = createCompleteScheduledRunTool(({ slackMessage }) => {
    capturedSlackMessage = slackMessage;
  });

  const caps = new Set<Capability>(workflow.capabilities);

  const mcpTools = [
    ...(caps.has("posthog")
      ? [
          createPostHogMcpTool({
            apiKey: env.POSTHOG_API_KEY,
            organizationId: env.POSTHOG_ORGANIZATION_ID,
            projectId: env.POSTHOG_PROJECT_ID,
          }),
        ]
      : []),
    ...(caps.has("stripe")
      ? [createStripeMcpTool({ apiKey: env.STRIPE_API_KEY })]
      : []),
    ...(caps.has("supabase") &&
    env.SUPABASE_ACCESS_TOKEN &&
    env.SUPABASE_PROJECT_REF
      ? [
          createSupabaseMcpTool({
            accessToken: env.SUPABASE_ACCESS_TOKEN,
            projectRef: env.SUPABASE_PROJECT_REF,
          }),
        ]
      : []),
  ];

  const functionTools = [
    completeRunTool,
    ...(caps.has("amio-conversations") && env.AMIO_API_KEY
      ? createAmioConversationsTools({
          apiKey: env.AMIO_API_KEY,
          baseUrl:
            env.AMIO_API_BASE_URL ?? "https://chatbot-engine.amio.io",
          botId: AMIO_DEMO_BOT_ID,
          maxConversations: env.AMIO_MAX_CONVERSATIONS ?? 50,
        })
      : []),
    ...(caps.has("mrr") &&
    env.SUPABASE_PROJECT_REF &&
    env.SUPABASE_SERVICE_ROLE_KEY
      ? [
          createMrrFunctionTool({
            supabaseUrl: `https://${env.SUPABASE_PROJECT_REF}.supabase.co`,
            serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
          }),
        ]
      : []),
  ];

  const openai = new OpenAI({
    apiKey: env.AZURE_OPENAI_API_KEY,
    baseURL: `${env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, "")}/openai/v1/`,
  });

  const provider = new AzureResponsesProvider(
    openai as unknown as ResponsesClientLike,
    {
      deployment: env.AZURE_OPENAI_DEPLOYMENT,
      mcpTools,
      functionTools,
    },
  );

  const runner = new AgentRunner(
    chatRepository,
    provider,
    env.AZURE_OPENAI_DEPLOYMENT,
  );

  let status: "completed" | "failed" = "completed";
  try {
    for await (const event of runner.run(sessionId, workflow.prompt)) {
      if (event.type === "error") {
        status = "failed";
        break;
      }
    }
  } catch {
    status = "failed";
  }

  if (callbackUrl) {
    await fireCallback(callbackUrl, { status, slackMessage: capturedSlackMessage });
  }
}

async function fireCallback(
  url: string,
  body: { status: "completed" | "failed"; slackMessage: string | null },
): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    console.error("Failed to fire scheduled run callback:", url);
  }
}
