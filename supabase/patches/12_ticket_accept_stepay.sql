-- Pay with Stepay (https://stepay.pro) — opt-in ticket rail.

alter table public.events
  add column if not exists ticket_accept_stepay boolean default false;

comment on column public.events.ticket_accept_stepay is
  'When true, attendees can pay the ticket via Stepay checkout (mobile money → USDC).';

notify pgrst, 'reload schema';
