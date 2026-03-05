import { NextResponse } from 'next/server';
import { getEvents, createEvent } from '@/lib/events';
import { getRegistrations } from '@/lib/registrations';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const events = await getEvents();
        let registrations: Awaited<ReturnType<typeof getRegistrations>> = [];
        try {
            registrations = await getRegistrations();
        } catch (regErr) {
            console.error('Failed to fetch registrations (using empty):', regErr);
        }
        const sorted = events
            .map((ev) => {
                const registrationCount = registrations.filter(
                    (r) => r.eventId?.toLowerCase() === ev.id.toLowerCase()
                ).length;
                return { ...ev, registrationCount };
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return NextResponse.json(sorted, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        console.error('GET /api/events error:', error);
        const msg = error instanceof Error ? error.message : 'Failed to fetch events';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, description, date, endDate, location, maxAttendees, organizer, isVip, vipTokenAddress, vipMinBalance, bannerUrl } = body;

        if (!name || !date || !organizer) {
            return NextResponse.json({ error: 'Name, date, and organizer are required' }, { status: 400 });
        }

        const event = await createEvent({
            name,
            description: description || '',
            date,
            endDate: endDate || undefined,
            location: location || '',
            maxAttendees: typeof maxAttendees === 'number' && maxAttendees > 0 ? maxAttendees : undefined,
            organizer,
            isVip: !!isVip,
            vipTokenAddress: vipTokenAddress || '',
            vipMinBalance: vipMinBalance || '',
            bannerUrl: bannerUrl || undefined,
        });
        return NextResponse.json(event, { status: 201 });
    } catch (error) {
        const raw =
            error instanceof Error
                ? error.message
                : typeof (error as { message?: string })?.message === 'string'
                  ? (error as { message: string }).message
                  : 'Failed to create event';
        const message =
            raw.toLowerCase().includes('fetch failed') || raw.toLowerCase().includes('econnrefused')
                ? 'Cannot reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL, your network, and that the Supabase project is not paused.'
                : raw;
        console.error('Create event error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
