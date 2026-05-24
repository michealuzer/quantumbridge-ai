alter table public.qt_withdrawals
    add column if not exists completed_at timestamptz,
    add column if not exists completed_by uuid,
    add column if not exists investor_notified_at timestamptz,
    add column if not exists admin_email_sent_at timestamptz,
    add column if not exists admin_note text;

create index if not exists qt_withdrawals_status_created_idx
    on public.qt_withdrawals(status, created_at desc);
