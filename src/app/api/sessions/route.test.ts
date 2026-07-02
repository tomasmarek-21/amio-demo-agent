import { beforeEach, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createSession: vi.fn(),
  listSessions: vi.fn(),
}));

vi.mock("@/features/agent/container", () => ({
  chatRepository: repository,
}));

import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

it("creates a session", async () => {
  repository.createSession.mockResolvedValue({
    id: "session-1",
    title: "Pricing",
    lastResponseId: null,
    createdAt: new Date("2026-07-02T10:00:00Z"),
    updatedAt: new Date("2026-07-02T10:00:00Z"),
  });

  const response = await POST(
    new Request("http://localhost/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title: "Pricing" }),
    }),
  );

  expect(response.status).toBe(201);
  expect(repository.createSession).toHaveBeenCalledWith("Pricing");
  expect((await response.json()).session.id).toBe("session-1");
});

it("lists sessions", async () => {
  repository.listSessions.mockResolvedValue([]);
  const response = await GET();
  expect(await response.json()).toEqual({ sessions: [] });
});
