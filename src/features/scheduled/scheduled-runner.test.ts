import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/features/agent/container", () => ({
  chatRepository: {
    getSession: vi.fn().mockResolvedValue({ id: "sess-1", lastResponseId: null, workflowId: "weekly-mrr-report", title: "Test" }),
    addMessage: vi.fn().mockResolvedValue({ id: "msg-1" }),
    createRun: vi.fn().mockResolvedValue("run-1"),
    completeRun: vi.fn().mockResolvedValue(undefined),
    failRun: vi.fn().mockResolvedValue(undefined),
    addToolCall: vi.fn().mockResolvedValue(undefined),
    updateSessionResponse: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    AGENT_PROVIDER: "fake",
    SUPABASE_AGENT_URL: "http://localhost",
    SUPABASE_AGENT_SERVICE_ROLE_KEY: "test-key",
  }),
}));

vi.mock("@/features/agent/azure-responses-provider", () => ({
  AzureResponsesProvider: vi.fn(),
}));

const { runScheduledWorkflow } = await import("./scheduled-runner");

describe("runScheduledWorkflow", () => {
  it("does not throw for unknown workflowId", async () => {
    await expect(
      runScheduledWorkflow("sess-1", "nonexistent-workflow", null),
    ).resolves.not.toThrow();
  });

  it("does not throw for known workflowId with fake provider", async () => {
    await expect(
      runScheduledWorkflow("sess-1", "weekly-mrr-report", null),
    ).resolves.not.toThrow();
  });
});
