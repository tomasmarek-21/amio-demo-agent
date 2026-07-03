export const NOTION_READ_ONLY_TOOLS = ["search", "fetch"] as const;

export function createNotionMcpTool(accessToken: string) {
  return {
    type: "mcp" as const,
    server_label: "notion",
    server_description:
      "Read-only access to AMIO's internal Notion knowledge. Search with natural-language queries, fetch only the most relevant pages, and include their direct Notion links in answers.",
    server_url: "https://mcp.notion.com/mcp",
    authorization: accessToken,
    allowed_tools: [...NOTION_READ_ONLY_TOOLS],
    require_approval: "never" as const,
  };
}
