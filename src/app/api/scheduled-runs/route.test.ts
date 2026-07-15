import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const repository = vi.hoisted(() => ({
  createScheduledSession: vi.fn(),
  listSessionsByWorkflow: vi.fn(),
}));

vi.mock("@/features/agent/container", () => ({
  chatRepository: repository,
}));

vi.mock("@/features/scheduled/scheduled-runner", () => ({
  runScheduledWorkflow: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "./route";
import { runScheduledWorkflow } from "@/features/scheduled/scheduled-runner";

const baseUrl = "http://localhost/api/scheduled-runs";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/scheduled-runs", () => {
  it("returns the workflow list when no workflowId param", async () => {
    const response = await GET(new Request(baseUrl));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.workflows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "weekly-mrr-report", name: "Weekly MRR Report" }),
        expect.objectContaining({ id: "conversation-quality-check" }),
      ]),
    );
  });

  it("returns sessions for a known workflowId", async () => {
    repository.listSessionsByWorkflow.mockResolvedValue([
      { id: "sess-1", title: "Weekly MRR Report", workflowId: "weekly-mrr-report" },
    ]);

    const response = await GET(new Request(`${baseUrl}?workflowId=weekly-mrr-report`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sessions).toHaveLength(1);
    expect(repository.listSessionsByWorkflow).toHaveBeenCalledWith("weekly-mrr-report");
  });

  it("returns 404 for an unknown workflowId", async () => {
    const response = await GET(new Request(`${baseUrl}?workflowId=nonexistent`));
    expect(response.status).toBe(404);
  });
});

describe("POST /api/scheduled-runs", () => {
  it("creates a session and starts a background run, returning 202", async () => {
    repository.createScheduledSession.mockResolvedValue({
      id: "sess-new",
      title: "Weekly MRR Report",
      workflowId: "weekly-mrr-report",
      createdAt: new Date("2026-07-15T10:00:00Z"),
      updatedAt: new Date("2026-07-15T10:00:00Z"),
    });

    const response = await POST(
      new Request(baseUrl, {
        method: "POST",
        body: JSON.stringify({ workflowId: "weekly-mrr-report" }),
      }),
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.sessionId).toBe("sess-new");
    expect(repository.createScheduledSession).toHaveBeenCalledWith(
      "weekly-mrr-report",
      null,
      "Weekly MRR Report",
    );
    expect(runScheduledWorkflow).toHaveBeenCalledWith("sess-new", "weekly-mrr-report", null);
  });

  it("passes callbackUrl through to createScheduledSession and runner", async () => {
    repository.createScheduledSession.mockResolvedValue({
      id: "sess-cb",
      title: "Weekly MRR Report",
      workflowId: "weekly-mrr-report",
    });

    await POST(
      new Request(baseUrl, {
        method: "POST",
        body: JSON.stringify({
          workflowId: "weekly-mrr-report",
          callbackUrl: "https://n8n.example.com/webhook/abc",
        }),
      }),
    );

    expect(repository.createScheduledSession).toHaveBeenCalledWith(
      "weekly-mrr-report",
      "https://n8n.example.com/webhook/abc",
      "Weekly MRR Report",
    );
    expect(runScheduledWorkflow).toHaveBeenCalledWith(
      "sess-cb",
      "weekly-mrr-report",
      "https://n8n.example.com/webhook/abc",
    );
  });

  it("returns 400 for missing workflowId", async () => {
    const response = await POST(
      new Request(baseUrl, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 for unknown workflowId", async () => {
    const response = await POST(
      new Request(baseUrl, {
        method: "POST",
        body: JSON.stringify({ workflowId: "does-not-exist" }),
      }),
    );
    expect(response.status).toBe(404);
  });
});
