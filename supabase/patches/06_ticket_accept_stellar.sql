-- Stellar USDC payment rail for paid tickets (alongside Base USDC + mobile money).

alter table public.events add column if not exists ticket_accept_stellar boolean default false;

comment on column public.events.ticket_accept_stellar is
  'When ticket_price_usdc > 0: allow USDC payment on Stellar (Horizon-verified) at registration.';

notify pgrst, 'reload schema';
