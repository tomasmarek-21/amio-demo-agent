# AMIO Conversations Agent Design

## Goal

Give the AMIO analytics chatbot read-only access to demo chat conversation
history so it can find relevant conversations for a date range, load their
full transcripts, and analyze them with the model.

## Scope

The first version is limited to the AMIO demo chatbot with the fixed
`botId=6950785430289573256`. The model never supplies or overrides this bot ID.
All three tools require `dateFrom` and `dateTo` so every request stays bounded
to an explicit time window.

The server returns only lightweight deterministic summaries. Deeper
interpretation such as topic extraction, customer pain points, or
representative examples remains the model's responsibility after it receives
the normalized transcripts.

Full transcripts must be preserved. The application may limit the number of
conversations in a batch, but it must not truncate or summarize individual
conversation message histories.

## Architecture

The existing Next.js server adds a new internal `amio_conversations`
capability beside the current PostHog, Stripe, Supabase, and Notion sources.
This capability is not an external MCP server. Instead, the application calls
the AMIO analytics REST API directly, applies pagination, merges request
metadata with history events, and exposes a narrow tool contract to the model.

The feature is split into four focused server units:

- `src/features/amio-conversations/amio-conversations-api.ts`
  Read-only HTTP client for AMIO analytics endpoints.
- `src/features/amio-conversations/transcript-normalizer.ts`
  Pure normalization logic from `history_events` plus `requests` into a
  consistent transcript format.
- `src/features/amio-conversations/conversation-search-service.ts`
  Search, batch fetch, pagination, summary, aggregate, and partial-failure
  orchestration.
- `src/features/agent/amio-conversations-capability.ts`
  Tool definitions exposed to the Azure Responses API request.

The agent container registers this capability only when the AMIO environment is
configured. The browser and model never receive the API key.

## Data Sources

The capability uses the same AMIO backend flow as the current admin UI:

1. `GET /analytics/conversations`
2. `GET /analytics/conversations/:contactId/history`
3. `GET /analytics/conversations/:contactId/requests`

The service first finds candidate conversations for the fixed demo bot inside
the requested time window. It then fetches the full history and request
metadata for each selected contact, merges them by `message_id`, and returns a
normalized transcript.

## Tool Contract

### `amio-search-conversations`

**Purpose:** Find matching demo conversations without loading transcript
content.

**Input:**

- `dateFrom`: ISO timestamp, required
- `dateTo`: ISO timestamp, required
- `maxConversations`: optional requested count, capped server-side
- `requestOutcomes`: optional string array
- `ignoreOutcomes`: optional string array
- `answerId`: optional string
- `channelIds`: optional string array
- `textQuery`: optional case-insensitive local filter over `initialRequest`

**Output:**

- `contactIds`: ordered string array
- `summary`:
  - `conversationCount`
  - `dateFrom`
  - `dateTo`
- `truncated`:
  - `conversationsTruncated`
  - `omittedConversationCount`

This tool returns only contact IDs plus summary metadata. It does not return
conversation previews beyond what is needed to support the summary.

### `amio-fetch-conversation-transcripts`

**Purpose:** Search matching conversations and return their full normalized
transcripts.

**Input:**

- `dateFrom`: ISO timestamp, required
- `dateTo`: ISO timestamp, required
- `maxConversations`: optional requested count, capped server-side
- `requestOutcomes`: optional string array
- `ignoreOutcomes`: optional string array
- `answerId`: optional string
- `channelIds`: optional string array
- `textQuery`: optional case-insensitive local filter over `initialRequest`
- `includeSystemEvents`: optional boolean, default `false`

**Output:**

- `transcripts`: array of normalized conversation transcripts
- `summary`:
  - `conversationCount`
  - `loadedConversationCount`
  - `failedConversationCount`
  - `dateFrom`
  - `dateTo`
- `truncated`:
  - `conversationsTruncated`
  - `omittedConversationCount`
- `failedContactIds`: string array
- `warnings`: string array

This tool does not accept raw `contactIds`. It repeats the same filter contract
as search so the model can directly ask for transcripts over a time-bounded
slice without manually orchestrating a second request.

### `amio-analyze-conversations-batch`

**Purpose:** Primary tool for transcript analytics use cases.

**Input:**

- same input contract as `amio-fetch-conversation-transcripts`

**Output:**

- `contactIds`: ordered string array
- `summary`:
  - `conversationCount`
  - `loadedConversationCount`
  - `failedConversationCount`
  - `dateFrom`
  - `dateTo`
