import { NextResponse } from 'next/server';
import { getEvents } from '@/lib/events';
import { getRegistrations } from '@/lib/registrations';
import { serverOrganizerMatchesEvent } from '@/lib/organizer-access';

export const dynamic = 'force-dynamic';

/**
 * Organizer-scoped event list — same shape as GET /api/events but only events this wallet or session email manages.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const organizerWallet = searchParams.get('organizerWallet');
        const organizerEmail = searchParams.get('organizerEmail');

        if (!organizerWallet?.trim() && !organizerEmail?.trim()) {
            return NextResponse.json(
                {
                    error: 'organizerWallet or organizerEmail is required',
                },
                { status: 400 }
            );
        }

        const events = await getEvents();
        let registrations: Awaited<ReturnType<typeof getRegistrations>> = [];
        try {
            registrations = await getRegistrations();
        } catch {
            registrations = [];
        }

        const managed = events.filter((ev) =>
            serverOrganizerMatchesEvent(ev.organizer, { organizerWallet, organizerEmail })
        );

        const withCounts = managed
            .map((ev) => {
                const registrationCount = registrations.filter(
                    (r) => r.eventId?.toLowerCase() === ev.id.toLowerCase()
                ).length;
                return { ...ev, registrationCount };
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return NextResponse.json(withCounts, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        console.error('GET /api/events/managed error:', error);
        return NextResponse.json({ error: 'Failed to fetch managed events' }, { status: 500 });
    }
}
