/** Prefix for organizers who use email instead of a wallet address. */
export const EMAIL_ORGANIZER_PREFIX = 'email:';

const WALLET_ADDR = /^0x[a-fA-F0-9]{40}$/;

export type OrganizerAuthContext = {
    address?: string | null;
    organizerSessionEmail?: string | null;
};

export function isEmailOrganizerId(organizer: string): boolean {
    return organizer.trim().toLowerCase().startsWith(EMAIL_ORGANIZER_PREFIX);
}

export function getOrganizerEmailFromId(organizer: string): string | null {
    if (!isEmailOrganizerId(organizer)) return null;
    return organizer.slice(EMAIL_ORGANIZER_PREFIX.length).trim().toLowerCase();
}

export function makeEmailOrganizerId(email: string): string {
    return `${EMAIL_ORGANIZER_PREFIX}${email.trim().toLowerCase()}`;
}

/**
 * Credentials that match this event's organizer (wallet or email session).
 * Returns null when the caller is not the owner — use for API query/body auth.
 */
export function organizerAuthParamsForEvent(
    eventOrganizer: string,
    ctx: OrganizerAuthContext
): { organizerWallet?: string; organizerEmail?: string } | null {
    const o = eventOrganizer.trim();
    if (isEmailOrganizerId(o)) {
        const expected = getOrganizerEmailFromId(o);
        const session = ctx.organizerSessionEmail?.trim().toLowerCase();
        if (expected && session === expected) return { organizerEmail: expected };
        return null;
    }
    const w = (ctx.address ?? '').trim();
    if (WALLET_ADDR.test(w) && w.toLowerCase() === o.toLowerCase()) {
        return { organizerWallet: w };
    }
    return null;
}

/** True when the connected wallet or saved email session owns this event. */
export function isEventOrganizer(eventOrganizer: string, ctx: OrganizerAuthContext): boolean {
    return organizerAuthParamsForEvent(eventOrganizer, ctx) != null;
}

/** Query string for GET /api/events/managed (wallet and/or email — returns union of owned events). */
export function organizerManagedQueryString(ctx: OrganizerAuthContext): string {
    const parts: string[] = [];
    const w = (ctx.address ?? '').trim();
    const e = (ctx.organizerSessionEmail ?? '').trim().toLowerCase();
    if (WALLET_ADDR.test(w)) parts.push(`organizerWallet=${encodeURIComponent(w)}`);
    if (e) parts.push(`organizerEmail=${encodeURIComponent(e)}`);
    return parts.join('&');
}

/** Query suffix for organizer-only roster endpoints (`&organizerWallet=…` or `&organizerEmail=…`). */
export function organizerListAuthSuffixForEvent(
    eventOrganizer: string,
    ctx: OrganizerAuthContext
): string {
    const p = organizerAuthParamsForEvent(eventOrganizer, ctx);
    if (!p) return '';
    if (p.organizerWallet) return `&organizerWallet=${encodeURIComponent(p.organizerWallet)}`;
    if (p.organizerEmail) return `&organizerEmail=${encodeURIComponent(p.organizerEmail)}`;
    return '';
}

/** Short label for event cards (wallet, email, or display name). */
export function formatOrganizerShort(ev: { organizer: string; organizerDisplayName?: string }): string {
    if (isEmailOrganizerId(ev.organizer)) {
        const name = ev.organizerDisplayName?.trim();
        if (name) return name.length > 32 ? `${name.slice(0, 30)}…` : name;
        const em = getOrganizerEmailFromId(ev.organizer);
        if (em) {
            const [u, domain] = em.split('@');
            return `${u.slice(0, 3)}…@${domain}`;
        }
    }
    const o = ev.organizer;
    if (o.length < 14) return o;
    return `${o.slice(0, 6)}…${o.slice(-4)}`;
}
