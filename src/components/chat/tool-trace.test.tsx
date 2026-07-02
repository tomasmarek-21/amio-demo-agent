import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ToolTracePanel } from "./tool-trace";

it("keeps sanitized tool evidence collapsed until requested", () => {
  render(
    <ToolTracePanel
      traces={[
        {
          id: "trace-1",
          runId: "run-1",
          toolName: "execute-sql",
          sanitizedArguments: '{"query":"SELECT count() FROM events"}',
          resultSummary: '{"count":42}',
          durationMs: 120,
          status: "completed",
          error: null,
          createdAt: new Date("2026-07-02T10:00:00Z"),
        },
      ]}
    />,
  );

  expect(screen.queryByText(/SELECT count/)).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: /Jak jsem k tomu došel/ }),
  );
  expect(screen.getByText(/SELECT count/)).toBeInTheDocument();
  expect(screen.getByText("execute-sql")).toBeInTheDocument();
});
