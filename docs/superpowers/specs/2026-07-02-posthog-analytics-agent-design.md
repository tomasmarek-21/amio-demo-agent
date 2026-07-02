# AMIO PostHog Analytics Agent — Design

Date: 2026-07-02

## Summary

The first version of the AMIO internal agent will be a local, single-user web
application for asking natural-language questions about AMIO's PostHog data.
It will use Azure OpenAI's Responses API with the `gpt-5-mini` deployment and
connect directly to PostHog's official hosted MCP server.

The agent is strictly read-only. It can inspect the PostHog data schema, run
analytics queries, retry invalid queries, and explain its conclusions with
traceable evidence. It cannot create or modify insights, dashboards, feature
flags, experiments, users, or any other PostHog resource.

The initial product is an interactive chat. A later n8n workflow will call the
same agent core with a scheduled prompt and deliver the returned report to
Slack. Scheduling and Slack delivery are explicitly outside this MVP.

## Goals

- Answer ad hoc questions about website traffic and visitor behavior.
- Support follow-up questions within one chat session.
- Give answers that state their time range, definitions, evidence, and
  limitations.
- Let users inspect the MCP calls and HogQL/SQL used to reach an answer.
- Keep PostHog credentials on the server and enforce read-only access.
- Establish boundaries that allow Stripe, Notion, Attio, and other capabilities
  to be added later without rewriting the agent core.
- Run locally through a simple web UI and local server.

## Non-goals

- Writing to PostHog.
- Authentication or multi-user authorization.
- Sharing memory between separate chat sessions.
- Long-conversation compaction or cross-session summaries.
- Scheduled execution, n8n workflow creation, or Slack delivery.
- Connecting Stripe, Notion, Attio, or other systems in the MVP.
- Building a custom MCP server or a general-purpose MCP client.
- Persisting production data in Supabase or another hosted database.

## Acceptance Scenarios

The MVP must reliably handle these representative questions:

1. "How many people visited the pricing page last week?"
2. "What are the most common first pages for new visitors?"
3. "Analyze the subsequent journeys of visitors who reached the get-demo page."
4. "Where do visitors most commonly leave the website?"
5. Follow-up in the same session: "Compare that with the previous week."

For ambiguous terms such as "people," "new visitor," "first page," and "leave,"
the agent must either state a reasonable definition or ask a clarifying
question when different definitions would materially change the answer.

## Evaluated Approaches

### 1. Azure Responses API connected directly to PostHog MCP

This is the selected approach. Azure OpenAI's Responses API supports remote MCP
servers and the available Azure model families include GPT-5 and GPT-4.1. The
official PostHog MCP server supports project pinning, read-only mode, feature
filtering, and a token-efficient CLI mode.

Advantages:

- Minimal integration code.
- PostHog maintains its API and tool definitions.
- Azure performs MCP tool discovery and execution.
- The PostHog CLI mode avoids loading hundreds of detailed tool schemas.
- The same architecture can later attach other remote MCP servers.

Trade-off:

- Query validation and tool behavior are primarily controlled by PostHog.
  If AMIO later needs stronger query-level policies, a custom security proxy can
  be inserted without changing the UI or agent-facing API.

### 2. AMIO backend as an MCP client

The backend would discover PostHog tools, translate them into function
definitions, and run the complete tool-calling loop.

This provides detailed control and provider portability but duplicates
capabilities already available in Azure Responses API. It is not justified for
the MVP.

### 3. Custom narrow PostHog tools

AMIO would expose tools such as `get_tracking_schema` and `query_hogql` using
the PostHog API directly.

This offers the strongest query validation but requires AMIO to maintain the
integration and loses the broader capabilities of the official PostHog MCP
server. It remains a fallback if the official MCP server proves insufficient.

## Architecture

The MVP is one full-stack Next.js application:

```text
Browser chat UI
       |
       v
Next.js Agent API
       |
       +--> Session and run store (SQLite)
       |
       v
Azure OpenAI Responses API (gpt-5-mini deployment)
       |
       v
Official PostHog MCP server
       |
       v
Pinned AMIO PostHog project (read-only)
```

### Browser Chat UI

The UI provides:

