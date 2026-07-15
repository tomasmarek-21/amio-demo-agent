import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// SQLite schema used only for unit tests (better-sqlite3 in-memory).
// Production uses @supabase/supabase-js directly (no Drizzle).

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  lastResponseId: text("last_response_id"),
  workflowId: text("workflow_id"),
  callbackUrl: text("callback_url"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => sessions.id),
  userMessageId: text("user_message_id").notNull().references(() => messages.id),
  assistantMessageId: text("assistant_message_id").references(() => messages.id),
  model: text("model").notNull(),
  status: text("status").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  toolCallsCount: integer("tool_calls_count").notNull().default(0),
  error: text("error"),
});

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => agentRuns.id),
  toolName: text("tool_name").notNull(),
  sanitizedArguments: text("sanitized_arguments").notNull(),
  resultSummary: text("result_summary"),
  durationMs: integer("duration_ms"),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const notionConnections = sqliteTable("notion_connections", {
  id: text("id").primaryKey(),
  redirectUri: text("redirect_uri").notNull(),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  authorizedAt: integer("authorized_at", { mode: "timestamp_ms" }),
  lastRefreshAt: integer("last_refresh_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const notionOauthStates = sqliteTable("notion_oauth_states", {
  state: text("state").primaryKey(),
  codeVerifier: text("code_verifier").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});
