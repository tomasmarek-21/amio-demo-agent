export interface PostHogCapabilityConfig {
  apiKey: string;
  organizationId: string;
  projectId: string;
}

export function createPostHogMcpTool(config: PostHogCapabilityConfig) {
  const url = new URL("https://mcp.posthog.com/mcp");
  url.searchParams.set("mode", "cli");
  url.searchParams.set("readonly", "true");
  url.searchParams.set("features", "data_schema,sql,insights");
  url.searchParams.set("organization_id", config.organizationId);
  url.searchParams.set("project_id", config.projectId);

  return {
    type: "mcp" as const,
    server_label: "posthog",
    server_description:
      "Read-only PostHog schema discovery, SQL analytics, and saved insight queries.",
    server_url: url.toString(),
    authorization: config.apiKey,
    require_approval: "never" as const,
  };
}
