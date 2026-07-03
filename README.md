# AMIO Analytics Agent

Local, read-only business analytics chat powered by Azure OpenAI Responses API
and the official PostHog, Stripe, Supabase, and Notion MCP servers.

## Requirements

- Current Node.js LTS
- npm
- Azure OpenAI resource with a `gpt-5-mini` deployment
- PostHog personal API key created with the **MCP Server** preset
- Stripe live MCP access enabled by an account administrator
- Stripe production restricted API key with only required `Read` permissions
- Supabase personal access token and production project ref
- A Notion account with access to the desired company pages

## Configuration

```bash
cp .env.example .env.local
```

Fill these values:

- `AZURE_OPENAI_ENDPOINT` — Azure resource endpoint, for example
  `https://your-resource.openai.azure.com`.
- `AZURE_OPENAI_API_KEY` — Azure API key.
- `AZURE_OPENAI_DEPLOYMENT` — Azure deployment name, normally `gpt-5-mini`.
- `POSTHOG_API_KEY` — project-scoped personal API key using the MCP Server
  preset.
- `POSTHOG_PROJECT_ID` — visible in PostHog project settings or URL.
- `POSTHOG_ORGANIZATION_ID` — optional; leave it empty when the project ID is
  supplied.
- `STRIPE_API_KEY` — production restricted key beginning with `rk_live_`.
  A standard Stripe account needs no separate account or organization ID.
- `SUPABASE_ACCESS_TOKEN` — personal access token used for non-interactive
  Supabase MCP authentication. This is not an anon or service-role key.
- `SUPABASE_PROJECT_REF` — fixed Supabase Project ID from project settings.
- `DATABASE_URL` — local SQLite path.

All credentials stay on the server. Do not prefix them with `NEXT_PUBLIC_`.

## Run locally

```bash
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The application is intentionally local and unauthenticated. Do not expose it
to a public network in this form.

## Security boundaries

The PostHog MCP URL enforces:

- `mode=cli` for token-efficient dynamic tool discovery,
- `readonly=true`,
- a fixed project ID (and optionally an organization ID),
- all read-only PostHog feature groups.

The Stripe integration imports only seven explicitly allowlisted read
operations: account information, documentation search, resource search and
fetch, API operation discovery, API operation details, and generic GET
execution. The write executor is never imported. The restricted Stripe key
provides a second, authoritative read-only boundary.

The Supabase MCP URL is pinned to one project, enables `read_only=true`, and
loads only the `database` feature group. Azure can discover only `list_tables`
and `execute_sql`. Business definitions are loaded on demand from
`public.agent_data_catalog`; run `docs/supabase-agent-data-catalog.sql` once in
the Supabase SQL editor before using the source.

Notion is connected from the sidebar through user OAuth. Access and rotating
refresh tokens are encrypted in local SQLite and refreshed automatically.
Azure receives only the Notion `search` and `fetch` tools; page creation,
updates, moves, and all other write operations are unavailable. The connection
must be authorized again after at most 180 days or after 30 days of inactivity.

Azure receives at most 30 tool calls per response, a 16,000 output-token limit,
and a five-minute application deadline. Stored tool arguments, outputs, and
errors are redacted and truncated. Sessions never share conversation memory.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run test:e2e
npm run build
```

The E2E test uses a deterministic fake provider and an isolated temporary
SQLite database. It does not call Azure, PostHog, Stripe, Supabase, or Notion.

Run opt-in live read-only tests only after `.env.local` is configured:

```bash
RUN_LIVE_POSTHOG_SMOKE=true npm run test:live
RUN_LIVE_STRIPE_SMOKE=true npm run test:live:stripe
```

The live scripts print status labels, tool names, and the final answer. They do
not print API keys, raw visitor identifiers, or customer records.

## Manual acceptance questions

1. Kolik lidí minulý týden navštívilo pricing page?
2. Jaké jsou nejčastější první stránky nových návštěvníků?
3. Analyzuj další pohyb lidí, kteří přišli na get-demo page.
4. Kde návštěvníci nejčastěji opouštějí web?
5. A porovnej to s předchozím týdnem.
6. Kolik máme aktivních Stripe subscriptions a v jakých měnách?
7. Jaké je měsíční recurring revenue podle měny?
8. Porovnej nové platící zákazníky ve Stripe s návštěvností pricing page.
9. Najdi v Notionu dokumentaci k onboardingu zákazníků, shrň ji a přidej odkazy.

For ambiguous concepts such as “new visitor” or “exit,” the answer should
state the definition used or ask one concise clarification.
