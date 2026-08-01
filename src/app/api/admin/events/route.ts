import { NextResponse } from 'next/server';
import { verifyAdminCookieFromStore } from '@/lib/admin-auth';
import { getEvents, updateEventById } from '@/lib/events';
import { getRegistrations } from '@/lib/registrations';
import { findEventByIdCaseInsensitive } from '@/lib/organizer-access';

export const dynamic = 'force-dynamic';

export async function GET() {
    if (!(await verifyAdminCookieFromStore())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const events = await getEvents({ includeCancelled: true });
        let registrations: Awaited<ReturnType<typeof getRegistrations>> = [];
        try {
            registrations = await getRegistrations();
        } catch {
            registrations = [];
        }
        const sorted = events
            .map((ev) => {
                const registrationCount = registrations.filter(
                    (r) => r.eventId?.toLowerCase() === ev.id.toLowerCase()
                ).length;
                return { ...ev, registrationCount };
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return NextResponse.json(sorted, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        console.error('GET /api/admin/events', error);
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }
}

/** Admin soft-cancel / restore (any event; for misconduct). */
export async function PATCH(request: Request) {
    if (!(await verifyAdminCookieFromStore())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const body = await request.json();
        const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
        if (!eventId) {
            return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
        }
        if (typeof body.cancelled !== 'boolean') {
            return NextResponse.json({ error: 'cancelled (boolean) is required.' }, { status: 400 });
        }

        const event = await findEventByIdCaseInsensitive(eventId);
        if (!event) {
            return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
        }

        const reason =
            typeof body.reason === 'string' && body.reason.trim()
                ? body.reason.trim().slice(0, 500)
                : null;

        if (body.cancelled) {
            if (event.cancelledAt) {
                return NextResponse.json({ error: 'Event is already cancelled.' }, { status: 400 });
            }
            const updated = await updateEventById(event.id, {
                cancelledAt: new Date().toISOString(),
                cancelledByAdmin: true,
                cancelReason: reason ?? 'Cancelled by admin',
            });
            return NextResponse.json(updated);
        }

        if (!event.cancelledAt) {
            return NextResponse.json({ error: 'Event is not cancelled.' }, { status: 400 });
        }
        const updated = await updateEventById(event.id, {
            cancelledAt: null,
            cancelledByAdmin: false,
            cancelReason: null,
        });
        return NextResponse.json(updated);
    } catch (error) {
        console.error('PATCH /api/admin/events', error);
        const msg = error instanceof Error ? error.message : 'Failed to update event';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