- A sidebar with chat sessions and a "New conversation" action.
- A central message timeline and message composer.
- Streaming progress states such as "Inspecting data schema" and "Running
  query."
- A collapsed "How I got this answer" section under each assistant answer.
- Readable error messages and a retry action.

The first version has no login because it is a local, single-user application.
Secrets are never sent to the browser.

### Agent API

The Agent API owns:

- Session creation and message persistence.
- Construction of Azure Responses API requests.
- Streaming normalized response events to the browser.
- Enforcing time, tool-call, retry, and output budgets.
- Recording model runs and sanitized MCP call traces.
- Producing a stable internal interface that can later be called by n8n.

The interactive endpoint and the future n8n endpoint will call the same
`AgentRunner` service. The future endpoint may be shaped as
`POST /api/agent/run`, but it is not part of the MVP.

### Azure Responses Client

Azure-specific request construction is isolated behind a provider interface.
The initial implementation uses the Azure OpenAI v1 Responses API and the
configured `gpt-5-mini` deployment.

This boundary allows a later move to the direct OpenAI Responses API without
changing the UI, session store, capability registry, or agent behavior.

`gpt-5-mini` is the default because analytics planning and query correction
need stronger reasoning than the nano variants. The model deployment name is
configuration, not a hard-coded value.

### Capability Registry

The registry describes available systems using compact metadata:

- capability ID,
- human-readable purpose,
- MCP connection configuration,
- allowed feature groups,
- approval policy,
- secret references.

Only PostHog is registered in the MVP, so no routing model is needed yet. When
additional systems are introduced, a lightweight routing step will select only
the relevant capabilities before the main analysis request. This avoids
loading every company's tool collection for every question.

The design does not depend on OpenAI's `defer_loading` feature because
equivalent support is not clearly documented for the target Azure setup. A
two-request router remains portable across Azure and direct OpenAI.

### PostHog MCP Connection

The application connects to PostHog's official endpoint:

`https://mcp.posthog.com/mcp`

The server URL or headers enforce:

- CLI mode to expose one token-efficient discovery/execution tool.
- Read-only mode.
- A fixed PostHog organization and project.
- Feature filtering to `data_schema`, `sql`, and `insights`.

The backend authenticates with a PostHog personal API key created using the MCP
Server preset. The key is stored in server-side environment configuration,
scoped to the target project, rotated periodically, and replaced by a secret
manager when deployed.

Read-only MCP calls are automatically approved. Write tools are excluded rather
than merely relying on prompt instructions.

## Request and Conversation Flow

1. The user creates or opens a chat session.
2. The browser sends a message with its `session_id`.
3. The server persists the user message and starts an `agent_run`.
4. The server reads the session's most recent Azure `response_id`.
5. The server calls Azure Responses API with:
   - the user message,
   - the previous response ID when continuing a session,
   - the system instructions,
   - the restricted PostHog MCP configuration.
6. Azure lists and invokes the allowed PostHog MCP tools.
7. PostHog may return a query error; the model can correct and retry the query
   within the configured budget.
8. The API streams progress and answer events to the browser.
9. The final answer, new Azure response ID, usage, and sanitized tool traces are
   stored.
10. A follow-up message in the same session continues from the stored response
    ID.
11. Creating a new session starts with no previous conversation context.

Complete message history is stored for UI continuity and auditability, but it
is never automatically included in a different session. Long-session
compaction is deferred until real usage demonstrates a need.

## Answer Contract

Answers are rendered as Markdown and should contain, where applicable:

1. A direct answer or concise executive summary.
2. Important findings in descending order of relevance.
3. The analyzed date range and PostHog project time zone.
4. Definitions and assumptions used for ambiguous analytics concepts.
5. A table or compact comparison when it makes results easier to understand.
6. Data limitations, confidence, and alternative interpretations.

The separate expandable trace contains:

- tool name,
- sanitized arguments,
- generated HogQL/SQL when available,
- brief result summary,
- duration and status.

The agent must not invent a metric when the source data does not support it.
When it cannot verify an answer, it reports what failed and what additional
information would be required.

## Data Model

SQLite is sufficient for the local MVP. The storage layer must use repository
interfaces so SQLite can later be replaced with Postgres or Supabase.

### `sessions`

