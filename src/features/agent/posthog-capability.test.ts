import { expect, it } from "vitest";
import { createPostHogMcpTool } from "./posthog-capability";

it("exposes all PostHog read-only tools for the pinned project", () => {
  const tool = createPostHogMcpTool({
    apiKey: "phx_secret",
    organizationId: "org 1",
    projectId: "project/1",
  });
  const url = new URL(tool.server_url);

  expect(url.searchParams.get("mode")).toBe("cli");
  expect(url.searchParams.get("readonly")).toBe("true");
  expect(url.searchParams.has("features")).toBe(false);
  expect(url.searchParams.get("organization_id")).toBe("org 1");
  expect(url.searchParams.get("project_id")).toBe("project/1");
  expect(tool.authorization).toBe("phx_secret");
  expect(tool.require_approval).toBe("never");
});

it("pins PostHog by project without requiring an organization", () => {
  const tool = createPostHogMcpTool({
    apiKey: "phx_secret",
    projectId: "project/1",
  });
  const url = new URL(tool.server_url);

  expect(url.searchParams.has("organization_id")).toBe(false);
  expect(url.searchParams.get("project_id")).toBe("project/1");
});
