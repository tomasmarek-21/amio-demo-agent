export interface PostHogCapabilityConfig {
  apiKey: string;
  organizationId?: string;
  projectId: string;
}

export function createPostHogMcpTool(config: PostHogCapabilityConfig) {
  const url = new URL("https://mcp.posthog.com/mcp");
  url.searchParams.set("mode", "cli");
  url.searchParams.set("readonly", "true");
  if (config.organizationId) {
    url.searchParams.set("organization_id", config.organizationId);
  }
  url.searchParams.set("project_id", config.projectId);

  return {
    type: "mcp" as const,
    server_label: "posthog",
    server_description:
      "Full read-only access to PostHog analytics and project data.",
    server_url: url.toString(),
    authorization: config.apiKey,
    require_approval: "never" as const,
  };
}
