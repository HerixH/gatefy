import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured, getSupabaseConfigError } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Live check: env + TCP/API to Supabase + core tables readable.
 * Open in browser or curl: GET /api/db-health
 */
export async function GET() {
    if (!isSupabaseConfigured) {
        return NextResponse.json(
            {
                ok: false,
                steps: [{ name: 'environment', ok: false, detail: getSupabaseConfigError() ?? 'Missing URL or key' }],
            },
            { status: 503, headers: { 'Cache-Control': 'no-store' } }
        );
    }

    const steps: { name: string; ok: boolean; detail?: string }[] = [];
    let supabase: ReturnType<typeof getSupabase>;

    try {
        supabase = getSupabase();
        steps.push({ name: 'client', ok: true, detail: 'Supabase client created' });
    } catch (e) {
        steps.push({ name: 'client', ok: false, detail: e instanceof Error ? e.message : String(e) });
        return NextResponse.json({ ok: false, steps }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }

    const tables = ['events', 'registrations', 'claim_codes', 'attendance'] as const;

    for (const table of tables) {
        const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' });
        if (error) {
            steps.push({
                name: `read:${table}`,
                ok: false,
                detail: error.message,
            });
            return NextResponse.json(
                {
                    ok: false,
                    steps,
                    hint: 'Run supabase/schema.sql (and migrations) in the Supabase SQL editor if tables are missing.',
                },
                { status: 503, headers: { 'Cache-Control': 'no-store' } }
            );
        }
        steps.push({ name: `read:${table}`, ok: true });
    }

    return NextResponse.json(
        {
            ok: true,
            steps,
            message: 'Database is reachable and core tables respond to read queries.',
        },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}
