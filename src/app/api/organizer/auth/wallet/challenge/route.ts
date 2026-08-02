import { NextResponse } from 'next/server';
import {
    ORGANIZER_WALLET_CHALLENGE_COOKIE,
    createWalletChallenge,
    normalizeOrganizerWallet,
    organizerAuthConfigured,
    shortLivedCookieOptions,
} from '@/lib/organizer-auth';
import { organizerDbAvailable } from '@/lib/organizer-session-db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    if (!organizerAuthConfigured()) {
        return NextResponse.json({ error: 'Organizer auth is not configured.' }, { status: 503 });
    }

    if (!organizerDbAvailable()) {
        return NextResponse.json(
            {
                error: 'Host sign-in requires the database. Configure Supabase, then run supabase/patches/11_organizer_sessions.sql.',
            },
            { status: 503 }
        );
    }

    let body: { address?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const address = normalizeOrganizerWallet(typeof body.address === 'string' ? body.address : '');
    if (!address) {
        return NextResponse.json({ error: 'Connect a valid wallet address first.' }, { status: 400 });
    }

    try {
        const { message, cookieValue } = await createWalletChallenge(address);
        const res = NextResponse.json({ ok: true, message, address, stored: 'database' });
        res.cookies.set(ORGANIZER_WALLET_CHALLENGE_COOKIE, cookieValue, shortLivedCookieOptions(600));
        return res;
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not create wallet challenge.';
        return NextResponse.json(
            {
                error: msg.includes('organizer_wallet_challenges')
                    ? 'Host auth tables missing. Run supabase/patches/11_organizer_sessions.sql in Supabase SQL Editor.'
                    : msg,
            },
            { status: 503 }
        );
    }
}
