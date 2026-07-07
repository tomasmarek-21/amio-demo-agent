# Notion Read-only OAuth Design

## Goal

Connect the analytics agent to the official hosted Notion MCP so it can search
AMIO knowledge, fetch selected pages, answer from their contents, and cite
direct Notion links.

## User experience

The sidebar shows a Notion status control between the Analytics Agent heading
and the New conversation button. A green dot and “Notion connected” indicate a
usable OAuth connection. A red dot and “Reconnect Notion” start the OAuth flow.
OAuth never starts automatically during a conversation because redirecting in
the middle of an agent run would destroy that run.

## OAuth

The server uses Notion's OAuth discovery, dynamic client registration, PKCE,
authorization-code exchange, rotating refresh tokens, and proactive access
token refresh. OAuth tokens and PKCE verifiers are encrypted at rest in local
SQLite using an AES-256-GCM key derived server-side from the existing Azure
credential. OAuth state is single-use and expires after ten minutes.

The connection uses Tomas's Notion account and therefore sees exactly the
pages and teamspaces that account can access. Manual reconnection is expected
after the absolute 180-day grant lifetime, after 30 days without a successful
refresh, or after explicit revocation.

## Agent integration

The existing Azure Responses provider resolves optional MCP tools immediately
before each request. When Notion is connected, it refreshes the OAuth token when
needed and adds `https://mcp.notion.com/mcp` with only the OpenAI-compatible
read-only Notion tools, including `notion-search` and `notion-fetch`. When
disconnected, Notion is omitted entirely.

The model searches with a natural-language query, fetches only promising
results by URL or ID, and includes direct links to source pages in its answer.
All Notion write tools are unavailable.

## Failure handling

Transient refresh failures do not break unrelated PostHog, Stripe, or Supabase
questions; Notion is omitted for that run. A terminal `invalid_grant` clears
the stored tokens and changes the sidebar to Reconnect Notion. OAuth callback
errors redirect to the app with a disconnected status.

## Verification

Per user instruction, no new automated tests are required. TypeScript and the
production build must pass. Manual acceptance covers connect, status, search,
fetch, links, token refresh behavior, and reconnect.
