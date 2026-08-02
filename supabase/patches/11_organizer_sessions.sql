-- Host auth: OTP codes + durable sessions in the database (not browser cache alone).
-- Cookie still carries an opaque session token; identity lives in these tables.

create table if not exists public.organizer_otps (
  email text primary key,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.organizer_wallet_challenges (
  address text primary key,
  nonce text not null,
  message text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.organizer_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text,
  wallet text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint organizer_sessions_identity_chk check (email is not null or wallet is not null)
);

create index if not exists organizer_sessions_email_idx on public.organizer_sessions (email)
  where email is not null;
create index if not exists organizer_sessions_wallet_idx on public.organizer_sessions (wallet)
  where wallet is not null;
create index if not exists organizer_sessions_expires_idx on public.organizer_sessions (expires_at);

alter table public.organizer_otps enable row level security;
alter table public.organizer_wallet_challenges enable row level security;
alter table public.organizer_sessions enable row level security;

drop policy if exists "Service role manages organizer_otps" on public.organizer_otps;
create policy "Service role manages organizer_otps"
  on public.organizer_otps for all using (true) with check (true);

drop policy if exists "Service role manages organizer_wallet_challenges" on public.organizer_wallet_challenges;
create policy "Service role manages organizer_wallet_challenges"
  on public.organizer_wallet_challenges for all using (true) with check (true);

drop policy if exists "Service role manages organizer_sessions" on public.organizer_sessions;
create policy "Service role manages organizer_sessions"
  on public.organizer_sessions for all using (true) with check (true);

comment on table public.organizer_otps is 'Email OTP for host sign-in; verified before creating organizer_sessions.';
comment on table public.organizer_sessions is 'Durable host sessions; cookie holds opaque token hashed to token_hash.';
comment on table public.organizer_wallet_challenges is 'One-time wallet sign-in challenges for host verification.';

notify pgrst, 'reload schema';
