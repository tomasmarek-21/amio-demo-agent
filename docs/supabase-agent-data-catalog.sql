-- Run once in the Supabase SQL editor, then refine the seeded descriptions.
-- Safe to rerun: existing catalog rows are not overwritten.

create table if not exists public.agent_data_catalog (
  schema_name text not null default 'public',
  table_name text not null,
  description text not null,
  row_grain text not null default '',
  important_columns text not null default '',
  relationships text not null default '',
  usage_notes text not null default '',
  updated_at timestamptz not null default now(),
  constraint agent_data_catalog_pkey primary key (schema_name, table_name)
);

comment on table public.agent_data_catalog is
  'Business definitions that analytics agents read before querying unfamiliar tables.';

insert into public.agent_data_catalog (
  schema_name,
  table_name,
  description,
  row_grain,
  important_columns,
  relationships,
  usage_notes
)
values
  (
    'public',
    'payments',
    'Individual Stripe payments enriched with customer identity, fees, tax, exchange rates, service period, and EUR revenue values.',
    'One row per unique Stripe charge.',
    'stripe_charge_id, stripe_invoice_id, stripe_customer_id, account_key, paid_at, amount_original, currency_original, revenue_gross_eur, revenue_net_eur, service_period_start, service_period_end, billing_interval',
    'Join to accounts primarily through account_key/domain when that mapping is valid; Stripe identifiers connect the row to billing and Stripe data.',
    'Use paid_at for cash-payment timing. Distinguish original-currency amounts from normalized EUR revenue.'
  ),
  (
    'public',
    'accounts',
    'Current account-level revenue and subscription summary for AMIO customers.',
    'One row per unique customer domain.',
    'id, domain, name, attio_company_id, subscription_status, mrr_net_eur, mrr_gross_eur, revenue_net_eur, revenue_gross_eur',
    'accounts.id is referenced by accounts_revenue_monthly.account_id; domain can connect account-level imports.',
    'This is current state, not historical state. Use accounts_revenue_monthly for month-by-month analysis.'
  ),
  (
    'public',
    'revenue',
    'Company-wide monthly revenue totals normalized to EUR.',
    'One row per calendar month.',
    'month_start, revenue_eur, revenue_gross_eur, revenue_net_eur, timezone',
    'Aggregate counterpart of accounts_revenue_monthly.',
    'month_start is always the first day of the month. Default business timezone is Europe/Prague.'
  ),
  (
    'public',
    'accounts_revenue_monthly',
    'Historical monthly account-level MRR, revenue, subscription status, and invoice attribution.',
    'One row per account and calendar month.',
    'account_id, account_domain, month_start, mrr_net_eur, mrr_gross_eur, revenue_net_eur, revenue_gross_eur, subscription_status, mrr_invoice_ids, mrr_finalized',
    'account_id references accounts.id; monthly totals can be compared with revenue by month_start.',
    'Prefer this table for trends, cohorts, churn, expansion, contraction, and historical account comparisons.'
  ),
  (
    'public',
    'billing_customers',
    'Mapping between internal usage organizations and Stripe customers/subscriptions, including the billing rule assigned to each subscription.',
    'One row per unique Stripe subscription.',
    'usage_org_id, usage_org_name, usage_match_key, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, billing_rule_type',
    'Connects usage organization identifiers to Stripe and billing_ledger.',
    'Use this table to determine which internal organization is billed through which Stripe subscription.'
  ),
  (
    'public',
    'billing_ledger',
    'Operational billing calculation ledger containing usage quantities, pricing components, tiers, invoice references, processing status, and errors.',
    'One row per billing key, subscription, billing period, and billing component calculation.',
    'billing_key, stripe_subscription_id, usage_org_id, period_start, period_end, billing_type, component_type, quantity_actual, unit_price, currency, status, error_message, stripe_invoice_id',
    'Join to billing_customers by stripe_subscription_id and to billing_price_rules by price_id.',
    'Use for billing operations and calculation diagnostics. A row is not necessarily recognized revenue or a successful payment.'
  ),
  (
    'public',
    'billing_price_rules',
    'Configuration that explains how each Stripe price is interpreted for internal usage billing.',
    'One row per unique Stripe price ID.',
    'price_id, component_type, usage_metric, price_rule_type, base_size, base_fee, additional_fee, block_size, notes',
    'Join to billing_ledger by price_id.',
    'This is pricing configuration, not a transaction table.'
  ),
  (
    'public',
    'dashboard_month_notes',
    'Human-authored explanatory note shown for a particular dashboard month.',
    'One row per calendar month.',
    'month_start, note, updated_at',
    'Relates to revenue and accounts_revenue_monthly through month_start.',
    'Treat notes as human context, not as calculated financial facts.'
  ),
  (
    'public',
    'projects',
    'AMIO project records containing customer-facing project metadata and configuration.',
    'One row per project.',
    'id, account_id, name, industry, website, description, language, phone_numbers, created_at',
    'account_id is an application account identifier; no foreign-key relationship to public.accounts is declared in the supplied schema.',
    'Do not assume projects.account_id equals accounts.id or accounts.domain without verifying the application mapping.'
  )
on conflict (schema_name, table_name) do nothing;

