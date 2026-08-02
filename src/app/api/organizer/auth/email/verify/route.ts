import { NextResponse } from 'next/server';
import {
    ORGANIZER_OTP_COOKIE,
    ORGANIZER_SESSION_COOKIE,
    createOrganizerSessionToken,
    getOrganizerSessionFromCookies,
    normalizeOrganizerEmail,
    organizerAuthConfigured,
    organizerSessionCookieOptions,
    shortLivedCookieOptions,
    verifyEmailOtpChallenge,
} from '@/lib/organizer-auth';
import { organizerDbAvailable } from '@/lib/organizer-session-db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    if (!organizerAuthConfigured()) {
        return NextResponse.json({ error: 'Organizer auth is not configured.' }, { status: 503 });
    }

    let body: { email?: string; code?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const email = normalizeOrganizerEmail(typeof body.email === 'string' ? body.email : '');
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!email) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    if (!/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 });
    }

    const { cookies } = await import('next/headers');
    const store = await cookies();
    const cookieValue = store.get(ORGANIZER_OTP_COOKIE)?.value;

    const check = await verifyEmailOtpChallenge(cookieValue, email, code);
    if (!check.ok) {
        const res = NextResponse.json({ error: check.error }, { status: 401 });
        if (check.bumpCookie) {
            res.cookies.set(ORGANIZER_OTP_COOKIE, check.bumpCookie, shortLivedCookieOptions(600));
        }
        return res;
    }

    const existing = await getOrganizerSessionFromCookies();
    let token: string;
    try {
        token = await createOrganizerSessionToken({
            email,
            wallet: existing?.wallet,
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
        email,
        wallet: existing?.wallet ?? null,
        stored: organizerDbAvailable() ? 'database' : 'cookie',
    });
    res.cookies.set(ORGANIZER_SESSION_COOKIE, token, organizerSessionCookieOptions());
    res.cookies.set(ORGANIZER_OTP_COOKIE, '', { ...shortLivedCookieOptions(0), maxAge: 0 });
    return res;
}
