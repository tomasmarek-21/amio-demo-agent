-- Run once in the Supabase SQL editor, then refine the seeded descriptions.
-- Safe to rerun: existing catalog rows are not overwritten.

create table if not exists public.agent_data_catalog (
  schema_name text not null default 'public',
  table_name text not null,
  description text not null,
  updated_at timestamptz not null default now(),
  constraint agent_data_catalog_pkey primary key (schema_name, table_name)
);

comment on table public.agent_data_catalog is
  'Business definitions that analytics agents read before querying unfamiliar tables.';

insert into public.agent_data_catalog (schema_name, table_name, description)
values
  (
    'public',
    'payments',
    'Individual Stripe payments enriched with customer identity, fees, tax, exchange rates, service period, and EUR revenue values. One row represents one unique Stripe charge. Use paid_at for cash-payment timing and distinguish original-currency amounts from normalized EUR revenue.'
  ),
  (
    'public',
    'accounts',
    'Current account-level revenue and subscription summary for AMIO customers, with one row per unique customer domain. This is current state, not historical state; use accounts_revenue_monthly for month-by-month analysis.'
  ),
  (
    'public',
    'revenue',
    'Company-wide monthly revenue totals normalized to EUR, with one row per calendar month. month_start is always the first day of the month and the default business timezone is Europe/Prague.'
  ),
  (
    'public',
    'accounts_revenue_monthly',
    'Historical monthly account-level MRR, revenue, subscription status, and invoice attribution. Use this table for trends, cohorts, churn, expansion, contraction, and historical account comparisons.'
  ),
  (
    'public',
    'billing_customers',
    'Mapping between internal usage organizations and Stripe customers and subscriptions, with one row per unique Stripe subscription. Use it to determine which internal organization is billed through which Stripe subscription.'
  ),
  (
    'public',
    'billing_ledger',
    'Operational billing calculation ledger containing usage quantities, pricing components, tiers, invoice references, processing status, and errors. A row is a billing calculation component and is not necessarily recognized revenue or a successful payment.'
  ),
  (
    'public',
    'billing_price_rules',
    'Configuration explaining how each Stripe price is interpreted for internal usage billing, with one row per unique Stripe price ID. This is pricing configuration, not a transaction table.'
  ),
  (
    'public',
    'dashboard_month_notes',
    'Human-authored explanatory note for a dashboard month, with one row per calendar month. Treat notes as human context rather than calculated financial facts.'
  ),
  (
    'public',
    'projects',
    'AMIO project records containing customer-facing project metadata and configuration, with one row per project. Do not assume projects.account_id equals accounts.id or accounts.domain without verifying the application mapping.'
  )
on conflict (schema_name, table_name) do nothing;
