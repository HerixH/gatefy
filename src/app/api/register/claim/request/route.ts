import { NextResponse } from 'next/server';
import { getEventById } from '@/lib/events';
import { sendAttendeeTicketCodeEmail } from '@/lib/email';
import { isRegisteredByEmail } from '@/lib/registrations';
import {
    attendeeTicketAuthConfigured,
    createAttendeeTicketOtp,
    normalizeAttendeeEmail,
} from '@/lib/attendee-ticket-auth';

export const dynamic = 'force-dynamic';

/**
 * Already registered? Send a 6-digit email code so they can open their ticket.
 */
export async function POST(request: Request) {
    if (!attendeeTicketAuthConfigured()) {
        return NextResponse.json(
            {
                error:
                    'Ticket email verify is not configured. Set ORGANIZER_SESSION_SECRET and Supabase (organizer_otps).',
            },
            { status: 503 }
        );
    }

    let body: { eventId?: string; email?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const email = normalizeAttendeeEmail(typeof body.email === 'string' ? body.email : '');
    if (!eventId || !email) {
        return NextResponse.json({ error: 'Event and a valid email are required.' }, { status: 400 });
    }

    const ev = await getEventById(eventId);
    if (!ev) {
        return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    if (!(await isRegisteredByEmail(eventId, email))) {
        return NextResponse.json(
            { error: 'No registration found for this email on this event.' },
            { status: 404 }
        );
    }

    const stored = await createAttendeeTicketOtp(eventId, email);
    if ('error' in stored) {
        return NextResponse.json(
            {
                error: stored.error.includes('organizer_otps')
                    ? 'Auth tables missing. Run supabase/patches/11_organizer_sessions.sql.'
                    : stored.error,
            },
            { status: 503 }
        );
    }

    const sent = await sendAttendeeTicketCodeEmail({
        to: email,
        code: stored.code,
        eventName: ev.name,
    });

    if (!sent.ok && !sent.skipped) {
        return NextResponse.json(
            { error: sent.error || 'Could not send verification email.' },
            { status: 502 }
        );
    }

    return NextResponse.json({
        ok: true,
        email,
        eventId: ev.id,
        emailSent: !!sent.ok && !sent.skipped,
        ...(sent.skipped ? { devCode: stored.code } : {}),
        message: sent.skipped
            ? 'Email delivery is not configured. Use the code returned for local testing.'
            : 'Check your inbox for a 6-digit code, then enter it here to open your ticket.',
    });
}
