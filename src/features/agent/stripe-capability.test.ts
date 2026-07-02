import { expect, it } from "vitest";
import {
  STRIPE_READ_ONLY_TOOLS,
  createStripeMcpTool,
} from "./stripe-capability";

it("exposes only Stripe read operations", () => {
  const tool = createStripeMcpTool({ apiKey: "rk_live_secret" });

  expect(tool).toMatchObject({
    type: "mcp",
    server_label: "stripe",
    server_url: "https://mcp.stripe.com",
    authorization: "rk_live_secret",
    require_approval: "never",
    allowed_tools: STRIPE_READ_ONLY_TOOLS,
  });
  expect(STRIPE_READ_ONLY_TOOLS).toContain("list_subscriptions");
  expect(STRIPE_READ_ONLY_TOOLS).toContain("retrieve_balance");
  expect(
    STRIPE_READ_ONLY_TOOLS.some((name) =>
      /^(create|update|cancel|finalize|refund)/.test(name),
    ),
  ).toBe(false);
});
