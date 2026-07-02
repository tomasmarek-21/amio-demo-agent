# Stripe Read-Only Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production Stripe read access to the existing PostHog analytics chat through Stripe's official remote MCP server, with two independent read-only security boundaries.

**Architecture:** A new Stripe capability module constructs a tightly allowlisted MCP tool using a restricted live key. The Azure Responses provider accepts an array of MCP tools, routes both PostHog and Stripe through one model response, and labels status and evidence events by source. Existing session storage and UI remain unchanged.

**Tech Stack:** Next.js 16, TypeScript, Azure OpenAI Responses API, Stripe remote MCP, PostHog remote MCP, Zod, Vitest, Playwright

---

## File map

- Create `src/features/agent/stripe-capability.ts`: construct the official Stripe MCP tool and own its read-only allowlist.
- Create `src/features/agent/stripe-capability.test.ts`: prove that only approved read operations enter model context.
- Modify `src/lib/env.ts` and `src/lib/env.test.ts`: require a production restricted Stripe key for the Azure provider.
- Modify `src/features/agent/azure-responses-provider.ts` and its test: accept multiple MCP tools, raise the bounded call ceiling, and label events by source.
- Modify `src/features/agent/container.ts`: register PostHog and Stripe together.
- Modify `src/features/agent/instructions.ts`: describe source selection, cross-source analysis, privacy, and mutation prohibitions.
- Modify `.env.example` and `README.md`: document setup and the security model.
- Create `scripts/stripe-smoke.ts` and modify `package.json`: add an opt-in live read test.
- Preserve the current SQLite schema, API routes, and chat components.

### Task 1: Commit the completed PostHog baseline

**Files:**
- Modify: `README.md`
- Modify: `src/features/agent/azure-responses-provider.ts`
- Modify: `src/features/agent/azure-responses-provider.test.ts`
- Modify: `src/features/agent/posthog-capability.ts`
- Modify: `src/features/agent/posthog-capability.test.ts`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`

- [ ] **Step 1: Verify the existing approved changes**

Run:

```bash
npm test -- src/lib/env.test.ts src/features/agent/posthog-capability.test.ts src/features/agent/azure-responses-provider.test.ts
```

Expected: all focused tests pass, covering optional PostHog organization ID, all read-only PostHog feature groups, and the 25-call ceiling.

- [ ] **Step 2: Commit only the completed baseline files**

```bash
git add README.md src/lib/env.ts src/lib/env.test.ts src/features/agent/posthog-capability.ts src/features/agent/posthog-capability.test.ts src/features/agent/azure-responses-provider.ts src/features/agent/azure-responses-provider.test.ts
git commit -m "feat: expand read-only PostHog access"
```

### Task 2: Validate the Stripe restricted key

**Files:**
- Modify: `src/lib/env.test.ts`
- Modify: `src/lib/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing environment tests**

Add `STRIPE_API_KEY: "rk_live_example"` to the shared `valid` fixture and add:

```ts
it("requires a production restricted Stripe key", () => {
  expect(() =>
    parseServerEnv({ ...valid, STRIPE_API_KEY: "sk_live_secret" }),
  ).toThrow(/STRIPE_API_KEY/);
  expect(() =>
    parseServerEnv({ ...valid, STRIPE_API_KEY: "rk_test_secret" }),
  ).toThrow(/STRIPE_API_KEY/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- src/lib/env.test.ts
```

Expected: FAIL because `STRIPE_API_KEY` is not yet validated.

- [ ] **Step 3: Implement minimal validation**

Add this field to the Azure branch of `serverEnvSchema`:

```ts
STRIPE_API_KEY: z.string().regex(
  /^rk_live_/,
  "STRIPE_API_KEY must be a production restricted key",
),
```

Add this line to `.env.example`:

