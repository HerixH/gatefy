import { NextResponse } from 'next/server';
import { attendanceMintChain, mintWantsBase, mintWantsSoroban } from '@/lib/attendance-mint';
import { stepayConfigured } from '@/lib/stepay';
import { isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Public client hints: DB + which attendance mint chains are enabled. */
export async function GET() {
    const mintChain = attendanceMintChain();
    return NextResponse.json(
        {
            databaseConfigured: isSupabaseConfigured,
            mintChain,
            mintSoroban: mintWantsSoroban(mintChain),
            mintBase: mintWantsBase(mintChain),
            stepayEnabled: stepayConfigured(),
        },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
}
