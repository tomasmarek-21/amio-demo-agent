export const STRIPE_READ_ONLY_TOOLS = [
  "search_stripe_documentation",
  "get_stripe_account_info",
  "search_stripe_resources",
  "fetch_stripe_resources",
  "stripe_api_search",
  "stripe_api_details",
  "stripe_api_read",
] as const;

export interface StripeCapabilityConfig {
  apiKey: string;
}

export function createStripeMcpTool(config: StripeCapabilityConfig) {
  return {
    type: "mcp" as const,
    server_label: "stripe",
    server_description:
      "Read-only Stripe billing, revenue, customer, invoice, payment, and subscription data.",
    server_url: "https://mcp.stripe.com",
    authorization: config.apiKey,
    allowed_tools: [...STRIPE_READ_ONLY_TOOLS],
    require_approval: "never" as const,
  };
}
