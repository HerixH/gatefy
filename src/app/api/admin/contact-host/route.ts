import { NextResponse } from 'next/server';
import { verifyAdminCookieFromStore } from '@/lib/admin-auth';
import { findEventByIdCaseInsensitive } from '@/lib/organizer-access';
import { getOrganizerEmailFromId, isEmailOrganizerId } from '@/lib/event-organizer';
import { sendAdminHostContactEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Admin → event host email.
 * Email-hosted events use the organizer id; wallet hosts require an explicit `toEmail`.
 */
export async function POST(request: Request) {
    if (!(await verifyAdminCookieFromStore())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
        const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        const toOverride = typeof body.toEmail === 'string' ? body.toEmail.trim().toLowerCase() : '';

        if (!eventId) {
            return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
        }
        if (subject.length < 3) {
            return NextResponse.json({ error: 'Subject must be at least 3 characters.' }, { status: 400 });
        }
        if (message.length < 10) {
            return NextResponse.json({ error: 'Message must be at least 10 characters.' }, { status: 400 });
        }

        const event = await findEventByIdCaseInsensitive(eventId);
        if (!event) {
            return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
        }

        const fromOrganizer = getOrganizerEmailFromId(event.organizer);
        const to = toOverride || fromOrganizer || '';
        if (!EMAIL_RE.test(to)) {
            return NextResponse.json(
                {
                    error: isEmailOrganizerId(event.organizer)
                        ? 'Host email is invalid.'
                        : 'This wallet host has no email on file. Enter a contact email to send.',
                    needsEmail: !fromOrganizer,
                },
                { status: 400 }
            );
        }

        const result = await sendAdminHostContactEmail({
            to,
            hostName: event.organizerDisplayName?.trim() || fromOrganizer || to,
            eventName: event.name,
            eventId: event.id,
            subject,
            message,
        });

        if (result.skipped) {
            return NextResponse.json(
                { error: 'Email is not configured on the server (RESEND_API_KEY).' },
                { status: 503 }
            );
        }
        if (!result.ok) {
            return NextResponse.json(
                { error: result.error || 'Failed to send email.' },
                { status: 502 }
            );
        }

        return NextResponse.json({ ok: true, to });
    } catch (error) {
        console.error('POST /api/admin/contact-host', error);
        return NextResponse.json({ error: 'Failed to contact host.' }, { status: 500 });
    }
}
