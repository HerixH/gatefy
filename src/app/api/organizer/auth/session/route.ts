import { NextResponse } from 'next/server';
import {
    ORGANIZER_SESSION_COOKIE,
    getOrganizerSessionFromCookies,
    organizerAuthConfigured,
    organizerSessionCookieOptions,
    revokeOrganizerSessionCookie,
} from '@/lib/organizer-auth';
import { organizerDbAvailable } from '@/lib/organizer-session-db';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getOrganizerSessionFromCookies();
    return NextResponse.json({
        configured: organizerAuthConfigured(),
        database: organizerDbAvailable(),
        authenticated: !!session,
        email: session?.email ?? null,
        wallet: session?.wallet ?? null,
    });
}

export async function DELETE() {
    await revokeOrganizerSessionCookie();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ORGANIZER_SESSION_COOKIE, '', { ...organizerSessionCookieOptions(0), maxAge: 0 });
    return res;
}
