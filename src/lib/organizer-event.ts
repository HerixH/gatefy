/** Event shape returned by GET /api/events and /api/events/managed */
export type OrganizerEvent = {
    id: string;
    name: string;
    description: string;
    date: string;
    endDate?: string;
    location: string;
    organizer: string;
    organizerDisplayName?: string;
    verificationCode: string;
    createdAt: string;
    attendeeCount: number;
    maxAttendees?: number;
    registrationCount?: number;
    paidRegistrationCount?: number;
    unpaidRegistrationCount?: number;
    bannerUrl?: string;
    isBlockchain?: boolean;
    ticketPriceUsdc?: number;
    mobileMoneyInstructions?: string;
    ticketAcceptUsdc?: boolean;
    ticketAcceptMobileMoney?: boolean;
};

export function toDatetimeLocalValue(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getPublicRegistrationLink(eventId: string, origin?: string) {
    const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
    return `${base}/?event=${encodeURIComponent(eventId)}`;
}
