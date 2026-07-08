# AMIO Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only AMIO conversations capability that finds demo chat conversations, loads their full transcripts, and gives the analytics agent a normalized transcript analytics toolset.

**Architecture:** Implement a server-side AMIO analytics client plus a pure transcript normalizer and orchestration service, then expose that service to Azure Responses as a small internal tool family. Keep the capability pinned to the fixed demo bot, bounded by explicit date windows, and limited by conversation count rather than per-message truncation.

**Tech Stack:** Next.js, TypeScript, Azure OpenAI Responses API, Zod, Vitest

## Global Constraints

- Scope is fixed to `botId=6950785430289573256`.
- Every tool call requires `dateFrom` and `dateTo`.
- Full transcripts must be preserved; no per-conversation message truncation is allowed.
- The server may cap only the number of conversations in a batch, initially `50`.
- The Azure provider currently understands hosted MCP tools, so this work must add first-class support for internal function tools without regressing existing MCP connectors.
- `amio-search-conversations` returns only `contactIds`, `summary`, and `truncated`.
- `amio-fetch-conversation-transcripts` accepts the same filters as search and returns `transcripts`, `summary`, `truncated`, `failedContactIds`, and `warnings`.
- `amio-analyze-conversations-batch` returns the fetch payload plus deterministic aggregate counts.

---

### Task 1: Add AMIO configuration and capability registration

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `src/features/agent/container.ts`
- Modify: `src/features/agent/capability-registry.ts`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: existing `parseServerEnv(input)` and `AzureResponsesProvider` tool registration
- Produces: `getServerEnv()` values for `AMIO_API_BASE_URL`, `AMIO_API_KEY`, and `AMIO_MAX_CONVERSATIONS`

- [ ] **Step 1: Write the failing env test**

```ts
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

describe("parseServerEnv amio config", () => {
  it("accepts optional AMIO config for the azure provider", () => {
    const env = parseServerEnv({
      AGENT_PROVIDER: "azure",
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
      AZURE_OPENAI_API_KEY: "secret",
      AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
      POSTHOG_API_KEY: "phx",
      POSTHOG_PROJECT_ID: "1",
      STRIPE_API_KEY: "rk_live_test",
      AMIO_API_BASE_URL: "https://chatbot-engine.amio.io",
      AMIO_API_KEY: "amio-key",
      AMIO_MAX_CONVERSATIONS: "50",
    });

    expect(env.AGENT_PROVIDER).toBe("azure");
    expect(env.AMIO_API_BASE_URL).toBe("https://chatbot-engine.amio.io");
    expect(env.AMIO_API_KEY).toBe("amio-key");
    expect(env.AMIO_MAX_CONVERSATIONS).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/env.test.ts`
Expected: FAIL because the AMIO environment properties are not defined in `parseServerEnv`.

- [ ] **Step 3: Extend server env parsing**

```ts
AMIO_API_BASE_URL: z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
),
AMIO_API_KEY: z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
),
AMIO_MAX_CONVERSATIONS: z.preprocess(
  (value) => (value === "" || value == null ? undefined : Number(value)),
  z.number().int().positive().max(200).optional(),
),
```

- [ ] **Step 4: Register the new capability only when configured**

```ts
...(env.AMIO_API_KEY
  ? [
      createAmioConversationsTool({
        apiKey: env.AMIO_API_KEY,
        baseUrl: env.AMIO_API_BASE_URL ?? "https://chatbot-engine.amio.io",
        botId: "6950785430289573256",
        maxConversations: env.AMIO_MAX_CONVERSATIONS ?? 50,
      }),
    ]
  : []),
```

- [ ] **Step 5: Document env values and connector scope**

```env
AMIO_API_BASE_URL=https://chatbot-engine.amio.io
AMIO_API_KEY=
AMIO_MAX_CONVERSATIONS=50
```

- [ ] **Step 6: Run tests to verify the env change passes**

