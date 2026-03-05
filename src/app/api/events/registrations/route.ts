import { NextResponse } from 'next/server';
import { getRegistrations } from '@/lib/registrations';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get('eventId');

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
        }

        const all = await getRegistrations();
        const eventRegistrations = all.filter(
            r => r.eventId.toLowerCase() === eventId.trim().toLowerCase()
        );

        return NextResponse.json(eventRegistrations, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 });
    }
}
