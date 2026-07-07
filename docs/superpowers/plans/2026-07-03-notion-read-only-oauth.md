# Notion Read-only OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-authorized, read-only Notion knowledge search and page fetching to the AMIO analytics agent.

**Architecture:** Persist encrypted OAuth credentials and short-lived PKCE state in SQLite, expose connect/callback/status routes, and resolve the optional Notion MCP tool before each Azure response. The sidebar provides explicit connect and reconnect controls.

**Tech Stack:** Next.js App Router, TypeScript, SQLite/Drizzle, Node crypto, Azure OpenAI Responses API, Notion hosted MCP

---

### Task 1: Persist and encrypt OAuth state

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/schema-bootstrap.ts`
- Create: `src/features/notion/token-crypto.ts`
- Create: `src/features/notion/notion-oauth-repository.ts`

- [ ] Add singleton connection and expiring OAuth-state tables.
- [ ] Encrypt client secrets, access tokens, refresh tokens, and PKCE verifiers with AES-256-GCM.
- [ ] Add repository operations for registration, state consumption, token replacement, and disconnection.

### Task 2: Implement Notion OAuth lifecycle

**Files:**
- Create: `src/features/notion/notion-oauth-service.ts`
- Create: `src/features/notion/container.ts`
- Create: `src/app/api/integrations/notion/route.ts`
- Create: `src/app/api/integrations/notion/connect/route.ts`
- Create: `src/app/api/integrations/notion/callback/route.ts`

- [ ] Discover OAuth metadata and dynamically register the localhost client.
- [ ] Generate and validate state plus PKCE.
- [ ] Exchange callback codes and persist rotating tokens.
- [ ] Refresh access tokens proactively and clear terminally invalid grants.
- [ ] Return connection status without exposing credentials.

### Task 3: Add the read-only MCP capability

**Files:**
- Create: `src/features/agent/notion-capability.ts`
- Modify: `src/features/agent/azure-responses-provider.ts`
- Modify: `src/features/agent/container.ts`
- Modify: `src/features/agent/instructions.ts`

- [ ] Resolve optional MCP tools before each agent request.
- [ ] Add Notion only with a valid token.
- [ ] Allow only read-only Notion tools, including `notion-search` and `notion-fetch`.
- [ ] Tell the model to fetch selected results and cite direct Notion links.

### Task 4: Add the sidebar status control

**Files:**
- Create: `src/lib/notion-api.ts`
- Modify: `src/components/chat/chat-shell.tsx`
- Modify: `src/components/chat/session-sidebar.tsx`

- [ ] Fetch connection status when the chat loads.
- [ ] Show green connected and red reconnect states.
- [ ] Start OAuth only after a deliberate click.
- [ ] Refresh status after returning from OAuth.

### Task 5: Document and verify

**Files:**
- Modify: `README.md`

- [ ] Document Notion access, OAuth lifecycle, and read-only tools.
- [ ] Run `npm run typecheck`, `git diff --check`, and `npm run build`.
- [ ] Do not run automated tests per user request.
