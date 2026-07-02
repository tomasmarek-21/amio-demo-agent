// @vitest-environment node
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, expect, it } from "vitest";
import { createSchema } from "@/db/schema-bootstrap";
import { SqliteChatRepository } from "@/features/chat/sqlite-chat-repository";
import { FakeAgentProvider } from "@/test/fakes/fake-agent-provider";
import type { AgentEvent, AgentProvider } from "./types";
import { AgentRunner } from "./agent-runner";

let repository: SqliteChatRepository;

beforeEach(() => {
  const sqlite = new Database(":memory:");
  createSchema(sqlite);
  repository = new SqliteChatRepository(drizzle(sqlite));
});

async function collect(iterable: AsyncIterable<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

it("continues only the selected session and persists its result", async () => {
  const session = await repository.createSession("Existing");
  await repository.updateSessionResponse(session.id, "resp-previous");
  const provider = new FakeAgentProvider([
    { type: "text_delta", delta: "Compared result" },
    {
      type: "tool_trace",
      toolName: "execute-sql",
      arguments: '{"query":"SELECT 1"}',
      resultSummary: '{"value":1}',
      durationMs: 10,
      status: "completed",
      error: null,
    },
    {
      type: "completed",
      responseId: "resp-next",
      inputTokens: 100,
      outputTokens: 20,
    },
  ]);
  const runner = new AgentRunner(repository, provider, "gpt-5-mini");

  await collect(runner.run(session.id, "Compare it"));

  expect(provider.inputs).toEqual([
    { userMessage: "Compare it", previousResponseId: "resp-previous" },
  ]);
  const detail = await repository.getSession(session.id);
  expect(detail?.lastResponseId).toBe("resp-next");
  expect(detail?.messages.map((message) => message.content)).toEqual([
    "Compare it",
    "Compared result",
  ]);
  expect(detail?.evidence[0]?.traces[0]?.toolName).toBe("execute-sql");
});

it("starts a new session without previous provider context", async () => {
  const session = await repository.createSession();
  const provider = new FakeAgentProvider([
    {
      type: "completed",
      responseId: "resp-first",
      inputTokens: 1,
      outputTokens: 1,
    },
  ]);
  const runner = new AgentRunner(repository, provider, "gpt-5-mini");

  await collect(runner.run(session.id, "First question"));

  expect(provider.inputs[0]?.previousResponseId).toBeNull();
});

it("fails a timed out run without changing its response id", async () => {
  const session = await repository.createSession();
  await repository.updateSessionResponse(session.id, "resp-stable");
  const provider: AgentProvider = {
    async *run(_input, signal) {
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      throw signal.reason;
    },
  };
  const runner = new AgentRunner(repository, provider, "gpt-5-mini", 5);

  const events = await collect(runner.run(session.id, "Slow question"));

  expect(events).toContainEqual({
    type: "error",
    message: "Analýza překročila časový limit.",
  });
  const detail = await repository.getSession(session.id);
  expect(detail?.lastResponseId).toBe("resp-stable");
  expect(detail?.messages).toHaveLength(1);
});
