import { NextResponse } from 'next/server';
import { getAttendance } from '@/lib/codes';
import { findEventByIdCaseInsensitive, requireOrganizerSessionForEvent } from '@/lib/organizer-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get('eventId');
        const organizerWallet = searchParams.get('organizerWallet');
        const organizerEmail = searchParams.get('organizerEmail');

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
        }

        const event = await findEventByIdCaseInsensitive(eventId);
        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        const auth = await requireOrganizerSessionForEvent(event.organizer, {
            organizerWallet,
            organizerEmail,
        });
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const records = await getAttendance();
        const id = eventId.trim();
        const eventAttendees = records.filter(
            (r) => r.eventId != null && String(r.eventId).toLowerCase() === id.toLowerCase()
        );

        return NextResponse.json(eventAttendees, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch attendees' }, { status: 500 });
    }
}
