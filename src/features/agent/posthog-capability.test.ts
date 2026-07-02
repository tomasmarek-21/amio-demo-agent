import { expect, it } from "vitest";
import { createPostHogMcpTool } from "./posthog-capability";

it("pins PostHog to analytics-only read access", () => {
  const tool = createPostHogMcpTool({
    apiKey: "phx_secret",
    organizationId: "org 1",
    projectId: "project/1",
  });
  const url = new URL(tool.server_url);

  expect(url.searchParams.get("mode")).toBe("cli");
  expect(url.searchParams.get("readonly")).toBe("true");
  expect(url.searchParams.get("features")).toBe("data_schema,sql,insights");
  expect(url.searchParams.get("organization_id")).toBe("org 1");
  expect(url.searchParams.get("project_id")).toBe("project/1");
  expect(tool.authorization).toBe("phx_secret");
  expect(tool.require_approval).toBe("never");
});
