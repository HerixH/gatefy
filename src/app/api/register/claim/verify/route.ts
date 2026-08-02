import { NextResponse } from 'next/server';
import { getRegistrationForEvent } from '@/lib/registrations';
import {
    attendeeTicketAuthConfigured,
    normalizeAttendeeEmail,
    signTicketAccess,
    ticketCookieOptions,
    TICKET_COOKIE,
    verifyAttendeeTicketOtp,
} from '@/lib/attendee-ticket-auth';

export const dynamic = 'force-dynamic';

/**
 * Verify email OTP and unlock the attendee’s existing ticket for this event.
 */
export async function POST(request: Request) {
    if (!attendeeTicketAuthConfigured()) {
        return NextResponse.json(
            { error: 'Ticket email verify is not configured.' },
            { status: 503 }
        );
    }

    let body: { eventId?: string; email?: string; code?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const email = normalizeAttendeeEmail(typeof body.email === 'string' ? body.email : '');
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!eventId || !email) {
        return NextResponse.json({ error: 'Event and email are required.' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 });
    }

    const verified = await verifyAttendeeTicketOtp(eventId, email, code);
    if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 401 });
    }

    const row = await getRegistrationForEvent(eventId, { email });
    if (!row) {
        return NextResponse.json({ error: 'Registration not found.' }, { status: 404 });
    }

    const token = signTicketAccess(eventId, email);
    const res = NextResponse.json({
        ok: true,
        alreadyRegistered: true,
        registered: true,
        email: row.email ?? email,
        name: row.name ?? null,
        wallet: row.wallet ?? null,
        paymentStatus: row.paymentStatus ?? null,
        paymentTxHash: row.paymentTxHash ?? null,
        paymentReference: row.paymentReference ?? null,
    });
    res.cookies.set(TICKET_COOKIE, token, ticketCookieOptions());
    return res;
}
