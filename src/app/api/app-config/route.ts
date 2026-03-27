import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Public client hints: whether server-side DB (Supabase) is configured. */
export async function GET() {
    return NextResponse.json(
        { databaseConfigured: isSupabaseConfigured },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
}