Run: `npm test -- src/lib/env.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add .env.example README.md src/lib/env.ts src/lib/env.test.ts src/features/agent/container.ts src/features/agent/capability-registry.ts
git commit -m "feat: configure amio conversations capability"
```

### Task 2: Build the AMIO analytics client

**Files:**
- Create: `src/features/amio-conversations/amio-conversations-api.ts`
- Create: `src/features/amio-conversations/amio-conversations-api.test.ts`

**Interfaces:**
- Consumes: global `fetch`
- Produces: `AmioConversationsApi` with methods:
  - `searchConversations(input: SearchFilters): Promise<SearchResponse>`
  - `getConversationHistory(contactId: string): Promise<HistoryEvent[]>`
  - `getConversationRequests(contactId: string): Promise<RequestRecord[]>`

- [ ] **Step 1: Write the failing API client test**

```ts
import { describe, expect, it, vi } from "vitest";
import { AmioConversationsApi } from "./amio-conversations-api";

describe("AmioConversationsApi", () => {
  it("loads paginated history until has_next is false", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            history_events: [{ id: "evt_1", timestamp: "2026-07-01T10:00:00.000Z", type: "message", data: {} }],
            cursor: { next: "evt_1", has_next: true },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            history_events: [{ id: "evt_2", timestamp: "2026-07-01T10:01:00.000Z", type: "message", data: {} }],
            cursor: { next: null, has_next: false },
          }),
        ),
      );

    const api = new AmioConversationsApi({
      apiKey: "amio-key",
      baseUrl: "https://chatbot-engine.amio.io",
      fetch: fetchMock,
      botId: "6950785430289573256",
    });

    const result = await api.getConversationHistory("contact-1");

    expect(result.map((item) => item.id)).toEqual(["evt_1", "evt_2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/amio-conversations/amio-conversations-api.test.ts`
Expected: FAIL because the AMIO API client does not exist yet.

- [ ] **Step 3: Implement the read-only API client**

```ts
export class AmioConversationsApi {
  constructor(private readonly config: AmioApiConfig) {}

  async searchConversations(input: SearchFilters): Promise<SearchResponse> {
    const url = new URL("/analytics/conversations", this.config.baseUrl);
    url.searchParams.set("botIds", this.config.botId);
    url.searchParams.set("dateFrom", input.dateFrom);
    url.searchParams.set("dateTo", input.dateTo);
    if (input.maxConversations) url.searchParams.set("max", String(input.maxConversations));
    return this.getJson<SearchResponse>(url);
  }

  async getConversationHistory(contactId: string): Promise<HistoryEvent[]> {
    const items: HistoryEvent[] = [];
    let cursor: string | null = null;

    do {
      const url = new URL(`/analytics/conversations/${contactId}/history`, this.config.baseUrl);
      url.searchParams.set("max", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      const page = await this.getJson<HistoryPage>(url);
      items.push(...page.history_events);
      cursor = page.cursor.has_next ? page.cursor.next : null;
    } while (cursor);

    return items;
  }
}
```

- [ ] **Step 4: Add request loading and shared error handling**

