import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
).trim();
const supabaseServiceKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

/** Returns a short message describing what is missing (for error responses). */
export function getSupabaseConfigError(): string | null {
  if (isSupabaseConfigured) return null;
  if (!supabaseUrl) return 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is missing or empty';
  if (!supabaseServiceKey) return 'SUPABASE_SERVICE_ROLE_KEY is missing or empty in .env.local';
  return null;
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    client = createClient(supabaseUrl, supabaseServiceKey);
  }
  return client;
}

export const STORAGE_BUCKET_EVENT_BANNERS = 'event-banners';
