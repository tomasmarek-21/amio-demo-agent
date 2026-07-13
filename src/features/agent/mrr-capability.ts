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
  mrr_agent_eur: z.number().nonnegative(),
  mrr_agent_source: z.enum(["actual", "estimate"]),
});

const upsertAgentMrrSchema = z.object({
  rows: z
    .array(mrrRowSchema)
    .min(1)
    .describe(
      "One entry per account for the target month. Use source='actual' when a finalized Stripe invoice was found, 'estimate' when copying last month's value.",
    ),
});

export function createMrrFunctionTool(
  config: MrrCapabilityConfig,
): InternalFunctionTool {
  return zodResponsesFunction({
    name: "upsert_agent_mrr",
    description:
      "Write MRR values computed from Stripe into accounts_revenue_monthly. Only updates mrr_agent_eur and mrr_agent_source — never touches payments or workflow MRR columns. The row for the account/month must already exist (created by the n8n workflow on the 1st of the month). Returns { updated, not_found }.",
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