```ts
async getConversationRequests(contactId: string): Promise<RequestRecord[]> {
  const url = new URL(`/analytics/conversations/${contactId}/requests`, this.config.baseUrl);
  const result = await this.getJson<{ requests: RequestRecord[] }>(url);
  return result.requests;
}

private async getJson<T>(url: URL): Promise<T> {
  const response = await this.config.fetch(url, {
    headers: { Authorization: `Bearer ${this.config.apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`AMIO request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
```

- [ ] **Step 5: Run tests to verify the API client passes**

Run: `npm test -- src/features/amio-conversations/amio-conversations-api.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/amio-conversations/amio-conversations-api.ts src/features/amio-conversations/amio-conversations-api.test.ts
git commit -m "feat: add amio conversations api client"
```

### Task 3: Normalize AMIO history into transcripts

**Files:**
- Create: `src/features/amio-conversations/transcript-normalizer.ts`
- Create: `src/features/amio-conversations/transcript-normalizer.test.ts`

**Interfaces:**
- Consumes:
  - `normalizeTranscript(input: { contactId: string; history: HistoryEvent[]; requests: RequestRecord[]; includeSystemEvents: boolean; })`
- Produces:
  - `NormalizedTranscript`
  - `NormalizedMessage`

- [ ] **Step 1: Write the failing normalizer test**

```ts
import { describe, expect, it } from "vitest";
import { normalizeTranscript } from "./transcript-normalizer";

describe("normalizeTranscript", () => {
  it("maps received, quick reply, and remote action events", () => {
    const transcript = normalizeTranscript({
      contactId: "contact-1",
      includeSystemEvents: true,
      requests: [
        {
          id: "req_1",
          message_id: "msg_1",
          outcome: "REQUEST_STARTED",
          intent: "order_tracking",
          customer_message: "Kde je objednavka?",
          created_on: "2026-07-01T10:00:00.000Z",
        },
      ],
      history: [
        { id: "evt_1", timestamp: "2026-07-01T10:00:00.000Z", type: "message", data: { direction: "received", content: { payload: "Kde je objednavka?" }, message_id: "msg_1" } },
        { id: "evt_2", timestamp: "2026-07-01T10:01:00.000Z", type: "quick_reply", data: { payload: "TRACK", text: "Track order" } },
        { id: "evt_3", timestamp: "2026-07-01T10:02:00.000Z", type: "remote_action", data: { requestData: { id: 1 } } },
      ],
    });

    expect(transcript.messages.map((item) => [item.role, item.kind])).toEqual([
      ["user", "text"],
      ["user", "button_click"],
      ["system", "remote_action"],
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/amio-conversations/transcript-normalizer.test.ts`
Expected: FAIL because the normalizer does not exist yet.

- [ ] **Step 3: Implement the request map and event mapping**

```ts
const requestByMessageId = new Map(
  input.requests.map((request) => [request.message_id, request]),
);

function normalizeEvent(event: HistoryEvent): NormalizedMessage | null {
  if (event.type === "quick_reply" || event.type === "postback") {
    return {
      id: event.id,
      timestamp: event.timestamp,
      role: "user",
      kind: "button_click",
      text: readLabel(event.data),
      payload: readPayload(event.data),
    };
  }
  if (event.type === "remote_action") {
    return {
      id: event.id,
      timestamp: event.timestamp,
      role: "system",
      kind: "remote_action",
    };
  }
  return null;
}
```

- [ ] **Step 4: Implement user, assistant, and system filtering**

```ts
if (direction === "received") {
  return {
    id: event.id,
    timestamp: event.timestamp,
    role: "user",
    kind: "text",
    text,
    messageId,
    requestId: request?.id ?? null,
    outcome: request?.outcome ?? null,
    intent: request?.intent ?? null,
  };
}

if (!includeSystemEvents && normalized.role === "system") {
  return null;
}
```

- [ ] **Step 5: Run tests to verify the normalizer passes**

Run: `npm test -- src/features/amio-conversations/transcript-normalizer.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/amio-conversations/transcript-normalizer.ts src/features/amio-conversations/transcript-normalizer.test.ts
git commit -m "feat: normalize amio conversation transcripts"
```

### Task 4: Build the conversation search and batch analysis service

**Files:**
- Create: `src/features/amio-conversations/conversation-search-service.ts`
- Create: `src/features/amio-conversations/conversation-search-service.test.ts`

**Interfaces:**
- Consumes:
  - `AmioConversationsApi`
  - `normalizeTranscript(...)`
- Produces:
  - `searchConversations(input: ToolFilters): Promise<SearchToolResult>`
  - `fetchConversationTranscripts(input: ToolFilters): Promise<FetchToolResult>`
  - `analyzeConversationBatch(input: ToolFilters): Promise<AnalyzeToolResult>`
  - `loadCandidateConversations(input: ToolFilters): Promise<{ selected: CandidateConversation[]; totalAvailable: number }>`

- [ ] **Step 1: Write the failing service test**

```ts
import { describe, expect, it, vi } from "vitest";
import { createConversationSearchService } from "./conversation-search-service";

describe("conversation search service", () => {
  it("returns aggregate counts and records failed contacts without truncating messages", async () => {
    const api = {
      searchConversations: vi.fn().mockResolvedValue({
        conversations: [
          { contact_id: "c1", initial_request: "Ahoj", outcomes: ["REQUEST_STARTED"], last_request_timestamp: "2026-07-01T10:00:00.000Z" },
          { contact_id: "c2", initial_request: "Pomoc", outcomes: ["REQUEST_STARTED"], last_request_timestamp: "2026-07-01T10:05:00.000Z" },
        ],
      }),
      getConversationHistory: vi
        .fn()
        .mockResolvedValueOnce([{ id: "evt_1", timestamp: "2026-07-01T10:00:00.000Z", type: "message", data: { direction: "received", content: { payload: "Ahoj" } } }])
        .mockRejectedValueOnce(new Error("boom")),
      getConversationRequests: vi.fn().mockResolvedValue([]),
    };

    const service = createConversationSearchService({ api, maxConversations: 50 });
    const result = await service.analyzeConversationBatch({
      dateFrom: "2026-07-01T00:00:00.000Z",
      dateTo: "2026-07-02T00:00:00.000Z",
      includeSystemEvents: false,
    });

    expect(result.summary.loadedConversationCount).toBe(1);
    expect(result.failedContactIds).toEqual(["c2"]);
    expect(result.aggregate.totalMessageCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/amio-conversations/conversation-search-service.test.ts`
Expected: FAIL because the service does not exist yet.

- [ ] **Step 3: Implement search-only result shaping**

```ts
async function searchConversations(input: ToolFilters): Promise<SearchToolResult> {
  const { selected, totalAvailable } = await loadCandidateConversations(input);
  return {
    contactIds: selected.map((item) => item.contactId),
    summary: {
      conversationCount: selected.length,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    },
    truncated: buildTruncated(selected.length, totalAvailable),
  };
}
```

- [ ] **Step 4: Implement transcript fetch with partial failure handling**

```ts
for (const conversation of conversations) {
  try {
    const [history, requests] = await Promise.all([
      api.getConversationHistory(conversation.contactId),
      api.getConversationRequests(conversation.contactId),
    ]);
    transcripts.push(
      normalizeTranscript({
        contactId: conversation.contactId,
        initialRequest: conversation.initialRequest,
        lastRequestTimestamp: conversation.lastRequestTimestamp,
        history,
        requests,
        includeSystemEvents: input.includeSystemEvents ?? false,
      }),
    );
  } catch {
    failedContactIds.push(conversation.contactId);
  }
}
```

- [ ] **Step 5: Implement deterministic aggregate counts**

```ts
const aggregate = {
  conversationCount: transcripts.length,
  totalMessageCount: countMessages(transcripts),
  userMessageCount: countRole(transcripts, "user"),
  assistantMessageCount: countRole(transcripts, "assistant"),
  buttonClickCount: countKind(transcripts, "button_click"),
  systemEventCount: countRole(transcripts, "system"),
  conversationsWithButtonClicks: countConversationsWithKind(transcripts, "button_click"),
  conversationsWithRemoteActions: countConversationsWithKind(transcripts, "remote_action"),
  messagesPerConversationAvg: transcripts.length ? countMessages(transcripts) / transcripts.length : 0,
  outcomesBreakdown: countOutcomes(transcripts),
  messageKindBreakdown: countKinds(transcripts),
};
```

- [ ] **Step 6: Run tests to verify the service passes**

Run: `npm test -- src/features/amio-conversations/conversation-search-service.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/amio-conversations/conversation-search-service.ts src/features/amio-conversations/conversation-search-service.test.ts
git commit -m "feat: add amio conversation analysis service"
```

### Task 5: Expose the AMIO tools to Azure Responses

**Files:**
- Create: `src/features/agent/amio-conversations-capability.ts`
- Modify: `src/features/agent/azure-responses-provider.ts`
- Modify: `src/features/agent/instructions.ts`
- Test: `src/features/agent/azure-responses-provider.test.ts`

**Interfaces:**
- Consumes:
  - `createConversationSearchService(...)`
  - existing Responses API tool registration flow
- Produces:
  - `createAmioConversationsTools(config): InternalFunctionTool[]`
  - provider support for `ConfiguredTool = HostedMcpTool | InternalFunctionTool`

- [ ] **Step 1: Write the failing provider test**

```ts
import { describe, expect, it } from "vitest";
import { buildResponseTools } from "./azure-responses-provider";

describe("buildResponseTools", () => {
  it("includes the amio conversation tools when configured", async () => {
    const tools = await buildResponseTools({
      staticTools: createAmioConversationsTools(fakeConfig),
      dynamicTools: [],
    });

    expect(tools.some((tool) => tool.name === "amio-analyze-conversations-batch")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/agent/azure-responses-provider.test.ts`
Expected: FAIL because AMIO tool registration is not implemented.

- [ ] **Step 3: Implement the AMIO tool definitions**

```ts
export function createAmioConversationsTools(
  config: AmioCapabilityConfig,
): InternalFunctionTool[] {
  return [
    {
      type: "function",
      name: "amio-search-conversations",
      description: "Find demo AMIO conversations in a required date window and return only contact IDs plus summary metadata.",
      parameters: searchConversationsSchema,
      execute: (input) => service.searchConversations(input),
    },
    {
      type: "function",
      name: "amio-fetch-conversation-transcripts",
      description: "Find demo AMIO conversations in a required date window and return their full normalized transcripts.",
      parameters: fetchConversationTranscriptsSchema,
      execute: (input) => service.fetchConversationTranscripts(input),
    },
    {
      type: "function",
      name: "amio-analyze-conversations-batch",
      description: "Find demo AMIO conversations in a required date window, load full transcripts, and return deterministic transcript aggregates.",
      parameters: analyzeConversationBatchSchema,
      execute: (input) => service.analyzeConversationBatch(input),
    },
  ];
}
```

- [ ] **Step 4: Teach the agent when to use AMIO conversations**

```ts
- AMIO Conversations for demo chatbot transcript history, button clicks, and conversation-level analysis.
```

- [ ] **Step 5: Add a progress label for the AMIO capability**

```ts
if (serverLabel === "amio_conversations") return "v AMIO konverzacich";
```

- [ ] **Step 6: Run provider tests to verify tool registration passes**

Run: `npm test -- src/features/agent/azure-responses-provider.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/agent/amio-conversations-capability.ts src/features/agent/azure-responses-provider.ts src/features/agent/azure-responses-provider.test.ts src/features/agent/instructions.ts
git commit -m "feat: expose amio conversation tools to the agent"
```

### Task 6: Verify the capability end-to-end and document usage

**Files:**
- Modify: `README.md`
- Modify: `scripts/` only if a dedicated smoke script is needed

**Interfaces:**
- Consumes: completed AMIO capability, existing local app entrypoints
- Produces: verified docs and optional smoke command for live operator checks

- [ ] **Step 1: Add manual acceptance prompts**

```md
10. Najdi demo chat konverzace za posledni tyden a shrn nejcastejsi typy interakci.
11. Kolik z vybranych konverzaci obsahovalo kliknuti na tlacitko?
12. Vrat mi transcripty bez systemovych eventu za vcerejsek.
```

- [ ] **Step 2: Run focused automated verification**

Run: `npm test -- src/lib/env.test.ts src/features/amio-conversations/amio-conversations-api.test.ts src/features/amio-conversations/transcript-normalizer.test.ts src/features/amio-conversations/conversation-search-service.test.ts src/features/agent/azure-responses-provider.test.ts`
Expected: PASS

- [ ] **Step 3: Run repository safety checks**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `git diff --check`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document amio conversations capability"
```
