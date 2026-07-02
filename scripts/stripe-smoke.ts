import { config } from "dotenv";
import OpenAI from "openai";
import {
  AzureResponsesProvider,
  type ResponsesClientLike,
} from "../src/features/agent/azure-responses-provider";
import { createStripeMcpTool } from "../src/features/agent/stripe-capability";
import { getServerEnv } from "../src/lib/env";

config({ path: ".env.local" });

if (process.env.RUN_LIVE_STRIPE_SMOKE !== "true") {
  console.error(
    "Live test is disabled. Set RUN_LIVE_STRIPE_SMOKE=true explicitly.",
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
        createStripeMcpTool({
          apiKey: env.STRIPE_API_KEY,
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
  let completed = false;
  const calledTools = new Set<string>();

  try {
    for await (const event of provider.run(
      {
        userMessage:
          "Call get_stripe_account_info. Then use stripe_api_search, stripe_api_details, and stripe_api_read to execute the Stripe GET balance operation. Return only the account country, default currency, and aggregate available and pending balance by currency. Do not search documentation. Do not return customer records or IDs.",
        previousResponseId: null,
      },
      controller.signal,
    )) {
      if (event.type === "status") console.log(`[status] ${event.label}`);
      if (event.type === "tool_trace") {
        calledTools.add(event.toolName);
        console.log(`[tool] ${event.toolName}`);
      }
      if (event.type === "text_delta") process.stdout.write(event.delta);
      if (event.type === "completed") completed = true;
      if (event.type === "error") {
        failed = true;
        console.error(`\n[error] ${event.message}`);
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  if (!completed) {
    failed = true;
    console.error("\n[error] Azure response did not complete.");
  }
  for (const requiredTool of [
    "stripe:get_stripe_account_info",
    "stripe:stripe_api_read",
  ]) {
    if (!calledTools.has(requiredTool)) {
      failed = true;
      console.error(`\n[error] Required tool was not called: ${requiredTool}`);
    }
  }

  if (failed) process.exitCode = 1;
  else process.stdout.write("\n");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Live smoke test failed");
  process.exitCode = 1;
});
