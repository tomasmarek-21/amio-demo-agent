import { config } from "dotenv";
import OpenAI from "openai";
import {
  AzureResponsesProvider,
  type ResponsesClientLike,
} from "../src/features/agent/azure-responses-provider";
import { createPostHogMcpTool } from "../src/features/agent/posthog-capability";
import { getServerEnv } from "../src/lib/env";

config({ path: ".env.local" });

if (process.env.RUN_LIVE_POSTHOG_SMOKE !== "true") {
  console.error(
    "Live test is disabled. Set RUN_LIVE_POSTHOG_SMOKE=true explicitly.",
  );
  process.exit(1);
}

async function main() {
  const env = getServerEnv();
  if (env.AGENT_PROVIDER !== "azure") {
    throw new Error("Live smoke test requires AGENT_PROVIDER=azure");
  }

  const openai = new OpenAI({
    apiKey: env.AZURE_OPENAI_API_KEY,
    baseURL: `${env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, "")}/openai/v1/`,
  });
  const provider = new AzureResponsesProvider(
    openai as unknown as ResponsesClientLike,
    {
      deployment: env.AZURE_OPENAI_DEPLOYMENT,
      mcpTools: [
        createPostHogMcpTool({
          apiKey: env.POSTHOG_API_KEY,
          organizationId: env.POSTHOG_ORGANIZATION_ID,
          projectId: env.POSTHOG_PROJECT_ID,
        }),
      ],
    },
  );

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Live smoke test timed out")),
    90_000,
  );
  let failed = false;

  try {
    for await (const event of provider.run(
      {
        userMessage:
          "Return the PostHog project timezone and count pageview events from yesterday. Use an aggregate query and include the exact time range.",
        previousResponseId: null,
      },
      controller.signal,
    )) {
      if (event.type === "status") console.log(`[status] ${event.label}`);
      if (event.type === "tool_trace") console.log(`[tool] ${event.toolName}`);
      if (event.type === "text_delta") process.stdout.write(event.delta);
      if (event.type === "error") {
        failed = true;
        console.error(`\n[error] ${event.message}`);
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  if (failed) process.exitCode = 1;
  else process.stdout.write("\n");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Live smoke test failed");
  process.exitCode = 1;
});
