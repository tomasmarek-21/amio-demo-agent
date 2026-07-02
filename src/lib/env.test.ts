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
    expect(parseServerEnv(valid)).toMatchObject({
      AGENT_PROVIDER: "azure",
      AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
    });
  });

  it("rejects a missing PostHog project", () => {
    expect(() =>
      parseServerEnv({ ...valid, POSTHOG_PROJECT_ID: "" }),
    ).toThrow(/POSTHOG_PROJECT_ID/);
  });

  it("accepts a missing PostHog organization when the project is pinned", () => {
    expect(
      parseServerEnv({ ...valid, POSTHOG_ORGANIZATION_ID: "" }),
    ).toMatchObject({
      POSTHOG_ORGANIZATION_ID: undefined,
      POSTHOG_PROJECT_ID: "project-1",
    });
  });

  it("accepts the fake test provider without production secrets", () => {
    expect(
      parseServerEnv({
        AGENT_PROVIDER: "fake",
        DATABASE_URL: "./data/e2e.sqlite",
      }),
    ).toEqual({
      AGENT_PROVIDER: "fake",
      DATABASE_URL: "./data/e2e.sqlite",
    });
  });
});
