alter table public.qt_profiles
    add column if not exists referrer_user_id uuid references public.qt_profiles(user_id),
    add column if not exists referral_source_code text;

create index if not exists qt_profiles_referrer_user_id_idx
    on public.qt_profiles(referrer_user_id);

create table if not exists public.qt_referral_commissions (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null references public.qb_payments(id) on delete cascade,
    source_user_id uuid not null,
    beneficiary_user_id uuid not null,
    level integer not null check (level between 1 and 3),
    rate_percent numeric(6,2) not null,
    amount_usd numeric(14,2) not null check (amount_usd >= 0),
    status text not null default 'earned',
    created_at timestamptz not null default now(),
    unique (payment_id, beneficiary_user_id, level)
);

create index if not exists qt_referral_commissions_beneficiary_idx
    on public.qt_referral_commissions(beneficiary_user_id, created_at desc);

create index if not exists qt_referral_commissions_source_idx
    on public.qt_referral_commissions(source_user_id, created_at desc);

alter table public.qt_referral_commissions enable row level security;

drop policy if exists "Referral commissions are owned" on public.qt_referral_commissions;
create policy "Referral commissions are owned"
    on public.qt_referral_commissions
    for select
    to authenticated
    using ((select auth.uid()) = beneficiary_user_id);

drop policy if exists "Profiles referral network visible" on public.qt_profiles;
create policy "Profiles referral network visible"
    on public.qt_profiles
    for select
    to authenticated
    using ((select auth.uid()) = referrer_user_id);

create or replace function public.qt_bootstrap_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    current_user_id uuid := auth.uid();
    current_email text := auth.email();
    current_referral_code text := upper(nullif(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'referral_code', '')), ''));
    matching_referrer uuid;
    matching_code text;
begin
    if current_user_id is null then
        raise exception 'Not authenticated';
    end if;

    insert into public.qt_profiles (user_id, email, display_name)
    values (current_user_id, current_email, split_part(coalesce(current_email, 'Investor'), '@', 1))
    on conflict (user_id) do update set
        email = excluded.email,
        updated_at = now();

    if current_referral_code is not null then
        select user_id, investor_code
        into matching_referrer, matching_code
        from public.qt_profiles
        where upper(investor_code) = current_referral_code
          and user_id <> current_user_id
        limit 1;

        if matching_referrer is not null then
            update public.qt_profiles
            set referrer_user_id = coalesce(referrer_user_id, matching_referrer),
                referral_source_code = coalesce(referral_source_code, matching_code),
                updated_at = now()
            where user_id = current_user_id
              and referrer_user_id is null;
        end if;
    end if;
end;
$$;

revoke all on function public.qt_bootstrap_current_user() from public;
grant execute on function public.qt_bootstrap_current_user() to authenticated;
