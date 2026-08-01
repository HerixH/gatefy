-- Admin misconduct cancel: flag + optional reason (hosts cannot restore).
-- Apply in Supabase SQL Editor after 07_hosting_ops.sql.

alter table public.events add column if not exists cancelled_by_admin boolean default false;
alter table public.events add column if not exists cancel_reason text;

comment on column public.events.cancelled_by_admin is
  'True when cancelled by platform admin (misconduct). Organizers cannot restore.';

comment on column public.events.cancel_reason is
  'Optional reason for admin cancel (e.g. misconduct note). Cleared on restore.';

notify pgrst, 'reload schema';
