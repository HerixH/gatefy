import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
    ORGANIZER_SESSION_COOKIE,
    ORGANIZER_WALLET_CHALLENGE_COOKIE,
    createOrganizerSessionToken,
    getOrganizerSessionFromCookies,
    normalizeOrganizerWallet,
    organizerAuthConfigured,
    organizerSessionCookieOptions,
    shortLivedCookieOptions,
    verifyWalletChallenge,
} from '@/lib/organizer-auth';
import { organizerDbAvailable } from '@/lib/organizer-session-db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    if (!organizerAuthConfigured()) {
        return NextResponse.json({ error: 'Organizer auth is not configured.' }, { status: 503 });
    }

    let body: { address?: string; signature?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const address = normalizeOrganizerWallet(typeof body.address === 'string' ? body.address : '');
    const signature = typeof body.signature === 'string' ? body.signature.trim() : '';
    if (!address) return NextResponse.json({ error: 'Wallet address is required.' }, { status: 400 });
    if (!signature) return NextResponse.json({ error: 'Signature is required.' }, { status: 400 });

    const store = await cookies();
    const challenge = store.get(ORGANIZER_WALLET_CHALLENGE_COOKIE)?.value;
    const check = await verifyWalletChallenge(challenge, address, signature);
    if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 401 });
    }

    const existing = await getOrganizerSessionFromCookies();
    let token: string;
    try {
        token = await createOrganizerSessionToken({
            wallet: address,
            email: existing?.email,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not create host session.';
        return NextResponse.json(
            {
                error: msg.includes('organizer_sessions')
                    ? 'Host auth tables missing. Run supabase/patches/11_organizer_sessions.sql in Supabase SQL Editor.'
                    : msg,
            },
            { status: 503 }
        );
    }

    const res = NextResponse.json({
        ok: true,
        wallet: address,
        email: existing?.email ?? null,
        stored: organizerDbAvailable() ? 'database' : 'cookie',
    });
    res.cookies.set(ORGANIZER_SESSION_COOKIE, token, organizerSessionCookieOptions());
    res.cookies.set(ORGANIZER_WALLET_CHALLENGE_COOKIE, '', { ...shortLivedCookieOptions(0), maxAge: 0 });
    return res;
}
