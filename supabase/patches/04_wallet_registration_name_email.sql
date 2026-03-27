-- Wallet-based registrations store the same optional columns as email signups:
-- `email` (contact / confirmations) and `name` (first name or organization).
-- These columns already exist on public.registrations; this patch is idempotent.

alter table public.registrations add column if not exists email text;
alter table public.registrations add column if not exists name text;

comment on column public.registrations.email is 'Attendee email; may be set for wallet or email-only registrations.';
comment on column public.registrations.name is 'First name or organization name for the attendee.';
