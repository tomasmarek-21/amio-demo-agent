import { z } from "zod";
import { zodResponsesFunction } from "openai/helpers/zod";
import type { InternalFunctionTool } from "./amio-conversations-capability";

export interface MrrCapabilityConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

const mrrRowSchema = z.object({
  account_domain: z.string().min(1),
  month_start: z.string().regex(/^\d{4}-\d{2}-01$/, "must be YYYY-MM-01"),
  mrr_gross_eur: z.number().nonnegative(),
  subscription_status: z
    .enum(["active", "past_due", "canceled", "unpaid"])
    .nullable()
    .optional()
    .describe("Leave empty or null to default to 'active'."),
});

const upsertAgentMrrSchema = z.object({
  rows: z
    .array(mrrRowSchema)
    .min(1)
    .describe(
      "One entry per account for the target month. mrr_gross_eur is the monthly recurring amount in EUR computed from active Stripe subscriptions (annual plans divided by 12, CZK converted to EUR). This overwrites any previous value for that account+month.",
    ),
});

export function createMrrFunctionTool(
  config: MrrCapabilityConfig,
): InternalFunctionTool {
  return zodResponsesFunction({
    name: "upsert_agent_mrr",
    description:
      "Write MRR values computed from Stripe into accounts_revenue_monthly and accounts. " +
      "Call this after reading active Stripe subscriptions and computing monthly EUR amounts. " +
      "Supports both INSERT (new month) and UPDATE (overwrite existing). " +
      "Returns { upserted }.",
    parameters: upsertAgentMrrSchema,
    function: async ({ rows }) => {
      const res = await fetch(
        `${config.supabaseUrl}/rest/v1/rpc/upsert_agent_mrr`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: config.serviceRoleKey,
            Authorization: `Bearer ${config.serviceRoleKey}`,
          },
          body: JSON.stringify({ p_rows: rows }),
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`upsert_agent_mrr failed (${res.status}): ${text}`);
      }

      return res.json();
    },
  }) as InternalFunctionTool;
}