- `transcripts`: array of normalized conversation transcripts
- `aggregate`:
  - `conversationCount`
  - `totalMessageCount`
  - `userMessageCount`
  - `assistantMessageCount`
  - `buttonClickCount`
  - `systemEventCount`
  - `conversationsWithButtonClicks`
  - `conversationsWithRemoteActions`
  - `messagesPerConversationAvg`
  - `outcomesBreakdown`
  - `messageKindBreakdown`
- `truncated`:
  - `conversationsTruncated`
  - `omittedConversationCount`
- `failedContactIds`: string array
- `warnings`: string array

This is the default orchestration tool for prompts such as "find conversations
from last week and tell me what happened". The returned aggregate stays basic
and deterministic; the model is expected to generate the final analysis.

## Transcript Shape

Each normalized transcript contains conversation metadata and a full ordered
message list:

```json
{
  "contactId": "7479168497089266147",
  "initialRequest": "Kde je moje objednavka?",
  "lastRequestTimestamp": "2026-07-04T13:49:16.000Z",
  "messages": [
    {
      "id": "evt_1",
      "timestamp": "2026-07-04T13:45:10.000Z",
      "role": "user",
      "kind": "text",
      "text": "Kde je moje objednavka?",
      "messageId": "msg_123",
      "requestId": "req_456",
      "outcome": "REQUEST_STARTED",
      "intent": "order_tracking"
    }
  ]
}
```

The normalizer maps AMIO events as follows:

- `direction=received` -> `role=user`, `kind=text`
- standard outbound messages -> `role=assistant`, `kind=text`
- `quick_reply` and `postback` -> `role=user`, `kind=button_click`
- `remote_action` -> `role=system`, `kind=remote_action`
- `chat_gpt_action` -> `role=system`, `kind=llm_action`
- `event`, `bot_wake_up`, and `answer_end` -> `role=system`

When `includeSystemEvents=false`, system-role messages are omitted from the
returned transcript and from aggregate counts that depend on them. User and
assistant message histories always remain complete.

## Summaries And Aggregates

The server computes only simple counts and distributions that are deterministic
from the normalized transcript set. It does not compute semantic clusters,
topic labels, or qualitative issue groupings.

`summary` is intentionally lightweight and safe to show even when the result is
large. `aggregate` is available only from the batch analysis tool and is meant
to help the model answer quickly before reading every transcript in detail.

## Limits

The main guardrail is the number of conversations, not the number of messages
inside each conversation.

- `dateFrom` and `dateTo` are required for all tools.
- Requests are always pinned to `botId=6950785430289573256`.
- The server enforces a maximum `maxConversations` limit, initially `50`.
- The service loads full paginated history for every selected conversation.
- The service must never cut off a conversation after N messages.
- `truncated` reports only omitted conversations caused by the batch limit.

This preserves transcript integrity while still keeping total payload size
bounded through a maximum number of conversations per request.

## Error Handling

Configuration or validation errors fail the whole tool call:

- missing AMIO API configuration
- invalid or reversed date range
- failed conversation search request

Per-conversation fetch failures do not fail the whole batch. The service should
skip the broken conversation, record its `contactId` in `failedContactIds`, and
add a short warning entry. This mirrors the reality that some contacts may have
incomplete or temporarily unavailable history while the rest of the dataset is
still useful.

## Security Boundaries

- one fixed AMIO demo bot ID
- read-only AMIO analytics endpoints only
- server-side bearer token only
- no browser exposure of API key
- no write, delete, replay, or operator actions
- existing application-wide limits still apply: five-minute run budget and
  model-side tool usage limits

Any future support for other bots must be an explicit follow-up change with its
own configuration and review.

## Configuration

The feature adds AMIO server environment values for:

- base URL, defaulting to production unless explicitly overridden
- bearer API key for analytics access
- optional hard cap for `maxConversations`

The capability is enabled only when the required AMIO values exist. Otherwise
the rest of the analytics agent keeps working without this source.

## Testing

The implementation should cover three layers:

1. transcript normalizer unit tests for each major event mapping
2. conversation service unit tests for pagination, merge logic, summaries,
   aggregates, truncation, and partial failures
3. mocked HTTP integration tests for AMIO endpoint calling order and paginated
   history loading

Manual verification should include at least:

- searching a one-week window with only `contactIds` and summary output
- fetching transcripts with `includeSystemEvents=false`
- batch analysis with multiple conversations and aggregate counts
- a partial failure case where one contact fails and the batch still succeeds
