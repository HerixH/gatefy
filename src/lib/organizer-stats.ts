import type { OrganizerEvent } from '@/lib/organizer-event';
import { isPaidRegistration } from '@/lib/event-payment';

export function getRegisteredCount(ev: Pick<OrganizerEvent, 'registrationCount' | 'attendeeCount'>) {
    return ev.registrationCount ?? ev.attendeeCount ?? 0;
}

export function getRemainingSeats(ev: Pick<OrganizerEvent, 'maxAttendees' | 'registrationCount' | 'attendeeCount'>) {
    if (ev.maxAttendees == null || ev.maxAttendees <= 0) return null;
    return Math.max(0, ev.maxAttendees - getRegisteredCount(ev));
}

export function capacityPercent(ev: Pick<OrganizerEvent, 'maxAttendees' | 'registrationCount' | 'attendeeCount'>) {
    if (ev.maxAttendees == null || ev.maxAttendees <= 0) return null;
    const pct = (getRegisteredCount(ev) / ev.maxAttendees) * 100;
    return Math.min(100, Math.round(pct));
}

export function checkInRatePercent(
    registrationCount: number,
    verifiedCount: number
): number | null {
    if (registrationCount <= 0) return null;
    return Math.round((verifiedCount / registrationCount) * 100);
}

/** Paid ticket count × price (USDC recorded at registration, not on-chain settlement). */
export function estimatedUsdcRevenue(
    ticketPriceUsdc: number | undefined,
    paidRegistrationCount: number
): number {
    const price = ticketPriceUsdc ?? 0;
    if (!(Number.isFinite(price) && price > 0)) return 0;
    return Math.round(price * paidRegistrationCount * 100) / 100;
}

export function sumPortfolioRevenue(events: OrganizerEvent[]): number {
    let total = 0;
    for (const ev of events) {
        total += estimatedUsdcRevenue(ev.ticketPriceUsdc, ev.paidRegistrationCount ?? 0);
    }
    return Math.round(total * 100) / 100;
}

export function matchesRosterSearch(
    row: { wallet?: string | null; email?: string | null; name?: string | null; code?: string },
    query: string
): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const parts = [
        row.wallet ?? '',
        row.email ?? '',
        row.name ?? '',
        row.code ?? '',
    ].map((s) => s.toLowerCase());
    return parts.some((p) => p.includes(q));
}

export function isUnpaidRegistration(
    paymentStatus: string | null | undefined,
    ticketPriceUsdc: number
): boolean {
    if (!(ticketPriceUsdc > 0)) return false;
    return !isPaidRegistration(paymentStatus);
}
