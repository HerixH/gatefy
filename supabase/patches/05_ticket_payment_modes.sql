-- Paid tickets + payment rails on events.
-- Safe to re-run (IF NOT EXISTS). New projects: supabase/schema.sql already includes these.
-- Existing DB: run this file alone in Supabase Dashboard → SQL Editor if the app shows
-- "Paid ticket / payment-mode fields require DB columns".

alter table public.events add column if not exists ticket_price_usdc numeric;
alter table public.events add column if not exists mobile_money_instructions text;
alter table public.events add column if not exists ticket_accept_usdc boolean default true;
alter table public.events add column if not exists ticket_accept_mobile_money boolean default true;

comment on column public.events.ticket_price_usdc is 'Optional USDC price per ticket on Base mainnet; null/0 = free.';
comment on column public.events.mobile_money_instructions is 'Organizer text: MTN/Airtel numbers, account name, amount in local currency, etc.';
comment on column public.events.ticket_accept_usdc is 'When ticket_price_usdc > 0 and is_blockchain: allow USDC transfer at registration.';
comment on column public.events.ticket_accept_mobile_money is 'When ticket_price_usdc > 0: allow paying with mobile-money reference (email signup; optional future wallet path).';

notify pgrst, 'reload schema';
