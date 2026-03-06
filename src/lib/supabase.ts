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

/** True if using an elevated key: service_role JWT, or sb_secret_ (new format). Rejects anon JWT and sb_publishable_. */
function isElevatedKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const k = key.trim();
  if (k.startsWith('sb_secret_')) return true; // New secret key format
  if (k.startsWith('sb_publishable_')) return false; // Low privilege
  if (k.startsWith('eyJ')) {
    try {
      const b64 = k.split('.')[1];
      const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      return payload?.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

export const isUsingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && isElevatedKey(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '');

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
