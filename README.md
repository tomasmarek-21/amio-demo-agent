# AMIO Analytics Agent

Local, read-only PostHog analytics chat powered by Azure OpenAI Responses API
and PostHog's official MCP server.

## Requirements

- Current Node.js LTS
- npm
- Azure OpenAI resource with a `gpt-5-mini` deployment
- PostHog personal API key created with the **MCP Server** preset

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

Azure receives at most 25 tool calls per response, a 4,000 output-token limit,
and a 90-second application deadline. Stored tool arguments, outputs, and
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
SQLite database. It does not call Azure or PostHog.

Run the opt-in live read-only test only after `.env.local` is configured:

```bash
RUN_LIVE_POSTHOG_SMOKE=true npm run test:live
```

The live script prints status labels, tool names, and the final answer. It does
not print API keys or raw visitor identifiers.

## Manual acceptance questions

1. Kolik lidí minulý týden navštívilo pricing page?
2. Jaké jsou nejčastější první stránky nových návštěvníků?
3. Analyzuj další pohyb lidí, kteří přišli na get-demo page.
4. Kde návštěvníci nejčastěji opouštějí web?
5. A porovnej to s předchozím týdnem.

For ambiguous concepts such as “new visitor” or “exit,” the answer should
state the definition used or ask one concise clarification.
