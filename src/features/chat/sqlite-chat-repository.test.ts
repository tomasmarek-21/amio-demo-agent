// @vitest-environment node
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSchema } from "@/db/schema-bootstrap";
import { SqliteChatRepository } from "./sqlite-chat-repository";

let repository: SqliteChatRepository;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-02T10:00:00Z"));
  const sqlite = new Database(":memory:");
  createSchema(sqlite);
  repository = new SqliteChatRepository(drizzle(sqlite));
});

afterEach(() => {
  vi.useRealTimers();
});

it("keeps messages isolated between sessions", async () => {
  const first = await repository.createSession("First");
  const second = await repository.createSession("Second");
  await repository.addMessage(first.id, "user", "pricing visits");

  expect((await repository.getSession(first.id))?.messages).toHaveLength(1);
  expect((await repository.getSession(second.id))?.messages).toHaveLength(0);
});

it("returns sessions with the most recently updated first", async () => {
  const first = await repository.createSession("First");
  vi.setSystemTime(new Date("2026-07-02T10:00:01Z"));
  const second = await repository.createSession("Second");
  vi.setSystemTime(new Date("2026-07-02T10:00:02Z"));
  await repository.addMessage(first.id, "user", "new activity");

  expect((await repository.listSessions()).map((session) => session.id)).toEqual(
    [first.id, second.id],
  );
});
