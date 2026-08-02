import { organizerAuthParamsForEvent } from '@/lib/event-organizer';
import { getEvents, type Event } from '@/lib/events';
import {
    getOrganizerSessionFromCookies,
    verifiedSessionOwnsEvent,
    type OrganizerSession,
} from '@/lib/organizer-auth';

/** True if the caller’s claimed wallet or email matches the event’s organizer field (server-side). */
export function serverOrganizerMatchesEvent(
    eventOrganizer: string,
    params: { organizerWallet?: string | null; organizerEmail?: string | null }
): boolean {
    const w = (params.organizerWallet ?? '').trim();
    const e = (params.organizerEmail ?? '').trim().toLowerCase();
    return (
        organizerAuthParamsForEvent(eventOrganizer, {
            address: w || null,
            organizerSessionEmail: e || null,
        }) != null
    );
}

/**
 * Prefer verified httpOnly session. Claimed wallet/email must match the session when provided.
 */
export async function requireOrganizerSessionForEvent(
    eventOrganizer: string,
    claimed?: { organizerWallet?: string | null; organizerEmail?: string | null }
): Promise<
    | { ok: true; session: OrganizerSession }
    | { ok: false; status: number; error: string }
> {
    const session = await getOrganizerSessionFromCookies();
    if (!session) {
        return {
            ok: false,
            status: 401,
            error: 'Sign in as host first (email code or wallet signature).',
        };
    }
    if (!verifiedSessionOwnsEvent(session, eventOrganizer, claimed)) {
        return {
            ok: false,
            status: 403,
            error: 'Only the verified event organizer can do this.',
        };
    }
    return { ok: true, session };
}

/**
 * Read-only host roster access.
 * 1) Verified cookie session (preferred)
 * 2) Claimed organizer email/wallet that matches the event (homepage host session)
 */
export async function requireOrganizerListAccess(
    eventOrganizer: string,
    claimed?: { organizerWallet?: string | null; organizerEmail?: string | null }
): Promise<
    | { ok: true; session: OrganizerSession | null }
    | { ok: false; status: number; error: string }
> {
    const session = await getOrganizerSessionFromCookies();
    if (session && verifiedSessionOwnsEvent(session, eventOrganizer, claimed)) {
        return { ok: true, session };
    }
    if (serverOrganizerMatchesEvent(eventOrganizer, claimed || {})) {
        return { ok: true, session };
    }
    if (!session) {
        return {
            ok: false,
            status: 401,
            error: 'Sign in as host first (same email/wallet used to create this event).',
        };
    }
    return {
        ok: false,
        status: 403,
        error: 'Only the event organizer can view this roster.',
    };
}

export async function getVerifiedOrganizerSession(): Promise<OrganizerSession | null> {
    return getOrganizerSessionFromCookies();
}

export async function findEventByIdCaseInsensitive(eventId: string): Promise<Event | undefined> {
    const id = eventId.trim().toLowerCase();
    if (!id) return undefined;
    // Include cancelled so hosts can still manage roster history.
    const events = await getEvents({ includeCancelled: true });
    return events.find((e) => e.id.toLowerCase() === id);
}
