-- Optional: which rails accept payment for PAID tickets (price > 0).
-- Wallet events: USDC on Base. Email-only paid events: mobile-money reference.

alter table public.events add column if not exists ticket_accept_usdc boolean default true;
alter table public.events add column if not exists ticket_accept_mobile_money boolean default true;

comment on column public.events.ticket_accept_usdc is 'When ticket_price_usdc > 0 and is_blockchain: allow USDC transfer at registration.';
comment on column public.events.ticket_accept_mobile_money is 'When ticket_price_usdc > 0: allow paying with mobile-money reference (email signup; optional future wallet path).';

notify pgrst, 'reload schema';
