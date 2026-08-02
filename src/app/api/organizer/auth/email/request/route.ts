import { NextResponse } from 'next/server';
import { sendOrganizerSignInCodeEmail } from '@/lib/email';
import {
    ORGANIZER_OTP_COOKIE,
    createEmailOtpChallenge,
    normalizeOrganizerEmail,
    organizerAuthConfigured,
    shortLivedCookieOptions,
} from '@/lib/organizer-auth';
import { organizerDbAvailable } from '@/lib/organizer-session-db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    if (!organizerAuthConfigured()) {
        return NextResponse.json(
            {
                error: 'Organizer auth is not configured. Set ORGANIZER_SESSION_SECRET (or ADMIN_SESSION_SECRET) in the server environment.',
            },
            { status: 503 }
        );
    }

    if (!organizerDbAvailable()) {
        return NextResponse.json(
            {
                error: 'Host sign-in requires the database. Configure Supabase, then run supabase/patches/11_organizer_sessions.sql.',
            },
            { status: 503 }
        );
    }

    let body: { email?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const email = normalizeOrganizerEmail(typeof body.email === 'string' ? body.email : '');
    if (!email) {
        return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    let code: string;
    let cookieValue: string;
    try {
        ({ code, cookieValue } = await createEmailOtpChallenge(email));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not store sign-in code.';
        return NextResponse.json(
            {
                error: msg.includes('organizer_otps')
                    ? 'Host auth tables missing. Run supabase/patches/11_organizer_sessions.sql in Supabase SQL Editor.'
                    : msg,
            },
            { status: 503 }
        );
    }

    const sent = await sendOrganizerSignInCodeEmail({ to: email, code });

    if (!sent.ok && !sent.skipped) {
        return NextResponse.json(
            { error: sent.error || 'Could not send sign-in email.' },
            { status: 502 }
        );
    }

    // Never surface the OTP in the UI when email was delivered — user must enter it from inbox.
    // Only return devCode if email could not be sent (local without Resend).
    const res = NextResponse.json({
        ok: true,
        email,
        stored: 'database',
        emailSent: !!sent.ok && !sent.skipped,
        ...(sent.skipped ? { devCode: code } : {}),
        message: sent.skipped
            ? 'Email delivery is not configured. Use the code returned for local testing.'
            : 'Check your inbox for a 6-digit code, then enter it here.',
    });
    res.cookies.set(ORGANIZER_OTP_COOKIE, cookieValue, shortLivedCookieOptions(600));
    return res;
}
