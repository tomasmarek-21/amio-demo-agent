# Stripe read-only agent design

**Date:** 2026-07-02

## Goal

Extend the existing AMIO analytics chat with production Stripe data while
preserving its current session-scoped conversation behavior and local web UI.
The agent must answer questions from Stripe alone and combine Stripe evidence
with PostHog evidence in one response. It must never create, update, cancel,
refund, or delete Stripe data.

The first version targets one standard Stripe account. Stripe Connect and
connected-account routing are out of scope.

## Chosen approach

Use Stripe's official remote MCP server at `https://mcp.stripe.com` as a second
Responses API MCP tool alongside the existing PostHog MCP tool.

This is preferred over custom Stripe SDK tools because it provides the same
Stripe-maintained tool surface used by coding agents with substantially less
application code. A local `@stripe/mcp` process would add deployment and
process-management complexity without improving the local chat use case.

## Authentication and authorization

The application reads `STRIPE_API_KEY` from server-only environment
configuration. The value must be a production restricted key beginning with
`rk_live_`. It is sent to Stripe's MCP server through the Responses API
`authorization` field on every request and is never sent to the browser,
written to chat storage, or included in tool traces.

Read-only access is enforced in three layers:

1. The Stripe restricted key grants only `Read` access to the resources needed
   for financial analysis. All other resources remain `None`.
2. The Responses API MCP configuration uses an explicit `allowed_tools`
   allowlist containing only the read operations exposed by Stripe's current
   production MCP server: `search_stripe_documentation`,
   `get_stripe_account_info`, `search_stripe_resources`,
   `fetch_stripe_resources`, `stripe_api_search`, `stripe_api_details`, and
   `stripe_api_read`. The mutation executor `stripe_api_write` is never
   imported into model context.
3. Agent instructions explicitly prohibit all Stripe mutations and require
   aggregate answers that avoid exposing unnecessary customer information.

The restricted API key is the authoritative security boundary. The allowlist
prevents write tools from entering model context, reducing both risk and token
usage.

## Architecture

Add a dedicated `stripe-capability` module that constructs the Stripe MCP tool.
Generalize the Azure Responses provider configuration from one `mcpTool` to an
array of `mcpTools`. The provider sends both PostHog and Stripe tools in the
same Responses API request, allowing the model to select either or both.

MCP streaming events include a `server_label`. Status text, errors, and stored
tool traces use that label to distinguish PostHog from Stripe without exposing
credentials or raw customer identifiers.

The system instructions become source-aware:

- use Stripe evidence for billing and revenue claims;
- use PostHog evidence for product and website behavior claims;
- use both sources when the question asks for a comparison;
- state date ranges, currencies, Stripe environment, and relevant definitions;
- do not expose customer emails, payment-method details, full object payloads,
  raw customer IDs, or invoice URLs unless strictly required.

The existing session memory, SQLite schema, API routes, and chat UI remain
unchanged. Tool traces already support arbitrary tool names and continue to be
redacted and truncated.

## Request flow

1. The user submits a question in the existing chat.
2. The server creates one Azure Responses API request containing the PostHog
   and Stripe MCP configurations.
3. The model loads only the tools needed for the question and performs bounded
   read operations.
4. Tool events are streamed to the UI with a source-specific status and stored
   as sanitized evidence.
5. The model returns one answer, including cross-source comparisons when
   requested.

The global tool-call ceiling increases from 25 to 30 so that loading two MCP
servers leaves enough room for a normal cross-source analysis while retaining
an explicit upper bound.

## Error handling

Authentication, permission, or MCP connection errors identify the failing
source without leaking the key. A Stripe permission failure explains that the
restricted key lacks the relevant `Read` permission. Failure of one source
does not permit fabricated results from the other source.

Retry behavior remains limited to transient request failures. Tool-level query
failures may be corrected at most twice before the agent reports the
limitation.

## Configuration and setup

Add `STRIPE_API_KEY=` to `.env.example` and document how to create a production
restricted key. The real value remains only in ignored `.env.local`.

No Stripe account or organization ID is required for a standard account; the
restricted key identifies the account.

## Testing

Implementation follows test-driven development:

- environment validation accepts a valid `rk_live_` key and rejects missing or
  non-restricted production keys;
- the Stripe capability contains the official URL, authorization token, exact
  read-only allowlist, and no write tools;
- the provider sends both MCP tools and attributes streamed calls to the
  correct source;
- existing PostHog-only behavior remains covered;
- E2E chat behavior remains unchanged using the fake provider;
- an opt-in live Stripe smoke test performs one harmless read and prints no
  customer records or credentials.

Before completion, run unit tests, type checking, linting, the production
build, and the existing E2E test. The live smoke test runs only when explicitly
enabled with configured credentials.
