/** Prefix for organizers who use email instead of a wallet address. */
export const EMAIL_ORGANIZER_PREFIX = 'email:';

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

export function isEventOrganizer(
    organizerField: string,
    ctx: { address?: string | null; organizerSessionEmail?: string | null }
): boolean {
    const o = organizerField.trim();
    if (ctx.address && o.toLowerCase() === ctx.address.toLowerCase()) return true;
    const em = getOrganizerEmailFromId(o);
    if (em && ctx.organizerSessionEmail?.trim().toLowerCase() === em) return true;
    return false;
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
