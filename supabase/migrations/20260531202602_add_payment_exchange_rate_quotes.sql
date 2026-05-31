alter table public.qb_payments
  add column if not exists exchange_rate_usd numeric(18,6),
  add column if not exists exchange_rate_source text,
  add column if not exists exchange_rate_updated_at timestamptz;

comment on column public.qb_payments.exchange_rate_usd is
  'Local currency units per USD fixed when the Pesapal order is created.';
