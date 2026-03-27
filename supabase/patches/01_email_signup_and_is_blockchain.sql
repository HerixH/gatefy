-- Run once in Supabase → SQL Editor if email sign-up or "Email mode" events fail.
-- Fixes: ERROR 42P16 column "wallet" is in a primary key (old schema used (event_id, wallet) as PK).

-- =============================================================================
-- 1) Events: non-blockchain / email-mode flag
-- =============================================================================
alter table public.events add column if not exists is_blockchain boolean default true;

-- =============================================================================
-- 2) Registrations: email + name columns
-- =============================================================================
alter table public.registrations add column if not exists email text;
alter table public.registrations add column if not exists name text;

-- =============================================================================
-- 3) Migrate PK: composite (event_id, wallet) → surrogate `id` (wallet can be nullable)
-- =============================================================================

-- 3a) Add id column if missing (surrogate key)
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

-- 3b) Drop PRIMARY KEY only when wallet is part of it (idempotent: skip if already id-only PK)
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

-- 3c) Backfill null ids (only if id column exists but some rows are null)
do $$
declare
  seq text;
begin
  seq := pg_get_serial_sequence('public.registrations', 'id');
  if seq is not null and exists (select 1 from public.registrations where id is null) then
    execute format(
      'update public.registrations set id = nextval(%L::regclass) where id is null',
      seq
    );
  end if;
end $$;

-- 3d) Primary key on id (skip if already present)
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

-- 3e) Now wallet can be nullable (email-only rows)
alter table public.registrations alter column wallet drop not null;

-- =============================================================================
-- 4) Uniqueness: one wallet or email per event
-- =============================================================================
create unique index if not exists unique_registration_wallet
  on public.registrations (event_id, wallet) where wallet is not null;
create unique index if not exists unique_registration_email
  on public.registrations (event_id, lower(email)) where email is not null;

-- =============================================================================
-- 5) At least one of wallet or email
-- =============================================================================
alter table public.registrations drop constraint if exists registrations_identifier_check;
alter table public.registrations add constraint registrations_identifier_check
  check (wallet is not null or email is not null);

-- =============================================================================
-- 6) PostgREST schema reload (fixes PGRST204 / schema cache after DDL)
-- =============================================================================
notify pgrst, 'reload schema';
