-- Email-based check-ins (non-wallet attendance) for non-blockchain events
-- Run in Supabase → SQL Editor if attendance should store email without wallet.

alter table public.attendance add column if not exists email text;

-- Allow NULL wallet when email is set
alter table public.attendance alter column wallet drop not null;

alter table public.attendance drop constraint if exists attendance_wallet_or_email_check;
alter table public.attendance add constraint attendance_wallet_or_email_check
  check (wallet is not null or email is not null);

create unique index if not exists unique_attendance_event_email
  on public.attendance (event_id, lower(email)) where email is not null;

notify pgrst, 'reload schema';
