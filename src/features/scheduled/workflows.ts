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

Complete the entire workflow independently. Do not stop after collecting the data. Always perform the final upsert unless no valid rows can be calculated.

# MRR definition

MRR is recurring subscription revenue normalized to one month.

Use the invoice amount:

1. Use \`total_excluding_tax\` when available.
2. If \`total_excluding_tax\` is null, use \`subtotal\`.
3. Always use the amount after discounts and before tax.
4. Exclude invoices with a negative total.
5. Exclude fully refunded invoices.

All final MRR values must be converted to EUR.

# Step 1 – Find Stripe invoices covering the target month

Retrieve all Stripe invoices whose service period overlaps with the target month.

Determine the service period using:

1. \`lines[].period.start\` and \`lines[].period.end\`
2. If line-level periods are unavailable, use the invoice-level period.

Include invoices with status:

- \`paid\`
- \`open\`

Exclude invoices with status:

- \`draft\`
- \`void\`

Also exclude fully refunded invoices and invoices with a negative total.

For every relevant invoice collect:

- Stripe invoice ID
- Stripe customer ID
- customer email
- invoice amount
- currency
- service period start
- service period end
- invoice status
- finalized_at

Retrieve all pages when the Stripe tool uses pagination.

# Step 2 – Normalize invoices to monthly revenue

Calculate how many months each invoice covers:

months = round(service period length in days / 30.44)

The minimum value is 1.

Examples:

- Monthly subscription → 1 month
- Annual subscription → 12 months
- Other billing periods → calculate from the service period

Calculate:

invoice_mrr = invoice amount / months

# Step 3 – Prioritize actual billed invoices

For annual or multi-month subscriptions covering the target month, use this priority:

1. Paid invoice
2. Open finalized invoice
3. Upcoming invoice preview only if neither exists

Always prefer an actual billed invoice over a forecast.

Do not count the same subscription period more than once.

# Step 4 – Convert to EUR

If the invoice currency is EUR, use the calculated monthly amount directly.

For any other currency:

- Look up an exchange rate for the specific invoice in Supabase.
- If none exists, use the most recent available exchange rate for the same currency from Supabase.
- For CZK only, use \`0.041\` as the final fallback.
- If no reliable exchange rate exists for another currency, skip the invoice and report it at the end.

# Step 5 – Match invoices to accounts

Extract the domain from the Stripe customer email.

Example:

billing@footshop.cz → footshop.cz

Normalize the domain by:

- converting it to lowercase
- trimming whitespace
- removing a leading \`www.\` if present

Use the normalized domain as \`account_domain\`.

If multiple invoices belong to the same account, sum all monthly EUR contributions into one value.

For every account calculated from a current Stripe invoice:

- \`mrr_source = "actual"\`

Determine \`subscription_status\` from Stripe:

- \`active\`
- \`past_due\`
- \`canceled\`
- \`unpaid\`

If no more specific status can be determined, use \`active\`.

# Step 6 – Estimate accounts without a current Stripe invoice

Retrieve from Supabase all account domains that already have a revenue row for the target month.

For every account that exists in Supabase but was not covered by the current Stripe invoices:

A. Look for the customer's most recent past Stripe invoice.

If its prepaid service period ended less than two months before the target month:

- calculate its normalized monthly MRR
- set \`mrr_source = "estimate"\`
- preserve the latest known subscription status when possible
- otherwise use \`active\`

If its prepaid service period ended more than two months before the target month and no newer payment exists:

- set \`mrr_gross_eur = 0\`
- set \`mrr_source = "estimate"\`
- set \`subscription_status = "canceled"\`

B. If no suitable Stripe invoice exists:

Retrieve the previous month's MRR and subscription status from Supabase.

If available:

- reuse the previous MRR
- set \`mrr_source = "estimate"\`
- preserve the previous subscription status when available
- otherwise use \`active\`

C. If no usable information exists anywhere:

Skip the account and include the reason in the final report.

# Step 7 – Add manually billed accounts

Always include these accounts directly without checking Stripe:

- donio.cz
  - \`mrr_gross_eur = 312.50\`
  - \`mrr_source = "actual"\`
  - \`subscription_status = "active"\`

# Step 8 – Prepare the final result

Create exactly one row per account.

Each row must contain:

- \`account_domain\`
- \`month_start\`
- \`mrr_gross_eur\`
- \`mrr_source\`
- \`subscription_status\`

Requirements:

- \`month_start\` must equal \`${targetMonth}\`
- round \`mrr_gross_eur\` to two decimal places
- \`mrr_gross_eur\` must never be negative
- \`mrr_source\` must be either \`actual\` or \`estimate\`
- \`subscription_status\` must be one of:
  - \`active\`
  - \`past_due\`
  - \`canceled\`
  - \`unpaid\`
  - \`null\`
- do not include duplicate account domains
- do not include rows with null MRR values

# Step 9 – Write the results

Call \`upsert_agent_mrr\` exactly once.

Pass all calculated rows in a single tool call using this structure:

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

Do not call the write tool separately for individual accounts.

Only report that the data was written if the tool call succeeds.

# Step 10 – Final report

After the upsert, report:

- Target month
- Total MRR
- Number of accounts processed
- Number of rows successfully upserted
- Count of \`actual\` accounts
- Count of \`estimate\` accounts
- Accounts set to zero due to suspected churn
- Accounts skipped and why
- Invoices skipped because no exchange rate was available
- Whether the upsert completed successfully`.trim();
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
