export const SUPABASE_READ_ONLY_TOOLS = [
  "list_tables",
  "execute_sql",
] as const;

export interface SupabaseCapabilityConfig {
  accessToken: string;
  projectRef: string;
}

export function createSupabaseMcpTool(config: SupabaseCapabilityConfig) {
  const url = new URL("https://mcp.supabase.com/mcp");
  url.searchParams.set("project_ref", config.projectRef);
  url.searchParams.set("read_only", "true");
  url.searchParams.set("features", "database");

  return {
    type: "mcp" as const,
    server_label: "supabase",
    server_description:
      "Read-only access to AMIO's Supabase business database. Before querying unfamiliar business tables, use execute_sql to read their definitions from public.agent_data_catalog. Use list_tables when the current physical schema is needed.",
    server_url: url.toString(),
    authorization: config.accessToken,
    allowed_tools: [...SUPABASE_READ_ONLY_TOOLS],
    require_approval: "never" as const,
  };
}
