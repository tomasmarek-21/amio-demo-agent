import type Database from "better-sqlite3";

export function createSchema(sqlite: Database.Database) {
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, last_response_id TEXT,
      workflow_id TEXT, callback_url TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
      content TEXT NOT NULL, created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_message_id TEXT NOT NULL,
      assistant_message_id TEXT, model TEXT NOT NULL, status TEXT NOT NULL,
      started_at INTEGER NOT NULL, finished_at INTEGER, input_tokens INTEGER,
      output_tokens INTEGER, tool_calls_count INTEGER NOT NULL DEFAULT 0,
      error TEXT, FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (user_message_id) REFERENCES messages(id),
      FOREIGN KEY (assistant_message_id) REFERENCES messages(id)
    );
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, tool_name TEXT NOT NULL,
      sanitized_arguments TEXT NOT NULL, result_summary TEXT, duration_ms INTEGER,
      status TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES agent_runs(id)
    );
    CREATE TABLE IF NOT EXISTS notion_connections (
      id TEXT PRIMARY KEY, redirect_uri TEXT NOT NULL, client_id TEXT NOT NULL,
      client_secret TEXT, access_token TEXT, refresh_token TEXT,
      access_token_expires_at INTEGER, authorized_at INTEGER,
      last_refresh_at INTEGER, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notion_oauth_states (
      state TEXT PRIMARY KEY, code_verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
  `);
}
