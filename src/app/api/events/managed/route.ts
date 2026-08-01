import { NextResponse } from 'next/server';
import { getEvents } from '@/lib/events';
import { getRegistrations } from '@/lib/registrations';
import { serverOrganizerMatchesEvent, getVerifiedOrganizerSession } from '@/lib/organizer-access';
import { isPaidRegistration } from '@/lib/event-payment';
import { sessionToAuthParams } from '@/lib/organizer-auth';

export const dynamic = 'force-dynamic';

/**
 * Organizer-scoped event list — requires verified host session (email OTP or wallet signature).
 */
export async function GET() {
    try {
        const session = await getVerifiedOrganizerSession();
        if (!session) {
            return NextResponse.json(
                { error: 'Sign in as host first (email code or wallet signature).' },
                { status: 401 }
            );
        }

        const auth = sessionToAuthParams(session);
        const events = await getEvents({ includeCancelled: true });
        let registrations: Awaited<ReturnType<typeof getRegistrations>> = [];
        try {
            registrations = await getRegistrations();
        } catch {
            registrations = [];
        }

        const managed = events.filter((ev) =>
            serverOrganizerMatchesEvent(ev.organizer, {
                organizerWallet: auth.organizerWallet,
                organizerEmail: auth.organizerEmail,
            })
        );

        const withCounts = managed
            .map((ev) => {
                const eventRegs = registrations.filter(
                    (r) => r.eventId?.toLowerCase() === ev.id.toLowerCase()
                );
                const registrationCount = eventRegs.length;
                const price = ev.ticketPriceUsdc != null && ev.ticketPriceUsdc > 0 ? Number(ev.ticketPriceUsdc) : 0;
                let paidRegistrationCount = 0;
                let unpaidRegistrationCount = 0;
                if (price > 0) {
                    for (const r of eventRegs) {
                        if (isPaidRegistration(r.paymentStatus)) paidRegistrationCount++;
                        else unpaidRegistrationCount++;
                    }
                }
                return {
                    ...ev,
                    registrationCount,
                    paidRegistrationCount,
                    unpaidRegistrationCount,
                };
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
