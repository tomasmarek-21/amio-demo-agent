export const STRIPE_READ_ONLY_TOOLS = [
  "get_stripe_account_info",
  "retrieve_balance",
  "list_coupons",
  "list_customers",
  "list_disputes",
  "list_invoices",
  "list_payment_intents",
  "list_prices",
  "list_products",
  "list_subscriptions",
  "search_stripe_resources",
  "fetch_stripe_resources",
  "search_stripe_documentation",
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
