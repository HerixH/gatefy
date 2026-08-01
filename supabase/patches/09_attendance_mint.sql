-- Mint receipt on attendance (Soroban first; Base later)
-- Run in Supabase → SQL Editor after verify → mint is wired.

alter table public.attendance add column if not exists mint_chain text;
alter table public.attendance add column if not exists mint_status text;
alter table public.attendance add column if not exists mint_tx_hash text;
alter table public.attendance add column if not exists mint_token_id text;
alter table public.attendance add column if not exists mint_error text;
alter table public.attendance add column if not exists minted_at timestamptz;

notify pgrst, 'reload schema';
