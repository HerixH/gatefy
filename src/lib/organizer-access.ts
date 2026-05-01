import { getOrganizerEmailFromId, isEmailOrganizerId } from '@/lib/event-organizer';
import { getEvents, type Event } from '@/lib/events';

const ADDR = /^0x[a-fA-F0-9]{40}$/;

/** True if the caller’s claimed wallet or email matches the event’s organizer field (server-side). */
export function serverOrganizerMatchesEvent(
    eventOrganizer: string,
    params: { organizerWallet?: string | null; organizerEmail?: string | null }
): boolean {
    const o = eventOrganizer.trim();
    const w = (params.organizerWallet ?? '').trim();
    const e = (params.organizerEmail ?? '').trim().toLowerCase();

    if (ADDR.test(w) && w.toLowerCase() === o.toLowerCase()) return true;
    if (isEmailOrganizerId(o)) {
        const expected = getOrganizerEmailFromId(o);
        if (expected && e === expected) return true;
    }
    return false;
}

export async function findEventByIdCaseInsensitive(eventId: string): Promise<Event | undefined> {
    const id = eventId.trim().toLowerCase();
    if (!id) return undefined;
    const events = await getEvents();
    return events.find(e => e.id.toLowerCase() === id);
}
