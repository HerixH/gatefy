-- Add missing columns to public.events (run in Supabase → SQL Editor)
-- Fixes: "Could not find the '…' column of 'events' in the schema cache"

alter table public.events add column if not exists end_date timestamptz;
alter table public.events add column if not exists max_attendees integer;
alter table public.events add column if not exists banner_url text;
alter table public.events add column if not exists is_blockchain boolean default true;
alter table public.events add column if not exists organizer_display_name text;

-- Tell PostgREST to pick up new columns (fixes schema cache / PGRST204)
notify pgrst, 'reload schema';
