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

  return `## Today's date is ${today}.

Target month: ${displayMonth}
Month start: ${targetMonth}
Previous month start: ${previousMonthStart}

Your task is to calculate MRR for the target month using historical Stripe and Supabase data, then write the final results using the \`upsert_agent_mrr\` tool.

Complete the entire workflow independently. Always perform the final upsert unless no valid rows can be calculated.

# Write scope

Only calculate and update MRR for the specified target month.

Every row sent to \`upsert_agent_mrr\` must use:

\`month_start = "${targetMonth}"\`

Do not create, update, overwrite, or otherwise modify MRR values for any previous, current, or future month other than the target month.

Historical data from other months may be read for calculation or estimation, but it must never be written back or changed.

# Core principles

- Calculate MRR from data that was valid for the target month.
- Do not use the customer's current subscription price or current billing state when calculating a historical month.
- Include both subscription invoices and one-time invoices.
- A customer may have multiple independent invoices or services, but consecutive billing cycles of the same subscription must not be counted twice.
- Retrieve all relevant records and all pagination pages.
- Accuracy is more important than speed.

# MRR definition

For this task, MRR represents invoice revenue assigned and normalized to the target month.

Use the invoice amount:

1. Use \`total_excluding_tax\` when available.
2. Otherwise use \`subtotal\`.
3. Use the amount after discounts and before tax.

Exclude:

- draft invoices
- void invoices
- fully refunded invoices
- invoices with a negative total

Include invoices with status:

- paid
- open

# Invoice calculation

## Invoice with a reliable service period

If an invoice has a clear service period:

months = max(1, round(service_period_days / 30.44))

invoice_mrr = invoice_amount / months

Examples:

- monthly invoice → divide by 1
- quarterly invoice → divide by 3
- annual invoice → divide by 12

The invoice contributes to the target month only when its selected service period belongs to or covers the target month according to the billing-cycle rules below.

## One-time invoice or missing service period

If an invoice is one-time, is not connected to a subscription, or its service period cannot be determined reliably:

- treat it as covering one month
- set \`months = 1\`
- include the full invoice amount
- assign it to the month of \`finalized_at\`
- if \`finalized_at\` is unavailable, use the invoice creation date

Never skip an otherwise valid invoice only because it is one-time or has no usable service period.

# Step 1 – Retrieve relevant historical invoices

Retrieve all Stripe invoices relevant to the target month.

Do not retrieve only current subscriptions or current invoices. The calculation must represent what applied to the historical target month, even if the customer later upgraded, downgraded, renewed, changed price, or canceled.

An invoice is initially relevant when:

- its service period overlaps the target month, or
- it has no reliable service period and was finalized during the target month, or
- it has no reliable service period or finalized date and was created during the target month

Collect:

- invoice ID
- customer ID
- customer email
- subscription ID, when available
- invoice-line or service identifier, when available
- invoice amount
- currency
- service period start and end
- status
- \`finalized_at\`
- creation date
- whether it is subscription-based or one-time

Do not filter out invoices based on whether Stripe classifies them as recurring or one-time.

# Step 2 – Prevent double-counting billing cycles

A single account may have multiple valid invoices, but adjacent billing cycles of the same subscription must never both contribute to the same target month.

Group subscription invoice contributions by:

1. Stripe subscription ID
2. If subscription ID is unavailable, use the most reliable combination of customer, price, product, invoice line, or service identifiers

For each subscription or recurring service:

- identify all billing periods that overlap the target month
- calculate how many days each period overlaps the target month
- select only the billing period with the greatest overlap
- exclude adjacent billing periods with a smaller overlap from that target month

Example for May:

- April 30 → May 31 overlaps almost all of May
- May 31 → June 30 overlaps only the final day of May

Use only April 30 → May 31 for May.

The May 31 → June 30 billing cycle belongs to June and must not also be counted in May.

If two periods have the same overlap, prefer in this order:

1. the period containing the first day of the target month
2. the period that started earlier
3. the paid invoice
4. the open finalized invoice

For each subscription or recurring service, include at most one regular billing-cycle contribution in the target month.

This deduplication applies only to consecutive or duplicate billing cycles of the same subscription or service.

Do not use it to remove:

- a separate subscription
- a genuinely different independent service
- a separate one-time invoice
- an additional invoice that represents distinct revenue

# Step 3 – Handle duplicate invoice representations

If multiple Stripe records represent the same invoice, service period, or billed service, use this priority:

1. paid invoice
2. open finalized invoice
3. upcoming invoice preview only when neither exists

Do not count the same invoice, service, or service period more than once.

An upcoming preview must never be added on top of a paid or open invoice for the same service period.

# Step 4 – Convert to EUR

If the invoice currency is EUR, use the calculated amount directly.

For another currency:

- use the invoice-specific exchange rate from Supabase when available
- otherwise use the most recent available exchange rate for the same currency
- for CZK, use \`0.041\` as the final fallback
- if no reliable rate exists for another currency, skip the invoice and include it in the final report

# Step 5 – Match invoices to accounts

Extract the domain from the Stripe customer email.

Example:

billing@footshop.cz → footshop.cz

Normalize the domain by:

- converting it to lowercase
- trimming whitespace
- removing a leading \`www.\`

Use the result as \`account_domain\`.

A customer may have multiple qualifying invoice contributions in the target month.

Include all independent contributions, including:

- different subscriptions
- different independent services
- one-time invoices assigned to the target month
- additional invoices representing separate revenue

Never stop after the first matching invoice.

Do not sum consecutive billing cycles of the same subscription.

The final account MRR is:

mrr_gross_eur = sum of all deduplicated independent invoice contributions for the account

For accounts calculated from target-month Stripe invoices:

- \`mrr_source = "actual"\`

Determine \`subscription_status\` from the most relevant Stripe information:

- \`active\`
- \`past_due\`
- \`canceled\`
- \`unpaid\`

If no more specific status can be determined, use \`active\`.

A one-time invoice without a subscription does not by itself mean that the account is canceled.

# Step 6 – Estimate accounts without target-month invoices

Retrieve from Supabase all account domains that already have a revenue row for the target month.

Only use estimation after checking:

- all subscription invoices valid for the target month
- all independent services
- all one-time invoices assigned to the target month
- all pages of Stripe results

For every remaining account:

## Recent past invoice

Find its most recent historical Stripe invoice.

If its prepaid service period ended less than two months before the target month:

- calculate its normalized monthly value
- set \`mrr_source = "estimate"\`
- preserve the latest known subscription status when possible
- otherwise use \`active\`

If its prepaid period ended more than two months before the target month and there has been no newer payment:

- set \`mrr_gross_eur = 0\`
- set \`mrr_source = "estimate"\`
- set \`subscription_status = "canceled"\`

## Previous-month fallback

If no suitable historical Stripe invoice exists, retrieve the previous month's MRR and subscription status from Supabase.

If available:

- reuse the previous MRR
- set \`mrr_source = "estimate"\`
- preserve the previous subscription status when available
- otherwise use \`active\`

If no usable information exists, skip the account and report the reason.

Reading a previous month's value is allowed only as an estimation input. Do not modify the previous month's row.

# Step 7 – Manual accounts

Always include the following account without checking Stripe:

- \`donio.cz\`
  - \`mrr_gross_eur = 312.50\`
  - \`mrr_source = "actual"\`
  - \`subscription_status = "active"\`

# Step 8 – Final validation

Before writing, verify that:

- historical data valid for the target month was used
- current subscription pricing did not replace historical pricing
- all pagination pages were retrieved
- all qualifying one-time invoices were included
- customers with multiple independent invoices have all valid contributions included
- no subscription has more than one consecutive billing-cycle contribution for the target month
- adjacent billing cycles were assigned to the correct month
- no invoice, service, or service period was counted twice
- all invoice contributions were converted and normalized correctly
- exactly one final row exists per account domain
- every row uses \`month_start = "${targetMonth}"\`
- no data for any other month will be written or modified

# Step 9 – Prepare and write rows

Each row must contain:

- \`account_domain\`
- \`month_start\`
- \`mrr_gross_eur\`
- \`mrr_source\`
- \`subscription_status\`

Requirements:

- \`month_start\` must equal exactly \`${targetMonth}\`
- never send a row with any other \`month_start\`
- round \`mrr_gross_eur\` to two decimal places
- \`mrr_gross_eur\` must be greater than or equal to 0
- \`mrr_source\` must be \`actual\` or \`estimate\`
- \`subscription_status\` must be \`active\`, \`past_due\`, \`canceled\`, \`unpaid\`, or \`null\`
- do not include duplicate account domains
- do not include null MRR values

Call \`upsert_agent_mrr\` exactly once with all final rows:

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

Do not write rows for any month other than the target month.

Only report that the write succeeded if the tool call succeeds.

# Step 10 – Slack notifications

Do not send a Slack message after every execution.

Send a Slack message only when there is a noteworthy finding or something requiring human attention, such as:

- failed or partially failed upsert
- invoices or accounts that could not be processed
- missing exchange rates
- suspected churn that should be reviewed
- inconsistent or ambiguous Stripe data
- possible duplicate billing cycles that could not be resolved
- unusually large MRR changes
- anything else requiring manual investigation

If the calculation and upsert complete successfully without noteworthy findings, do not send a Slack message.

# Step 11 – Final report

Report:

- target month
- total MRR
- number of processed accounts
- number of successfully upserted rows
- count of actual accounts
- count of estimate accounts
- accounts set to zero due to suspected churn
- skipped accounts or invoices and reasons
- whether any duplicate billing cycles were removed
- confirmation that only the target month was updated
- whether the upsert succeeded
- whether a Slack message was sent and why`.trim();
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
