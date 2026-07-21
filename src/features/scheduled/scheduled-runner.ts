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
import { createMrrTools } from "@/features/agent/mrr-capability";
import { createDemoConversationsTools } from "@/features/agent/demo-conversations-capability";
import { getWorkflow, type Capability } from "./workflows";
import { createCompleteScheduledRunTool } from "./complete-run-tool";

function getCurrentMonthStart(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}-01`;
}

export async function runScheduledWorkflow(
  sessionId: string,
  workflowId: string,
  callbackUrl: string | null,
  targetMonth?: string, // "YYYY-MM-01"; defaults to current Prague month
  userPromptOverride?: string,
): Promise<void> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) return;

  const env = getServerEnv();
  if (env.AGENT_PROVIDER === "fake") return;

  const resolvedMonth = targetMonth ?? getCurrentMonthStart();
  const ctx = { targetMonth: resolvedMonth };

  const instructions = workflow.systemPrompt?.(ctx);
  const defaultPrompt =
    typeof workflow.prompt === "function" ? workflow.prompt(ctx) : workflow.prompt;
  const prompt = userPromptOverride ?? defaultPrompt;

  let capturedSlackMessage: string | null = null;
  const completeRunTool = createCompleteScheduledRunTool(({ slackMessage }) => {
    capturedSlackMessage = slackMessage;
  });

  console.log(`[scheduled-run] starting workflowId=${workflowId} sessionId=${sessionId} targetMonth=${resolvedMonth}`);

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
      ? createMrrTools({
          supabaseUrl: `https://${env.SUPABASE_PROJECT_REF}.supabase.co`,
          serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        })
      : []),
    ...(caps.has("demo-conversations") &&
    env.SUPABASE_PROJECT_REF &&
    env.SUPABASE_SERVICE_ROLE_KEY
      ? createDemoConversationsTools({
          supabaseUrl: `https://${env.SUPABASE_PROJECT_REF}.supabase.co`,
          serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        })
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
      ...(instructions ? { instructions } : {}),
    },
  );

  const runner = new AgentRunner(
    chatRepository,
    provider,
    "gpt-55",
  );

  console.log(`[scheduled-run] tools ready — mcpTools=${mcpTools.length} functionTools=${functionTools.length}`);

  let status: "completed" | "failed" = "completed";
  let runError: string | null = null;
  try {
    for await (const event of runner.run(sessionId, prompt, undefined, "gpt-55", "medium")) {
      if (event.type === "error") {
        status = "failed";
        runError = event.message;
        console.error(`[scheduled-run] agent error: ${event.message}`);
        break;
      }
      if (event.type === "tool_trace") {
        console.log(`[scheduled-run] tool=${event.toolName} status=${event.status}${event.error ? ` error=${event.error}` : ""}`);
      }
    }
  } catch (err) {
    status = "failed";
    runError = err instanceof Error ? err.message : String(err);
    console.error(`[scheduled-run] uncaught error: ${runError}`);
  }

  console.log(`[scheduled-run] finished status=${status} slackMessage=${capturedSlackMessage ? "yes" : "no"} callbackUrl=${callbackUrl ?? "none"}`);

  if (callbackUrl) {
    await fireCallback(callbackUrl, { status, slackMessage: capturedSlackMessage, error: runError });
  }
}

async function fireCallback(
  url: string,
  body: { status: "completed" | "failed"; slackMessage: string | null; error?: string | null },
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
