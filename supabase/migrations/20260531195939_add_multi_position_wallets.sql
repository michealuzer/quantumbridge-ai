create table if not exists public.qt_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  loaded_available_usd numeric(14,2) not null default 0 check (loaded_available_usd >= 0),
  yield_available_usd numeric(14,2) not null default 0 check (yield_available_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qt_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('opening_balance','deposit','yield_credit','compound_maturity','plan_purchase','withdrawal_reserved','withdrawal_released')),
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qt_wallet_transactions_user_created_idx
  on public.qt_wallet_transactions(user_id, created_at desc);

alter table public.qt_investments
  add column if not exists mode text not null default 'standard'
    check (mode in ('standard','compound')),
  add column if not exists credited_days integer not null default 0
    check (credited_days >= 0),
  add column if not exists matures_at timestamptz,
  add column if not exists matured_at timestamptz,
  add column if not exists funded_from_yield_usd numeric(14,2) not null default 0
    check (funded_from_yield_usd >= 0),
  add column if not exists funded_from_loaded_usd numeric(14,2) not null default 0
    check (funded_from_loaded_usd >= 0);

update public.qt_investments
set matures_at = created_at + make_interval(days => duration_days)
where matures_at is null;

insert into public.qt_wallets(user_id)
select id from auth.users
on conflict (user_id) do nothing;

with legacy_yield as (
  select
    user_id,
    sum(
      coalesce(carried_yield_usd, 0) +
      (coalesce(daily_credit_usd, 0) * least(
        duration_days,
        greatest(0, floor(extract(epoch from (now() - created_at)) / 86400)::integer)
      ))
    ) as earned_usd
  from public.qt_investments
  where status = 'active'
  group by user_id
),
reserved_withdrawals as (
  select user_id, sum(amount_usd) as reserved_usd
  from public.qt_withdrawals
  where status in ('pending', 'completed')
  group by user_id
)
update public.qt_wallets wallet
set
  yield_available_usd = greatest(0, coalesce(legacy.earned_usd, 0) - coalesce(reserved.reserved_usd, 0)),
  updated_at = now()
from legacy_yield legacy
left join reserved_withdrawals reserved on reserved.user_id = legacy.user_id
where wallet.user_id = legacy.user_id;

update public.qt_investments
set
  credited_days = least(
    duration_days,
    greatest(0, floor(extract(epoch from (now() - created_at)) / 86400)::integer)
  ),
  day_number = least(
    duration_days,
    greatest(1, floor(extract(epoch from (now() - created_at)) / 86400)::integer + 1)
  ),
  status = case
    when now() >= created_at + make_interval(days => duration_days) then 'completed'
    else status
  end,
  matured_at = case
    when now() >= created_at + make_interval(days => duration_days) then created_at + make_interval(days => duration_days)
    else matured_at
  end,
  carried_yield_usd = 0,
  updated_at = now()
where status = 'active';

insert into public.qt_wallet_transactions(user_id, type, amount_usd, metadata)
select user_id, 'opening_balance', yield_available_usd, '{"source":"legacy_yield_migration"}'::jsonb
from public.qt_wallets
where yield_available_usd > 0;

alter table public.qt_wallets enable row level security;
alter table public.qt_wallet_transactions enable row level security;

create policy "Wallets are owned"
  on public.qt_wallets for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Wallet transactions are owned"
  on public.qt_wallet_transactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Investments insert own" on public.qt_investments;
drop policy if exists "Investments update own" on public.qt_investments;

grant select on public.qt_wallets to authenticated;
grant select on public.qt_wallet_transactions to authenticated;
revoke all on public.qt_wallets from anon;
revoke all on public.qt_wallet_transactions from anon;
revoke insert, update, delete, truncate, references, trigger on public.qt_wallets from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.qt_wallet_transactions from authenticated;
revoke all on public.qt_investments from anon;
revoke insert, update, delete, truncate, references, trigger on public.qt_investments from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.qt_withdrawals from anon, authenticated;

