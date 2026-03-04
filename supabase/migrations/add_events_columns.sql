-- Add missing columns to events table (run in Supabase Dashboard → SQL Editor)
-- Use this if you get: Could not find the 'end_date' column of 'events' in the schema cache

alter table public.events add column if not exists end_date timestamptz;
alter table public.events add column if not exists max_attendees integer;
alter table public.events add column if not exists banner_url text;
