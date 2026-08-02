-- Optional Base mint receipt alongside Soroban (ATTENDANCE_MINT_CHAIN=both)
-- Run in Supabase → SQL Editor after 09_attendance_mint.sql

alter table public.attendance add column if not exists mint_base_tx_hash text;
alter table public.attendance add column if not exists mint_base_token_id text;

notify pgrst, 'reload schema';
