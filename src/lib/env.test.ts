import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const valid = {
  AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
  AZURE_OPENAI_API_KEY: "azure-secret",
  AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
  POSTHOG_API_KEY: "phx_secret",
  POSTHOG_ORGANIZATION_ID: "org-1",
  POSTHOG_PROJECT_ID: "project-1",
  DATABASE_URL: "./data/agent.sqlite",
};

describe("parseServerEnv", () => {
  it("accepts a complete server configuration", () => {
    expect(parseServerEnv(valid).AZURE_OPENAI_DEPLOYMENT).toBe("gpt-5-mini");
  });

  it("rejects a missing PostHog project", () => {
    expect(() =>
      parseServerEnv({ ...valid, POSTHOG_PROJECT_ID: "" }),
    ).toThrow(/POSTHOG_PROJECT_ID/);
  });
});
