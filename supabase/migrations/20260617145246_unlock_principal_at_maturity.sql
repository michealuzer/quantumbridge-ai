alter table public.qt_wallet_transactions
  drop constraint if exists qt_wallet_transactions_type_check;

alter table public.qt_wallet_transactions
  add constraint qt_wallet_transactions_type_check
  check (type in (
    'opening_balance',
    'deposit',
    'yield_credit',
    'compound_maturity',
    'principal_return',
    'plan_purchase',
    'withdrawal_reserved',
    'withdrawal_released'
  ));

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
  principal_returned boolean;
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
    where user_id = p_user_id and status in ('active', 'completed')
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

    if completed_days >= position.duration_days then
      select exists (
        select 1
        from public.qt_wallet_transactions
        where user_id = p_user_id
          and type = 'principal_return'
          and reference_id = position.id
      )
      into principal_returned;

      if not principal_returned and position.principal_usd > 0 then
        update public.qt_wallets
        set loaded_available_usd = loaded_available_usd + position.principal_usd, updated_at = now()
        where user_id = p_user_id;

        insert into public.qt_wallet_transactions(user_id, type, amount_usd, reference_id, metadata)
        values (
          p_user_id,
          'principal_return',
          position.principal_usd,
          position.id,
          jsonb_build_object(
            'mode', position.mode,
            'funded_from_yield_usd', position.funded_from_yield_usd,
            'funded_from_loaded_usd', position.funded_from_loaded_usd
          )
        );
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
