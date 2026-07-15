export type Capability =
  | "posthog"
  | "stripe"
  | "supabase"
  | "mrr"
  | "notion"
  | "amio-conversations";

export interface ScheduledWorkflowContext {
  targetMonth: string; // "YYYY-MM-01"
}

export interface ScheduledWorkflow {
  name: string;
  prompt: string | ((ctx: ScheduledWorkflowContext) => string);
  systemPrompt?: (ctx: ScheduledWorkflowContext) => string;
  capabilities: Capability[];
  n8nWorkflowUrl?: string;
}

function mrrSystemPrompt({ targetMonth }: ScheduledWorkflowContext): string {
  const [year, month] = targetMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  const displayMonth = new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  return `You are the AMIO MRR calculation agent for ${displayMonth} (${targetMonth} – ${monthEnd}).

CRITICAL: Do NOT write any text or explanation. Your only output is tool calls. Compute everything silently and call tools immediately.

## Data retrieval (2 tool calls max)

**Stripe:** Call stripe_api_search ONCE with query "invoices" filtered to the billing period overlapping ${targetMonth}–${monthEnd}, status:paid OR status:open. Do NOT call stripe_api_details or stripe_api_read — use only the search results.

**Supabase (if non-EUR invoices exist):** Call execute_sql ONCE:
\`\`\`sql
SELECT currency, MAX(exchange_rate_to_eur) as rate
FROM payments WHERE currency != 'eur' GROUP BY currency
\`\`\`

## MRR computation rules (do in your head, no text)

- Exclude: draft, void, refunded, total ≤ 0
- MRR per invoice = total_excluding_tax (or subtotal) / max(1, round(period_days / 30.44))
- Currency: EUR → no conversion. CZK → use rate from Supabase or fallback 0.041. Other → skip.
- Domain = customer email domain (billing@footshop.cz → footshop.cz)
- Multiple invoices per domain → sum MRR. Paid invoice wins over open.
- mrr_source = "actual" for all Stripe-covered domains.

## Estimates for active accounts with no invoice

If active accounts exist with no Stripe invoice for ${displayMonth}:
- Recent gap (< 2 months): use previous MRR, mrr_source = "estimate"
- Long gap (≥ 2 months): mrr_gross_eur = 0, mrr_source = "estimate"

## Always include

- donio.cz: mrr_gross_eur = 312.50, mrr_source = "actual"

## Write results immediately

Call \`upsert_agent_mrr\` with ALL rows at once. Required fields per row: account_domain, month_start = "${targetMonth}", mrr_gross_eur (EUR), mrr_source, subscription_status = "active".

Then call \`complete_scheduled_run\` with a 3-line Slack summary: total MRR, account count (X actual / Y estimate), one notable change if any.
`.trim();
}

export const SCHEDULED_WORKFLOWS: Record<string, ScheduledWorkflow> = {
  "weekly-mrr-report": {
    name: "MRR Agent Run",
    systemPrompt: mrrSystemPrompt,
    prompt: "Proceed with the MRR calculation as described in your instructions.",
    capabilities: ["stripe", "supabase", "mrr"],
    n8nWorkflowUrl: "https://amio2.app.n8n.cloud/workflow/RyHna4xYDrVgvAOI",
  },
  "conversation-quality-check": {
    name: "Conversation Quality Check",
    prompt:
      "Analyze AMIO conversations from the last 7 days. Identify the top 3 failure patterns (unresolved requests, escalations, low-confidence answers). Call complete_scheduled_run with a brief Slack summary of findings.",
    capabilities: ["amio-conversations"],
    n8nWorkflowUrl: undefined,
  },
};

export function getWorkflow(id: string): ScheduledWorkflow | null {
  return SCHEDULED_WORKFLOWS[id] ?? null;
}
