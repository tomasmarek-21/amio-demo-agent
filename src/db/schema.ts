import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  lastResponseId: text("last_response_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  userMessageId: text("user_message_id")
    .notNull()
    .references(() => messages.id),
  assistantMessageId: text("assistant_message_id").references(() => messages.id),
  model: text("model").notNull(),
  status: text("status", {
    enum: ["running", "completed", "failed"],
  }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  toolCallsCount: integer("tool_calls_count").notNull().default(0),
  error: text("error"),
});

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => agentRuns.id),
  toolName: text("tool_name").notNull(),
  sanitizedArguments: text("sanitized_arguments").notNull(),
  resultSummary: text("result_summary"),
  durationMs: integer("duration_ms"),
  status: text("status", {
    enum: ["running", "completed", "failed"],
  }).notNull(),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
