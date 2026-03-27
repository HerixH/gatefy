-- Display name / company for organizers (especially email-based).
-- Run this in Supabase → SQL Editor if you see:
--   Could not find the 'organizer_display_name' column of 'events' in the schema cache

alter table public.events add column if not exists organizer_display_name text;

notify pgrst, 'reload schema';

-- If the error persists: Supabase → Project Settings → API → "Reload" schema,
-- or wait ~1 minute and retry the app.

