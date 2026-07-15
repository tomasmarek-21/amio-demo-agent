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
  const displayMonth = new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const prevDate = new Date(year, month - 2, 1);
  const previousMonthStart = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-01`;
  const today = new Date().toISOString().slice(0, 10);

  return `Today's date is ${today}.

Target month: ${displayMonth}
Month start: ${targetMonth}
Previous month start: ${previousMonthStart}

Your task is to calculate Monthly Recurring Revenue (MRR) for the target month using Stripe and Supabase, then write the results using the \`upsert_agent_mrr\` tool.

Complete the entire workflow independently. Always perform the final upsert unless no valid rows can be calculated.

# Important principles

- Always calculate MRR using historical data that was valid for the target month.
- Never use the customer's current subscription price if it differs from what was actually billed for the target month.
- A customer may have multiple qualifying invoices in the same month. Always include every qualifying invoice.
- The final MRR for an account is the sum of all qualifying invoice contributions for that month.
- Accuracy is more important than speed.

# MRR definition

For this task, MRR represents invoice revenue normalized to one month.

Include both:

- recurring subscription invoices
- one-time invoices

Do not exclude invoices simply because they are one-time or not attached to a recurring Stripe subscription.

Use the invoice amount:

1. \`total_excluding_tax\`
2. otherwise \`subtotal\`

Always use the amount after discounts and before tax.

Exclude:

- negative invoices
- fully refunded invoices

If an invoice has a recognizable service period:

months = max(1, round(service_period_days / 30.44))

invoice_mrr = invoice_amount / months

Examples:

- monthly invoice → divide by 1
- quarterly invoice → divide by 3
- annual invoice → divide by 12

If an invoice is one-time or its service period cannot be determined reliably:

- treat it as covering exactly one month
- set months = 1
- include the full invoice amount
- assign it to the month of \`finalized_at\`
- if \`finalized_at\` is unavailable, use the invoice creation date

Never skip a valid invoice only because its service period is missing or unclear.

# Step 1 – Retrieve invoices

Retrieve **all** invoices that are relevant for the target month.

Use invoices that were valid for the target month, **not the customer's current subscription state**.

An invoice is relevant when:

- its service period overlaps the target month, or
- it has no recognizable service period but was finalized during the target month, or
- it has no recognizable service period or finalized date but was created during the target month.

Include:

- paid
- open

Exclude:

- draft
- void
- fully refunded
- negative invoices

Retrieve all pages when pagination is used.

Collect:

- invoice id
- customer id
- customer email
- invoice amount
- currency
- service period (if available)
- finalized_at
- created date
- invoice status

Do not filter by recurring vs one-time invoices.

# Step 2 – Calculate invoice MRR

For every invoice:

- if a reliable service period exists, normalize the invoice across that period
- otherwise treat it as a one-month invoice

When multiple records exist for the same service period, prefer:

1. paid
2. open
3. preview

Never count the same service period twice.

# Step 3 – Convert to EUR

If currency is EUR, use the value directly.

Otherwise:

- use the invoice-specific exchange rate from Supabase when available
- otherwise use the latest available rate for the same currency
- for CZK use 0.041 as the final fallback
- if another currency has no reliable exchange rate, skip the invoice and report it

# Step 4 – Aggregate per account

Extract the domain from the customer email.

Example:

billing@footshop.cz → footshop.cz

Normalize it:

- lowercase
- trim whitespace
- remove leading \`www.\`

A customer may have multiple qualifying invoices in the same target month.

These may include:

- multiple subscriptions
- one-time invoices
- additional invoices
- invoice adjustments

Always include **every qualifying invoice**.

Never stop after finding the first invoice.

The final account MRR equals the **sum of all qualifying invoice contributions**.

Set:

- \`mrr_source = "actual"\`

Determine \`subscription_status\` from Stripe:

- active
- past_due
- canceled
- unpaid

If uncertain, use \`active\`.

# Step 5 – Estimate missing accounts

Retrieve all account domains that already have a revenue row for the target month.

Only after checking **all qualifying Stripe invoices**, estimate the remaining accounts.

If a recent past invoice exists:

- reuse its normalized monthly value
- \`mrr_source = "estimate"\`

If the prepaid period ended more than two months before the target month and no newer payment exists:

- \`mrr_gross_eur = 0\`
- \`mrr_source = "estimate"\`
- \`subscription_status = "canceled"\`

Otherwise, fall back to the previous month's value stored in Supabase.

If nothing can be found, skip the account.

# Step 6 – Manual accounts

Always include:

- donio.cz
  - mrr_gross_eur = 312.50
  - mrr_source = "actual"
  - subscription_status = "active"

# Step 7 – Validate

Before writing, verify that:

- every qualifying invoice for the target month was processed
- customers with multiple invoices have all invoices included
- one-time invoices were not omitted
- invoice amounts were normalized correctly
- duplicate service periods were not counted twice

# Step 8 – Write

Call \`upsert_agent_mrr\` exactly once.

Pass all rows in one tool call:

{
  "rows": [
    {
      "account_domain": "footshop.cz",
      "month_start": "${targetMonth}",
      "mrr_gross_eur": 1250.00,
      "mrr_source": "actual",
      "subscription_status": "active"
    }
  ]
}

# Step 9 – Slack

Do not send a Slack message after every execution.

Only send one if there is something requiring human attention, for example:

- skipped invoices
- missing exchange rates
- suspected churn
- failed writes
- unusually large MRR changes
- inconsistent Stripe data
- anything requiring manual investigation

If everything completed successfully without noteworthy findings, do not send a Slack message.

# Step 10 – Final report

Report:

- target month
- total MRR
- number of processed accounts
- number of upserted rows
- actual vs estimate counts
- suspected churn accounts
- skipped accounts and invoices
- whether the upsert succeeded`.trim();
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
