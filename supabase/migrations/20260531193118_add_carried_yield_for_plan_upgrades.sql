alter table public.qt_investments
  add column if not exists carried_yield_usd numeric(14,2) not null default 0
  check (carried_yield_usd >= 0);

comment on column public.qt_investments.carried_yield_usd is
  'Earned yield preserved when a top-up or package change starts a fresh 24-hour credit cycle.';
