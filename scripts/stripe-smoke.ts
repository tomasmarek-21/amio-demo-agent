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

try {
  for await (const event of provider.run(
    {
      userMessage:
        "Read the Stripe account identity and balance. Return only the account country, default currency, and aggregate available and pending balance by currency. Do not return customer records or IDs.",
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
