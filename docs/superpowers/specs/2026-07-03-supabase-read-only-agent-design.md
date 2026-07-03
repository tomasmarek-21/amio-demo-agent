# Supabase Read-only Agent Design

## Goal

Give the AMIO analytics chatbot read-only access to one production Supabase
project while loading business-table semantics only when Supabase is relevant.

## Architecture

The existing Azure Responses API request receives the official hosted Supabase
MCP server as a third remote MCP tool. Its URL is pinned to one `project_ref`,
sets `read_only=true`, and enables only the `database` feature group. Azure is
additionally allowed to discover and invoke only `list_tables` and
`execute_sql`. Authentication uses a server-side Supabase personal access token;
the browser and model never receive it.

Business semantics live in `public.agent_data_catalog`. The Supabase MCP server
description tells the model to read catalog rows for unfamiliar tables before
writing analytical SQL. This keeps catalog content out of unrelated PostHog and
Stripe requests while allowing schema and semantics to be loaded in the same
Responses API tool loop.

## Data flow

1. The model decides whether Supabase is relevant.
2. It calls `list_tables` when it needs the current physical schema.
3. It queries `public.agent_data_catalog` for the relevant table definitions.
4. It generates and executes read-only SQL through `execute_sql`.
5. It corrects a failed query when possible and answers with concrete evidence.

## Security boundaries

- One fixed Supabase project.
- Official MCP read-only database role.
- Only the `database` feature group.
- Only `list_tables` and `execute_sql`.
- No generic write tool, migrations, project management, functions, or storage.
- Existing application-wide limits remain: 30 tool calls and a five-minute run.
- Any future writes use a separate MCP server with narrow named operations.

## Configuration

The application accepts `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`.
Both are optional as a pair so the existing local server continues to work
until Supabase is configured. Supabase MCP is enabled only when both exist.

## Catalog

`public.agent_data_catalog` has one concise row per documented business table:
`schema_name`, `table_name`, `description`, and `updated_at`. The description
contains only non-obvious business meaning and caveats. The bootstrap SQL
inserts rows for the nine supplied tables without overwriting later edits.
