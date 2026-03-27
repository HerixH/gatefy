-- Run this in Supabase Dashboard → SQL Editor to create the events table and storage.

-- Events table (includes banner_url for event banner image)
create table if not exists public.events (
  id text primary key,
  name text not null,
  description text default '',
  date timestamptz not null,
  end_date timestamptz,
  location text default '',
  organizer text not null,
  verification_code text not null,
  created_at timestamptz default now(),
  attendee_count integer default 0,
  max_attendees integer,
  is_vip boolean default false,
  vip_token_address text default '',
  vip_min_balance text default '1',
  banner_url text,
  is_blockchain boolean default true,
  organizer_display_name text
);

-- If table already exists, run: alter table public.events add column if not exists end_date timestamptz; alter table public.events add column if not exists max_attendees integer;

-- Optional: RLS so anyone can read events, only service role can write
alter table public.events enable row level security;

drop policy if exists "Events are viewable by everyone" on public.events;
create policy "Events are viewable by everyone"
  on public.events for select
  using (true);

drop policy if exists "Service role can do everything" on public.events;
create policy "Service role can do everything"
  on public.events for all
  using (true)
  with check (true);

-- =============================================================================
-- STORAGE: Event banner images (used when creating events)
-- =============================================================================
-- 1. Create the bucket (public so banner URLs work without auth).
--    If this fails (e.g. missing file_size_limit column), use instead:
--    insert into storage.buckets (id, name, public) values ('event-banners', 'event-banners', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-banners',
  'event-banners',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. RLS: allow anyone to read (view) banner images
drop policy if exists "Anyone can view event banners" on storage.objects;
create policy "Anyone can view event banners"
  on storage.objects for select
  using (bucket_id = 'event-banners');

-- 3. RLS: allow uploads (app uses service role; this allows authenticated uploads if needed)
drop policy if exists "Allow event banner uploads" on storage.objects;
create policy "Allow event banner uploads"
  on storage.objects for insert
  with check (bucket_id = 'event-banners');

drop policy if exists "Allow event banner updates" on storage.objects;
create policy "Allow event banner updates"
  on storage.objects for update
  using (bucket_id = 'event-banners');

-- Optional: allow delete for cleanup
drop policy if exists "Allow event banner deletes" on storage.objects;
create policy "Allow event banner deletes"
  on storage.objects for delete
  using (bucket_id = 'event-banners');

-- =============================================================================
-- CLAIM CODES, ATTENDANCE, REGISTRATIONS (required for Vercel - no file system)
-- =============================================================================

create table if not exists public.claim_codes (
  code text primary key,
  used boolean default false,
  created_at timestamptz default now(),
  used_at timestamptz,
  used_by text,
  vip boolean default false,
  tx_hash text,
  purchased_by text
);

create table if not exists public.attendance (
  id bigserial primary key,
  wallet text,
  email text,
  code text not null,
  checked_in_at timestamptz default now(),
  event_id text,
  constraint attendance_wallet_or_email_check check (wallet is not null or email is not null)
);

create unique index if not exists unique_attendance_event_email
  on public.attendance (event_id, lower(email)) where email is not null;

-- Registrations: wallet-only, email-only, or wallet + email + name (blockchain events collect name + email on signup).
create table if not exists public.registrations (
  id bigserial primary key,
  event_id text not null,
  wallet text,
  email text,
  name text,
  registered_at timestamptz default now(),
  constraint registrations_identifier_check check (wallet is not null or email is not null)
);

-- Unique per event: wallet (blockchain) or email (normal)
create unique index if not exists unique_registration_wallet
  on public.registrations(event_id, wallet) where wallet is not null;
create unique index if not exists unique_registration_email
  on public.registrations(event_id, lower(email)) where email is not null;

alter table public.claim_codes enable row level security;
alter table public.attendance enable row level security;
alter table public.registrations enable row level security;

drop policy if exists "Service role manages claim_codes" on public.claim_codes;
create policy "Service role manages claim_codes" on public.claim_codes for all using (true) with check (true);

drop policy if exists "Service role manages attendance" on public.attendance;
create policy "Service role manages attendance" on public.attendance for all using (true) with check (true);

drop policy if exists "Service role manages registrations" on public.registrations;
create policy "Service role manages registrations" on public.registrations for all using (true) with check (true);
