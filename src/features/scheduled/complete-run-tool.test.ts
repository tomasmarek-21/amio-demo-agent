import { describe, it, expect, vi } from "vitest";
import { createCompleteScheduledRunTool } from "./complete-run-tool";

describe("createCompleteScheduledRunTool", () => {
  it("calls onComplete with slackMessage when invoked", async () => {
    const onComplete = vi.fn();
    const tool = createCompleteScheduledRunTool(onComplete);

    const args = JSON.stringify({ slackMessage: "MRR is €42k, up 3%" });
    const parsed = tool.$parseRaw(args);
    await tool.$callback!(parsed);

    expect(onComplete).toHaveBeenCalledWith({ slackMessage: "MRR is €42k, up 3%" });
  });

  it("calls onComplete with null when slackMessage is null", async () => {
    const onComplete = vi.fn();
    const tool = createCompleteScheduledRunTool(onComplete);

    const args = JSON.stringify({ slackMessage: null });
    const parsed = tool.$parseRaw(args);
    await tool.$callback!(parsed);

    expect(onComplete).toHaveBeenCalledWith({ slackMessage: null });
  });

  it("has the correct tool name and type", () => {
    const tool = createCompleteScheduledRunTool(() => {});
    expect(tool.name).toBe("complete_scheduled_run");
    expect(tool.type).toBe("function");
  });
});