```dotenv
STRIPE_API_KEY=
```

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
npm test -- src/lib/env.test.ts
```

Expected: all environment tests pass; the fake provider still requires no production secrets.

- [ ] **Step 5: Commit**

```bash
git add .env.example src/lib/env.ts src/lib/env.test.ts
git commit -m "feat: validate Stripe restricted key"
```

### Task 3: Add the allowlisted Stripe MCP capability

**Files:**
- Create: `src/features/agent/stripe-capability.test.ts`
- Create: `src/features/agent/stripe-capability.ts`

- [ ] **Step 1: Write the failing capability test**

Create `src/features/agent/stripe-capability.test.ts`:

```ts
import { expect, it } from "vitest";
import {
  STRIPE_READ_ONLY_TOOLS,
  createStripeMcpTool,
} from "./stripe-capability";

it("exposes only Stripe read operations", () => {
  const tool = createStripeMcpTool({ apiKey: "rk_live_secret" });

  expect(tool).toMatchObject({
    type: "mcp",
    server_label: "stripe",
    server_url: "https://mcp.stripe.com",
    authorization: "rk_live_secret",
    require_approval: "never",
    allowed_tools: STRIPE_READ_ONLY_TOOLS,
  });
  expect(STRIPE_READ_ONLY_TOOLS).toContain("stripe_api_search");
  expect(STRIPE_READ_ONLY_TOOLS).toContain("stripe_api_details");
  expect(STRIPE_READ_ONLY_TOOLS).toContain("stripe_api_read");
  expect(STRIPE_READ_ONLY_TOOLS).not.toContain("stripe_api_write");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- src/features/agent/stripe-capability.test.ts
```

Expected: FAIL because `stripe-capability.ts` does not exist.

- [ ] **Step 3: Implement the Stripe capability**

Create `src/features/agent/stripe-capability.ts`:

```ts
export const STRIPE_READ_ONLY_TOOLS = [
  "search_stripe_documentation",
  "get_stripe_account_info",
  "search_stripe_resources",
  "fetch_stripe_resources",
  "stripe_api_search",
  "stripe_api_details",
  "stripe_api_read",
] as const;

export interface StripeCapabilityConfig {
  apiKey: string;
}

export function createStripeMcpTool(config: StripeCapabilityConfig) {
  return {
    type: "mcp" as const,
    server_label: "stripe",
    server_description:
      "Read-only Stripe billing, revenue, customer, invoice, payment, and subscription data.",
    server_url: "https://mcp.stripe.com",
    authorization: config.apiKey,
    allowed_tools: [...STRIPE_READ_ONLY_TOOLS],
    require_approval: "never" as const,
  };
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
npm test -- src/features/agent/stripe-capability.test.ts
```

Expected: one passing test.

- [ ] **Step 5: Commit**

```bash
git add src/features/agent/stripe-capability.ts src/features/agent/stripe-capability.test.ts
git commit -m "feat: add read-only Stripe MCP capability"
```

### Task 4: Send both MCP servers through Azure Responses

**Files:**
- Modify: `src/features/agent/azure-responses-provider.test.ts`
- Modify: `src/features/agent/azure-responses-provider.ts`

- [ ] **Step 1: Write failing multi-server expectations**

Import `createStripeMcpTool`, change provider setup from `mcpTool` to:

```ts
mcpTools: [
  createPostHogMcpTool({
    apiKey: "posthog-secret",
    organizationId: "org",
    projectId: "project",
  }),
  createStripeMcpTool({ apiKey: "rk_live_secret" }),
],
```

Give the fake MCP events `server_label: "stripe"` and make the completed item:

```ts
{
  type: "mcp_call",
  server_label: "stripe",
  name: "stripe_api_read",
  arguments: '{"stripe_api_operation_id":"GetSubscriptions","parameters":{"limit":10}}',
  output: '{"data":[]}',
  status: "completed",
  error: null,
}
```

Update expectations:

```ts
expect(events).toContainEqual({
  type: "status",
  label: "Analyzuji data ve Stripe",
});
expect(events).toContainEqual(
  expect.objectContaining({
    type: "tool_trace",
    toolName: "stripe:stripe_api_read",
  }),
);
expect(create).toHaveBeenCalledWith(
  expect.objectContaining({
    tools: expect.arrayContaining([
      expect.objectContaining({ server_label: "posthog" }),
      expect.objectContaining({ server_label: "stripe" }),
    ]),
    max_tool_calls: 30,
  }),
  expect.objectContaining({ signal: expect.any(AbortSignal) }),
);
```

Change the repeated-failure expectation to:

```ts
{
  type: "error",
  message: "MCP dotaz selhal více než dvakrát.",
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- src/features/agent/azure-responses-provider.test.ts
```

Expected: FAIL because the provider accepts one tool, emits PostHog-only labels, and caps calls at 25.

- [ ] **Step 3: Generalize provider configuration**

Import both capability types and define:

```ts
type McpTool =
  | ReturnType<typeof createPostHogMcpTool>
  | ReturnType<typeof createStripeMcpTool>;

export interface AzureResponsesProviderConfig {
  deployment: string;
  mcpTools: McpTool[];
}
```

Use the full array and new ceiling in `createStream`:

```ts
tools: this.config.mcpTools,
max_tool_calls: 30,
```

Add:

```ts
function sourceLocation(serverLabel: string) {
  if (serverLabel === "stripe") return "ve Stripe";
  if (serverLabel === "posthog") return "v PostHogu";
  return "v připojeném zdroji";
}
```

For MCP list and call progress events, use `stringValue(event.server_label)`:

```ts
const source = sourceLocation(stringValue(event.server_label));
yield {
  type: "status",
  label:
    type === "response.mcp_list_tools.in_progress"
      ? `Načítám nástroje ${source}`
      : `Analyzuji data ${source}`,
};
```

Generalize the failure message:

```ts
message: "MCP dotaz selhal více než dvakrát.",
```

Prefix completed trace names in `normalizeToolTrace`:

```ts
const serverLabel = stringValue(item.server_label);
const toolName = stringValue(item.name) || "unknown";

return {
  type: "tool_trace",
  toolName: serverLabel ? `${serverLabel}:${toolName}` : toolName,
  // retain the existing sanitized fields
};
```

- [ ] **Step 4: Run provider and PostHog regression tests**

Run:

```bash
npm test -- src/features/agent/azure-responses-provider.test.ts src/features/agent/posthog-capability.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/agent/azure-responses-provider.ts src/features/agent/azure-responses-provider.test.ts
git commit -m "feat: route multiple MCP data sources"
```

### Task 5: Register Stripe and add source-aware instructions

**Files:**
- Modify: `src/features/agent/container.ts`
- Modify: `src/features/agent/instructions.ts`
- Modify: `src/features/agent/azure-responses-provider.test.ts`

- [ ] **Step 1: Add a failing instruction assertion**

Import `ANALYTICS_INSTRUCTIONS` in the provider test and add:

```ts
it("instructs the model to keep Stripe read-only and choose evidence by source", () => {
  expect(ANALYTICS_INSTRUCTIONS).toContain("Stripe");
  expect(ANALYTICS_INSTRUCTIONS).toContain("PostHog");
  expect(ANALYTICS_INSTRUCTIONS).toContain("create, update, cancel, refund, or delete");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- src/features/agent/azure-responses-provider.test.ts
```

Expected: FAIL because current instructions describe only PostHog.

- [ ] **Step 3: Register both tools**

In `container.ts`, import `createStripeMcpTool` and configure:

```ts
mcpTools: [
  createPostHogMcpTool({
    apiKey: env.POSTHOG_API_KEY,
    organizationId: env.POSTHOG_ORGANIZATION_ID,
    projectId: env.POSTHOG_PROJECT_ID,
  }),
  createStripeMcpTool({
    apiKey: env.STRIPE_API_KEY,
  }),
],
```

- [ ] **Step 4: Replace the source-specific instructions**

Update `ANALYTICS_INSTRUCTIONS` to include:

```ts
You are AMIO's read-only business analytics agent with access to PostHog and Stripe.

Use Stripe for billing, revenue, customer, invoice, payment, product, price,
dispute, and subscription facts. Use PostHog for website and product behavior.
Use both when the user asks for a comparison, and keep their date ranges and
definitions aligned.

For Stripe claims, state the analyzed date range, currency, and whether values
are gross, refunded, disputed, paid, open, or recurring where relevant. Prefer
aggregates. Never reveal emails, payment details, invoice URLs, raw customer
IDs, or full object payloads.

Never create, update, cancel, refund, or delete anything in Stripe or PostHog.
```

Retain the existing requirements for language matching, operational
definitions, schema discovery, bounded queries, retries, untrusted content,
and honest limitations.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
npm test -- src/features/agent/azure-responses-provider.test.ts src/lib/env.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/agent/container.ts src/features/agent/instructions.ts src/features/agent/azure-responses-provider.test.ts
git commit -m "feat: add Stripe to analytics agent"
```

### Task 6: Add an opt-in live Stripe smoke test and documentation

**Files:**
- Create: `scripts/stripe-smoke.ts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Create the live smoke script**

Create `scripts/stripe-smoke.ts` using the same environment loading, Azure
client construction, 90-second timeout, sanitized event printing, and explicit
opt-in pattern as `scripts/posthog-smoke.ts`. Configure only the Stripe MCP
tool and require:

```ts
if (process.env.RUN_LIVE_STRIPE_SMOKE !== "true") {
  console.error(
    "Live test is disabled. Set RUN_LIVE_STRIPE_SMOKE=true explicitly.",
  );
  process.exit(1);
}
```

Use this aggregate prompt:

```ts
{
  userMessage:
    "Read the Stripe account identity and balance. Return only the account country, default currency, and aggregate available and pending balance by currency. Do not return customer records or IDs.",
  previousResponseId: null,
}
```

- [ ] **Step 2: Add the package script**

Add:

```json
"test:live:stripe": "tsx scripts/stripe-smoke.ts"
```

Keep the existing PostHog script unchanged.

- [ ] **Step 3: Update README setup and security sections**

Document:

- `STRIPE_API_KEY` must be a production `rk_live_` restricted key;
- Stripe live MCP access must be enabled by an administrator;
- only the seven explicitly listed read tools are imported;
- no Stripe account ID is required for a standard account;
- the agent now supports PostHog-only, Stripe-only, and cross-source questions;
- the live test command is:

```bash
RUN_LIVE_STRIPE_SMOKE=true npm run test:live:stripe
```

- [ ] **Step 4: Run static checks**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add README.md package.json scripts/stripe-smoke.ts
git commit -m "docs: add Stripe agent setup and smoke test"
```

### Task 7: Verify the complete application

**Files:**
- Test: all unit, integration, and E2E files

- [ ] **Step 1: Run the complete unit suite**

Run:

```bash
npm test
```

Expected: all test files pass with zero failures.

- [ ] **Step 2: Run type checking**

Run:

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: all application routes compile successfully.

- [ ] **Step 5: Run E2E**

Run:

```bash
npm run test:e2e
```

Expected: the session chat test passes.

- [ ] **Step 6: Verify the configured key without printing it**

Run a masked presence check that reports only `SET`, `EMPTY`, or
`INVALID_PREFIX`. Never print the value.

Expected: `STRIPE_API_KEY: SET`.

- [ ] **Step 7: Run the opt-in live Stripe read test**

Run:

```bash
RUN_LIVE_STRIPE_SMOKE=true npm run test:live:stripe
```

Expected: account and aggregate balance fields are returned, at least one
`stripe:` tool trace appears, and no key, customer email, or raw customer ID is
printed.

- [ ] **Step 8: Start the development server**

Run:

```bash
npm run dev
```

Expected: the application is ready at `http://localhost:3000`.

- [ ] **Step 9: Browser acceptance**

Refresh the existing app, create a new session, and submit:

```text
Jaké máme ve Stripe aktivní subscriptiony a jaký je jejich měsíční recurring revenue podle měny?
```

Expected: the UI streams source-specific status, shows sanitized
`stripe:stripe_api_read` evidence, and returns a read-only answer with a
date range, currency, and limitations.
