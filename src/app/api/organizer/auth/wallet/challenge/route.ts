import { NextResponse } from 'next/server';
import {
    ORGANIZER_WALLET_CHALLENGE_COOKIE,
    createWalletChallenge,
    normalizeOrganizerWallet,
    organizerAuthConfigured,
    shortLivedCookieOptions,
} from '@/lib/organizer-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    if (!organizerAuthConfigured()) {
        return NextResponse.json({ error: 'Organizer auth is not configured.' }, { status: 503 });
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

    const { message, cookieValue } = createWalletChallenge(address);
    const res = NextResponse.json({ ok: true, message, address });
    res.cookies.set(ORGANIZER_WALLET_CHALLENGE_COOKIE, cookieValue, shortLivedCookieOptions(600));
    return res;
}
