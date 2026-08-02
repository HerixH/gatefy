import { createHmac, timingSafeEqual } from 'crypto';
import { dbStoreEmailOtp, dbVerifyEmailOtp, organizerDbAvailable } from '@/lib/organizer-session-db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TICKET_COOKIE = 'gatefy_ticket';
const TICKET_TTL_SEC = 60 * 60 * 24 * 14;

export { TICKET_COOKIE };

function signingKey(): string {
    return (
        process.env.ORGANIZER_SESSION_SECRET?.trim() ||
        process.env.ADMIN_SESSION_SECRET?.trim() ||
        process.env.ADMIN_DASHBOARD_PASSWORD?.trim() ||
        ''
    );
}

export function attendeeTicketAuthConfigured(): boolean {
    return !!signingKey() && organizerDbAvailable();
}

export function normalizeAttendeeEmail(raw: string): string | null {
    const e = raw.trim().toLowerCase();
    return EMAIL_RE.test(e) ? e : null;
}

/** OTP row key — separate from host OTPs for the same inbox. */
export function attendeeOtpStorageKey(eventId: string, email: string): string {
    return `ticket:${eventId.trim().toLowerCase()}:${email.trim().toLowerCase()}`;
}

export async function createAttendeeTicketOtp(
    eventId: string,
    email: string
): Promise<{ code: string } | { error: string }> {
    return dbStoreEmailOtp(attendeeOtpStorageKey(eventId, email));
}

export async function verifyAttendeeTicketOtp(
    eventId: string,
    email: string,
    code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    return dbVerifyEmailOtp(attendeeOtpStorageKey(eventId, email), code);
}

function b64url(buf: Buffer | string): string {
    const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
    return b.toString('base64url');
}

function fromB64url(s: string): Buffer {
    return Buffer.from(s, 'base64url');
}

export function signTicketAccess(eventId: string, email: string): string {
    const key = signingKey();
    if (!key) throw new Error('Ticket auth is not configured.');
    const payload = JSON.stringify({
        eventId: eventId.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        exp: Math.floor(Date.now() / 1000) + TICKET_TTL_SEC,
    });
    const body = b64url(payload);
    const sig = createHmac('sha256', key).update(body).digest('base64url');
    return `${body}.${sig}`;
}

export function verifyTicketAccessToken(
    token: string | undefined,
    eventId: string,
    email: string
): boolean {
    const key = signingKey();
    if (!key || !token) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [body, sig] = parts;
    const expected = createHmac('sha256', key).update(body).digest('base64url');
    try {
        if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
            return false;
        }
    } catch {
        return false;
    }
    try {
        const data = JSON.parse(fromB64url(body).toString('utf8')) as {
            eventId?: string;
            email?: string;
            exp?: number;
        };
        if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return false;
        return (
            (data.eventId || '').toLowerCase() === eventId.trim().toLowerCase() &&
            (data.email || '').toLowerCase() === email.trim().toLowerCase()
        );
    } catch {
        return false;
    }
}

export function ticketCookieOptions(maxAgeSec = TICKET_TTL_SEC) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge: maxAgeSec,
    };
}
