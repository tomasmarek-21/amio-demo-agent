import { expect, it, vi } from "vitest";

const runner = vi.hoisted(() => ({
  run: vi.fn(),
}));

vi.mock("@/features/agent/container", () => ({
  agentRunner: runner,
}));

import { POST } from "./route";

async function* events() {
  yield { type: "status", label: "Analyzuji data v PostHogu" };
  yield { type: "text_delta", delta: "42" };
  yield {
    type: "completed",
    responseId: "resp-1",
    inputTokens: 100,
    outputTokens: 10,
  };
}

it("streams agent events as SSE", async () => {
  runner.run.mockReturnValue(events());
  const response = await POST(
    new Request("http://localhost/api/sessions/session-1/messages", {
      method: "POST",
      body: JSON.stringify({ message: "How many?" }),
    }),
    { params: Promise.resolve({ sessionId: "session-1" }) },
  );

  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const body = await response.text();
  expect(body.match(/^data: /gm)).toHaveLength(3);
  expect(body).toContain('"type":"text_delta"');
});

it("rejects blank messages", async () => {
  const response = await POST(
    new Request("http://localhost/api/sessions/session-1/messages", {
      method: "POST",
      body: JSON.stringify({ message: "" }),
    }),
    { params: Promise.resolve({ sessionId: "session-1" }) },
  );
  expect(response.status).toBe(400);
});
