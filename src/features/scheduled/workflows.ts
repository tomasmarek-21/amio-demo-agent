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

  return `You are the AMIO MRR calculation agent. Your task is to compute Monthly Recurring Revenue (MRR) for ${displayMonth} and write the results to Supabase.

## Target month
${displayMonth} — from ${targetMonth} to ${monthEnd}.

## Step 1 — Stripe invoices
Use the Stripe MCP tool to list invoices. Find all invoices where the billing period (period_start–period_end on the invoice line items, or the invoice's own period fields) overlaps with the target month.

Include only invoices with status \`paid\` or \`open\`.
Exclude: \`draft\`, \`void\`, fully refunded invoices, and any invoice where total_excluding_tax ≤ 0 (or subtotal ≤ 0 when total_excluding_tax is null).

## Step 2 — MRR per invoice
Base amount = total_excluding_tax. If null, use subtotal.
Period months = round((period_end − period_start in days) / 30.44), minimum 1.
MRR contribution = base_amount / period_months.

## Step 3 — Priority for overlapping invoices
If both a paid and an open invoice cover the target month for the same customer domain, use only the paid invoice. Open invoices are used only when no paid invoice exists.

## Step 4 — Currency conversion to EUR
If invoice currency is EUR: no conversion needed.
Otherwise:
1. Check the Supabase \`payments\` table for \`exchange_rate_to_eur\` where \`stripe_invoice_id\` matches.
2. If not found: use the most recent \`exchange_rate_to_eur\` for that currency from the payments table.
3. If still not found: for CZK use 0.041 EUR/CZK. For other currencies, log a warning and skip the account.

## Step 5 — Group by customer domain
Extract the domain from the Stripe customer email (e.g. billing@footshop.cz → footshop.cz).
If multiple invoices or lines belong to the same domain, sum their MRR contributions.
Set mrr_source = "actual" for every domain covered by a Stripe invoice (paid or open).

## Step 6 — Estimates for active accounts with no invoice
Query the Supabase \`accounts\` table for domains with subscription_status = 'active'.
For each active domain that has NO Stripe invoice overlapping the target month:
- Find their most recent paid Stripe invoice before the target month.
- If that invoice's period ended less than 2 months before ${targetMonth}:
  → Use the same normalized MRR. mrr_source = "estimate".
- If the period ended 2+ months before ${targetMonth} with no newer invoice:
  → mrr_gross_eur = 0, mrr_source = "estimate" (suspected churn).
- If no Stripe history: check the previous month's mrr_gross_eur in accounts_revenue_monthly.
  → Use that value. mrr_source = "estimate".
- If nothing is available: skip this account.

## Step 7 — Manual accounts (always include)
- donio.cz: mrr_gross_eur = 312.50, mrr_source = "actual", subscription_status = "active"

## Step 8 — Write results
Call \`upsert_agent_mrr\` once with ALL computed rows. Each row must include:
- account_domain (required)
- month_start: "${targetMonth}" (required)
- mrr_gross_eur in EUR (required)
- mrr_source: "actual" or "estimate" (required)
- subscription_status: "active" unless you have a specific reason otherwise

## Step 9 — Complete
Call \`complete_scheduled_run\` with a concise Slack summary (3–5 lines):
- Total MRR for ${displayMonth}
- Number of accounts (X actual, Y estimate)
- Any notable changes vs previous month if easily available
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
