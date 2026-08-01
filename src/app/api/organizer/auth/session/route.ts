import { NextResponse } from 'next/server';
import {
    ORGANIZER_SESSION_COOKIE,
    getOrganizerSessionFromCookies,
    organizerAuthConfigured,
    organizerSessionCookieOptions,
} from '@/lib/organizer-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getOrganizerSessionFromCookies();
    return NextResponse.json({
        configured: organizerAuthConfigured(),
        authenticated: !!session,
        email: session?.email ?? null,
        wallet: session?.wallet ?? null,
    });
}

export async function DELETE() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ORGANIZER_SESSION_COOKIE, '', { ...organizerSessionCookieOptions(0), maxAge: 0 });
    return res;
}
