import { NextResponse } from 'next/server';
import { getAttendance } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get('eventId');

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
        }

        const records = await getAttendance();
        const id = eventId.trim();
        const eventAttendees = records.filter(
            r => r.eventId != null && String(r.eventId).toLowerCase() === id.toLowerCase()
        );

        return NextResponse.json(eventAttendees, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch attendees' }, { status: 500 });
    }
}
