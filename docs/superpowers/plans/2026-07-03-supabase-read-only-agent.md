# Supabase Read-only Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-scoped, read-only Supabase MCP access with an on-demand business data catalog.

**Architecture:** Register the official Supabase remote MCP beside PostHog and Stripe, restricted in both the URL and Azure tool allowlist. Store business semantics in a Supabase table that the model queries only when Supabase is selected.

**Tech Stack:** Next.js, TypeScript, Azure OpenAI Responses API, Supabase MCP, PostgreSQL

---

### Task 1: Create the catalog bootstrap SQL

**Files:**
- Create: `docs/supabase-agent-data-catalog.sql`

- [ ] Define `public.agent_data_catalog` with a composite primary key and updated timestamp.
- [ ] Seed the nine supplied public tables with initial semantic descriptions.
- [ ] Use `ON CONFLICT DO NOTHING` so rerunning the bootstrap never overwrites manual edits.

### Task 2: Add the Supabase MCP capability

**Files:**
- Create: `src/features/agent/supabase-capability.ts`
- Modify: `src/features/agent/azure-responses-provider.ts`
- Modify: `src/features/agent/container.ts`
- Modify: `src/lib/env.ts`
- Modify: `.env.example`

- [ ] Build the URL with `project_ref`, `read_only=true`, and `features=database`.
- [ ] Send the PAT only through the MCP `authorization` field.
- [ ] Restrict `allowed_tools` to `list_tables` and `execute_sql`.
- [ ] Enable the capability only when both Supabase environment values exist.

### Task 3: Teach the analytics agent when to use the source

**Files:**
- Modify: `src/features/agent/instructions.ts`
- Modify: `src/features/agent/azure-responses-provider.ts`
- Modify: `README.md`

- [ ] Add Supabase to the source-routing instructions without embedding catalog contents.
- [ ] Add a Supabase-specific progress label.
- [ ] Document credentials, restrictions, and catalog setup.
- [ ] Run `npm run typecheck`, `git diff --check`, and `npm run build`; do not run tests per user request.

