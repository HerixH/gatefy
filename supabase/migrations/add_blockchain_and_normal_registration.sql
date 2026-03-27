-- Migration: Add is_blockchain to events, support email/name signup for non-blockchain events
-- Run in Supabase Dashboard → SQL Editor if you have an existing database
--
-- IMPORTANT: You cannot ALTER wallet DROP NOT NULL while wallet is part of the primary key.
-- Order: add id → drop old PK → add PK(id) → then wallet nullable.

-- Events: add is_blockchain (default true for backward compatibility)
alter table public.events add column if not exists is_blockchain boolean default true;

-- Registrations: add email and name for normal (non-blockchain) signups
alter table public.registrations add column if not exists email text;
alter table public.registrations add column if not exists name text;

-- Surrogate id (skip if column already exists)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'registrations'
      and column_name = 'id'
  ) then
    alter table public.registrations add column id bigserial not null;
  end if;
end $$;

-- Drop PRIMARY KEY only when wallet is part of it
do $$
declare
  r record;
  pk_includes_wallet boolean;
begin
  select exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'registrations'
      and c.contype = 'p'
      and a.attname = 'wallet'
  ) into pk_includes_wallet;

  if not pk_includes_wallet then
    return;
  end if;

  for r in (
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'registrations'
      and c.contype = 'p'
  ) loop
    execute format('alter table public.registrations drop constraint %I', r.conname);
  end loop;
end $$;

-- Backfill null ids if needed
do $$
declare
  seq text;
begin
  seq := pg_get_serial_sequence('public.registrations', 'id');
  if seq is not null and exists (select 1 from public.registrations where id is null) then
    execute format('update public.registrations set id = nextval(%L::regclass) where id is null', seq);
  end if;
end $$;

alter table public.registrations alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'registrations_pkey'
      and conrelid = 'public.registrations'::regclass
  ) then
    alter table public.registrations add constraint registrations_pkey primary key (id);
  end if;
end $$;

-- Now wallet can be nullable
alter table public.registrations alter column wallet drop not null;

-- Unique constraints: one registration per wallet OR per email per event
create unique index if not exists unique_registration_wallet
  on public.registrations(event_id, wallet) where wallet is not null;
create unique index if not exists unique_registration_email
  on public.registrations(event_id, lower(email)) where email is not null;

-- Ensure at least one identifier
alter table public.registrations drop constraint if exists registrations_identifier_check;
alter table public.registrations add constraint registrations_identifier_check
  check (wallet is not null or email is not null);

notify pgrst, 'reload schema';