- `id`
- `title`
- `last_response_id`
- `created_at`
- `updated_at`

### `messages`

- `id`
- `session_id`
- `role`
- `content`
- `created_at`

### `agent_runs`

- `id`
- `session_id`
- `user_message_id`
- `model`
- `status`
- `started_at`
- `finished_at`
- `input_tokens`
- `output_tokens`
- `tool_calls_count`
- `error`

### `tool_calls`

- `id`
- `run_id`
- `tool_name`
- `sanitized_arguments`
- `result_summary`
- `duration_ms`
- `status`
- `error`
- `created_at`

Raw API keys and unredacted tool results are never persisted.

## Safety and Operational Limits

Defense in depth:

1. A project-scoped PostHog API key.
2. A PostHog MCP connection pinned to one organization and project.
3. MCP read-only mode.
4. Feature filtering to analytics-only groups.
5. Server-side request budgets.
6. Output and log redaction.

Initial per-message budgets:

- At most 12 MCP tool calls.
- At most 90 seconds wall-clock execution time.
- At most two corrected attempts after an invalid HogQL/SQL query.
- At most two retries for transient Azure or network errors.
- Bounded query result and model output sizes.

The application must not render raw API keys, email addresses, raw visitor
identifiers, or sensitive query-string values. Aggregate analytics are the
default. If a future use case requires person-level data, it needs a separate
design and explicit policy.

Prompt injection remains possible even with read-only access. The agent treats
data returned from PostHog as untrusted content and does not follow
instructions found inside event properties or page content.

## Error Handling

- Invalid analytics queries are returned to the model for correction within the
  retry budget.
- Transient network and rate-limit failures use bounded retries with backoff.
- Authentication and authorization errors stop immediately and are shown as
  configuration errors.
- Budget or timeout exhaustion cancels the run and produces a clear partial
  failure response.
- Streaming disconnection does not erase the persisted run state.
- Failed runs keep their error metadata but never store secrets or full
  sensitive payloads.

## Testing Strategy

### Unit Tests

- Session isolation and continuation.
- Capability registry selection and configuration.
- PostHog URL/header construction.
- Enforcement of read-only and allowed feature groups.
- Tool-call, retry, timeout, and output budgets.
- Sensitive value redaction.
- Provider response normalization.

### Integration Tests

- Simulated Azure Responses streams containing MCP list, call, error, retry, and
  final-answer events.
- Persistence of messages, response IDs, runs, and tool traces.
- Same-session follow-ups using the previous response ID.
- New-session requests with no previous response ID.
- Failure behavior for authentication, rate limiting, malformed MCP output, and
  browser disconnection.

### Live Read-only Smoke Tests

With explicit test credentials:

- Confirm schema discovery works.
- Run a bounded aggregate query.
- Confirm an invalid query can be corrected.
- Confirm no write tool is listed or callable.
- Execute the five acceptance scenarios and compare results with PostHog's UI
  or a manually verified query.

## Future Evolution

### n8n and Slack

n8n will later call the same Agent API with a reporting prompt. It will own the
schedule, delivery to Slack, and retry policy around the whole job. The agent
will return structured report content and trace references.

### Additional Systems

Stripe, Notion, Attio, and other systems are added as capability registry
entries. A lightweight routing request selects the relevant systems, and the
main request receives only those MCP connections.

Five capability descriptions are inexpensive. The architecture avoids the
expensive case—loading hundreds of individual tool schemas—through server
selection and token-efficient MCP modes such as PostHog's CLI mode.

### Stronger PostHog Policy

If production usage needs stricter query limits, AMIO can insert a custom
read-only MCP proxy that validates SELECT-only queries, required time ranges,
row limits, complexity, tables, functions, and output size. This is deferred
because the official read-only PostHog MCP provides the fastest safe route to
validate the product.

## References

- Azure OpenAI Responses API and remote MCP:
  https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses
- OpenAI MCP and connectors:
  https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- PostHog MCP overview:
  https://posthog.com/docs/model-context-protocol
- PostHog MCP authentication, read-only mode, CLI mode, and filtering:
  https://posthog.com/docs/model-context-protocol/faq
- PostHog MCP tools:
  https://posthog.com/docs/model-context-protocol/tools
