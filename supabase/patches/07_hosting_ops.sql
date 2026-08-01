-- Hosting ops: soft-cancel events, payment uniqueness, MoMo pending workflow support.
-- Apply in Supabase SQL Editor after 06_ticket_accept_stellar.sql.

alter table public.events add column if not exists cancelled_at timestamptz;

comment on column public.events.cancelled_at is
  'When set, event is cancelled: hidden from public browse, registration blocked. Roster kept for history.';

comment on column public.registrations.payment_status is
  'none | pending_mobile | paid_crypto | paid_stellar | paid_mobile | rejected_mobile';

-- One on-chain tx hash can only pay once (global).
create unique index if not exists unique_registration_payment_tx_hash
  on public.registrations (lower(payment_tx_hash))
  where payment_tx_hash is not null and length(trim(payment_tx_hash)) > 0;

-- One mobile-money reference per event.
create unique index if not exists unique_registration_payment_reference_per_event
  on public.registrations (event_id, lower(payment_reference))
  where payment_reference is not null and length(trim(payment_reference)) > 0;

notify pgrst, 'reload schema';