create or replace function public.qt_settle_wallet(p_user_id uuid)
returns public.qt_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet public.qt_wallets;
  position public.qt_investments;
  completed_days integer;
  new_days integer;
  credit numeric(14,2);
begin
  insert into public.qt_wallets(user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select * into wallet
  from public.qt_wallets
  where user_id = p_user_id
  for update;

  for position in
    select *
    from public.qt_investments
    where user_id = p_user_id and status = 'active'
    order by created_at
    for update
  loop
    completed_days := least(
      position.duration_days,
      greatest(0, floor(extract(epoch from (now() - position.created_at)) / 86400)::integer)
    );

    if position.mode = 'standard' then
      new_days := greatest(0, completed_days - position.credited_days);
      credit := round(position.daily_credit_usd * new_days, 2);
      if credit > 0 then
        update public.qt_wallets
        set yield_available_usd = yield_available_usd + credit, updated_at = now()
        where user_id = p_user_id;
        insert into public.qt_wallet_transactions(user_id, type, amount_usd, reference_id, metadata)
        values (p_user_id, 'yield_credit', credit, position.id, jsonb_build_object('credited_days', new_days));
      end if;
    elsif completed_days >= position.duration_days and position.credited_days < position.duration_days then
      credit := round((
        position.principal_usd * power(1 + (position.daily_credit_usd / nullif(position.principal_usd, 0)), position.duration_days)
      ) - position.principal_usd, 2);
      if credit > 0 then
        update public.qt_wallets
        set yield_available_usd = yield_available_usd + credit, updated_at = now()
        where user_id = p_user_id;
        insert into public.qt_wallet_transactions(user_id, type, amount_usd, reference_id)
        values (p_user_id, 'compound_maturity', credit, position.id);
      end if;
    end if;

    update public.qt_investments
    set
      credited_days = completed_days,
      day_number = least(duration_days, greatest(1, completed_days + 1)),
      status = case when completed_days >= duration_days then 'completed' else status end,
      matured_at = case when completed_days >= duration_days then coalesce(matured_at, matures_at, now()) else matured_at end,
      updated_at = now()
    where id = position.id;
  end loop;

  select * into wallet from public.qt_wallets where user_id = p_user_id;
  return wallet;
end;
$$;

create or replace function public.qt_credit_loaded_wallet(p_user_id uuid, p_amount_usd numeric, p_reference_id uuid)
returns public.qt_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet public.qt_wallets;
begin
  if p_amount_usd <= 0 then raise exception 'Deposit amount must be greater than zero.'; end if;
  insert into public.qt_wallets(user_id, loaded_available_usd)
  values (p_user_id, p_amount_usd)
  on conflict (user_id) do update
  set loaded_available_usd = public.qt_wallets.loaded_available_usd + excluded.loaded_available_usd, updated_at = now();
  insert into public.qt_wallet_transactions(user_id, type, amount_usd, reference_id)
  values (p_user_id, 'deposit', p_amount_usd, p_reference_id);
  select * into wallet from public.qt_wallets where user_id = p_user_id;
  return wallet;
end;
$$;

create or replace function public.qt_purchase_plan(p_user_id uuid, p_plan_slug text, p_amount_usd numeric, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet public.qt_wallets;
  plan public.qt_plans;
  yield_spend numeric(14,2);
  loaded_spend numeric(14,2);
  daily_credit numeric(14,2);
  projected_return numeric(14,2);
  position public.qt_investments;
begin
  if p_mode not in ('standard', 'compound') then raise exception 'Choose Standard or Compounding.'; end if;
  perform public.qt_settle_wallet(p_user_id);
  select * into wallet from public.qt_wallets where user_id = p_user_id for update;
  select * into plan from public.qt_plans where slug = p_plan_slug;
  if plan.id is null then raise exception 'Package not found.'; end if;
  if p_amount_usd < plan.min_deposit_usd then raise exception 'Minimum for % is $%.', plan.name, plan.min_deposit_usd; end if;
  if plan.max_deposit_usd is not null and p_amount_usd > plan.max_deposit_usd then raise exception 'Maximum for % is $%.', plan.name, plan.max_deposit_usd; end if;
  if p_amount_usd > wallet.loaded_available_usd + wallet.yield_available_usd then raise exception 'Available balance is not enough for this purchase.'; end if;

  yield_spend := least(wallet.yield_available_usd, p_amount_usd);
  loaded_spend := p_amount_usd - yield_spend;
  daily_credit := round(p_amount_usd * (plan.daily_return_percent / 100), 2);
  projected_return := case
    when p_mode = 'compound' then round((p_amount_usd * power(1 + (plan.daily_return_percent / 100), plan.duration_days)) - p_amount_usd, 2)
    else round(daily_credit * plan.duration_days, 2)
  end;

  update public.qt_wallets
  set
    yield_available_usd = yield_available_usd - yield_spend,
    loaded_available_usd = loaded_available_usd - loaded_spend,
    updated_at = now()
  where user_id = p_user_id;

  insert into public.qt_investments(
    user_id, plan_id, principal_usd, daily_credit_usd, projected_return_usd, duration_days,
    mode, credited_days, day_number, matures_at, funded_from_yield_usd, funded_from_loaded_usd, status
  )
  values (
    p_user_id, plan.id, p_amount_usd, daily_credit, projected_return, plan.duration_days,
    p_mode, 0, 1, now() + make_interval(days => plan.duration_days), yield_spend, loaded_spend, 'active'
  )
  returning * into position;

  insert into public.qt_wallet_transactions(user_id, type, amount_usd, reference_id, metadata)
  values (p_user_id, 'plan_purchase', p_amount_usd, position.id, jsonb_build_object('yield_spend', yield_spend, 'loaded_spend', loaded_spend, 'mode', p_mode));

  select * into wallet from public.qt_wallets where user_id = p_user_id;
  return jsonb_build_object('investment', to_jsonb(position), 'wallet', to_jsonb(wallet));
end;
$$;

create or replace function public.qt_create_withdrawal(
  p_user_id uuid,
  p_amount_usd numeric,
  p_method text,
  p_details jsonb
)
returns public.qt_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet public.qt_wallets;
  withdrawal public.qt_withdrawals;
begin
  perform public.qt_settle_wallet(p_user_id);
  select * into wallet from public.qt_wallets where user_id = p_user_id for update;
  if p_amount_usd < 5 then raise exception 'Minimum withdrawal amount is $5.00 USD.'; end if;
  if p_amount_usd > wallet.yield_available_usd then raise exception 'Withdrawal request exceeds your withdrawable yield balance.'; end if;

  update public.qt_wallets
  set yield_available_usd = yield_available_usd - p_amount_usd, updated_at = now()
  where user_id = p_user_id;

  insert into public.qt_withdrawals(user_id, amount_usd, method, details, status)
  values (p_user_id, p_amount_usd, p_method, coalesce(p_details, '{}'::jsonb), 'pending')
  returning * into withdrawal;

  insert into public.qt_wallet_transactions(user_id, type, amount_usd, reference_id)
  values (p_user_id, 'withdrawal_reserved', p_amount_usd, withdrawal.id);
  return withdrawal;
end;
$$;

revoke all on function public.qt_settle_wallet(uuid) from public, anon, authenticated;
revoke all on function public.qt_credit_loaded_wallet(uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function public.qt_purchase_plan(uuid, text, numeric, text) from public, anon, authenticated;
revoke all on function public.qt_create_withdrawal(uuid, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.qt_settle_wallet(uuid) to service_role;
grant execute on function public.qt_credit_loaded_wallet(uuid, numeric, uuid) to service_role;
grant execute on function public.qt_purchase_plan(uuid, text, numeric, text) to service_role;
grant execute on function public.qt_create_withdrawal(uuid, numeric, text, jsonb) to service_role;
