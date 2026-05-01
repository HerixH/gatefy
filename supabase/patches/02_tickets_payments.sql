-- Paid tickets: USDC (wallet) + mobile-money reference (organizer instructions on event).
-- Prerequisite: public.events and public.registrations must exist. New project: run
-- supabase/schema.sql first (it now includes these columns). Existing DB only missing
-- columns: run this file.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'events'
  ) then
    raise exception 'public.events does not exist. Run supabase/schema.sql in the SQL Editor first, then re-run this patch if needed.';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'registrations'
  ) then
    raise exception 'public.registrations does not exist. Run supabase/schema.sql first.';
  end if;
end $$;

alter table public.events add column if not exists ticket_price_usdc numeric;
alter table public.events add column if not exists mobile_money_instructions text;

comment on column public.events.ticket_price_usdc is 'Optional USDC price per ticket on Base mainnet; null/0 = free.';
comment on column public.events.mobile_money_instructions is 'Organizer text: MTN/Airtel numbers, account name, amount in local currency, etc.';

alter table public.registrations add column if not exists payment_status text default 'none';
alter table public.registrations add column if not exists payment_tx_hash text;
alter table public.registrations add column if not exists payment_reference text;
alter table public.registrations add column if not exists paid_at timestamptz;

comment on column public.registrations.payment_status is 'none | paid_crypto | paid_mobile';
comment on column public.registrations.payment_tx_hash is 'Base USDC transfer tx hash when paid_crypto';
comment on column public.registrations.payment_reference is 'Mobile-money transaction id / reference when paid_mobile';
