import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { verifyMessage } from 'viem';
import { isEmailOrganizerId, getOrganizerEmailFromId } from '@/lib/event-organizer';
import {
    dbClearWalletChallenge,
    dbCreateSession,
    dbGetWalletChallenge,
    dbLookupSession,
    dbRevokeSession,
    dbStoreEmailOtp,
    dbStoreWalletChallenge,
    dbVerifyEmailOtp,
    organizerDbAvailable,
} from '@/lib/organizer-session-db';

export const ORGANIZER_SESSION_COOKIE = 'gatefy_organizer';
export const ORGANIZER_OTP_COOKIE = 'gatefy_org_otp';
export const ORGANIZER_WALLET_CHALLENGE_COOKIE = 'gatefy_org_wchal';

const SESSION_TTL_SEC = 60 * 60 * 24 * 14; // 14 days
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const WALLET_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export type OrganizerSession = {
    email?: string;
    wallet?: string;
    exp: number;
};

function signingKey(): string {
    return (
        process.env.ORGANIZER_SESSION_SECRET?.trim() ||
        process.env.ADMIN_SESSION_SECRET?.trim() ||
        process.env.ADMIN_DASHBOARD_PASSWORD?.trim() ||
        ''
    );
}

export function organizerAuthConfigured(): boolean {
    return !!signingKey();
}

function b64url(buf: Buffer | string): string {
    const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
    return b.toString('base64url');
}

function fromB64url(s: string): Buffer {
    return Buffer.from(s, 'base64url');
}

function signPayload(payloadJson: string): string {
    const key = signingKey();
    if (!key) throw new Error('Organizer auth is not configured (set ORGANIZER_SESSION_SECRET).');
    const body = b64url(payloadJson);
    const sig = createHmac('sha256', key).update(body).digest('base64url');
    return `${body}.${sig}`;
}

function verifySignedPayload<T>(token: string): T | null {
    const key = signingKey();
    if (!key || !token) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = createHmac('sha256', key).update(body).digest('base64url');
    try {
        if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
            return null;
        }
    } catch {
        return null;
    }
    try {
        return JSON.parse(fromB64url(body).toString('utf8')) as T;
    } catch {
        return null;
    }
}

function hashCode(code: string, email: string): string {
    const key = signingKey();
    return createHash('sha256').update(`${email}:${code}:${key}`).digest('hex');
}

export function normalizeOrganizerEmail(raw: string): string | null {
    const e = raw.trim().toLowerCase();
    return EMAIL_RE.test(e) ? e : null;
}

export function normalizeOrganizerWallet(raw: string): string | null {
    const w = raw.trim();
    return ADDR_RE.test(w) ? w.toLowerCase() : null;
}

/** Create email OTP in DB (preferred) + signed cookie fallback. Returns plaintext code to email. */
export async function createEmailOtpChallenge(
    email: string
): Promise<{ code: string; cookieValue: string }> {
    if (organizerDbAvailable()) {
        const stored = await dbStoreEmailOtp(email);
        if ('error' in stored) {
            throw new Error(stored.error);
        }
        // Cookie mirror for same-browser UX; DB is source of truth.
        const payload = {
            email,
            codeHash: hashCode(stored.code, email),
            exp: Date.now() + OTP_TTL_MS,
            attempts: 0,
        };
        return { code: stored.code, cookieValue: signPayload(JSON.stringify(payload)) };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const payload = {
        email,
        codeHash: hashCode(code, email),
        exp: Date.now() + OTP_TTL_MS,
        attempts: 0,
    };
    return { code, cookieValue: signPayload(JSON.stringify(payload)) };
}

export async function verifyEmailOtpChallenge(
    cookieValue: string | undefined,
    email: string,
    code: string
): Promise<{ ok: true } | { ok: false; error: string; bumpCookie?: string }> {
    if (organizerDbAvailable()) {
        const db = await dbVerifyEmailOtp(email, code);
        if (db.ok) return { ok: true };
        // Fall through to cookie only if DB has no row (older clients mid-flow).
        if (!db.error.includes('No active')) {
            return { ok: false, error: db.error };
        }
    }

    const parsed = cookieValue
        ? verifySignedPayload<{ email: string; codeHash: string; exp: number; attempts: number }>(
              cookieValue
          )
        : null;
    if (!parsed) return { ok: false, error: 'No active sign-in code. Request a new one.' };
    if (parsed.email !== email) return { ok: false, error: 'Email does not match the code we sent.' };
    if (Date.now() > parsed.exp) return { ok: false, error: 'Code expired. Request a new one.' };
    if (parsed.attempts >= 5) return { ok: false, error: 'Too many attempts. Request a new code.' };

    const expected = parsed.codeHash;
    const got = hashCode(code.trim(), email);
    if (expected.length !== got.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(got))) {
        const bumped = signPayload(
            JSON.stringify({ ...parsed, attempts: (parsed.attempts ?? 0) + 1 })
        );
        return { ok: false, error: 'Invalid code.', bumpCookie: bumped };
    }
    return { ok: true };
}

export async function createWalletChallenge(
    address: string
): Promise<{ message: string; cookieValue: string; nonce: string }> {
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();
    const message = [
        'Gate Protocol host sign-in',
        '',
        'Sign this message to prove you control this wallet.',
        '',
        `Address: ${address}`,
        `Nonce: ${nonce}`,
        `Issued at: ${issuedAt}`,
    ].join('\n');
    const payload = {
        address: address.toLowerCase(),
        nonce,
        message,
        exp: Date.now() + WALLET_CHALLENGE_TTL_MS,
    };
    if (organizerDbAvailable()) {
        const stored = await dbStoreWalletChallenge(address, nonce, message);
        if ('error' in stored) throw new Error(stored.error);
    }
    return { message, nonce, cookieValue: signPayload(JSON.stringify(payload)) };
}

export async function verifyWalletChallenge(
    cookieValue: string | undefined,
    address: string,
    signature: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    let message: string | null = null;

    if (organizerDbAvailable()) {
        const row = await dbGetWalletChallenge(address);
        if (row) message = row.message;
    }

    if (!message) {
        const parsed = cookieValue
            ? verifySignedPayload<{ address: string; nonce: string; message: string; exp: number }>(
                  cookieValue
              )
            : null;
        if (!parsed) return { ok: false, error: 'No active wallet challenge. Request a new one.' };
        if (parsed.address !== address.toLowerCase()) {
            return { ok: false, error: 'Wallet does not match the challenge.' };
        }
        if (Date.now() > parsed.exp) return { ok: false, error: 'Challenge expired. Request a new one.' };
        message = parsed.message;
    }

    try {
        const valid = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });
        if (!valid) return { ok: false, error: 'Invalid signature.' };
        if (organizerDbAvailable()) await dbClearWalletChallenge(address);
        return { ok: true };
    } catch {
        return { ok: false, error: 'Could not verify signature.' };
    }
}

/** Create host session in DB (preferred) or signed cookie fallback. */
export async function createOrganizerSessionToken(
    session: Omit<OrganizerSession, 'exp'> & { exp?: number }
): Promise<string> {
    if (!session.email && !session.wallet) throw new Error('Session needs email or wallet');

    if (organizerDbAvailable()) {
        const created = await dbCreateSession({
            email: session.email,
            wallet: session.wallet,
        });
        if ('error' in created) throw new Error(created.error);
        return created.token;
    }

    const payload: OrganizerSession = {
        email: session.email,
        wallet: session.wallet,
        exp: session.exp ?? Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
    };
    return signPayload(JSON.stringify(payload));
}

export function parseOrganizerSessionToken(token: string | undefined): OrganizerSession | null {
    if (!token || !token.includes('.')) return null;
    const parsed = verifySignedPayload<OrganizerSession>(token);
    if (!parsed) return null;
    if (typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    if (parsed.email) {
        const e = normalizeOrganizerEmail(parsed.email);
        if (!e) return null;
        parsed.email = e;
    }
    if (parsed.wallet) {
        const w = normalizeOrganizerWallet(parsed.wallet);
        if (!w) return null;
        parsed.wallet = w;
    }
    if (!parsed.email && !parsed.wallet) return null;
    return parsed;
}

export async function getOrganizerSessionFromCookies(): Promise<OrganizerSession | null> {
    if (!organizerAuthConfigured()) return null;
    const store = await cookies();
    const raw = store.get(ORGANIZER_SESSION_COOKIE)?.value;
    if (!raw) return null;

    if (organizerDbAvailable()) {
        const dbSession = await dbLookupSession(raw);
        if (dbSession) {
            return {
                email: dbSession.email ? normalizeOrganizerEmail(dbSession.email) ?? undefined : undefined,
                wallet: dbSession.wallet
                    ? normalizeOrganizerWallet(dbSession.wallet) ?? undefined
                    : undefined,
                exp: dbSession.exp,
            };
        }
    }

    // Legacy signed cookies (pre–DB sessions).
    return parseOrganizerSessionToken(raw);
}

export async function revokeOrganizerSessionCookie(): Promise<void> {
    const store = await cookies();
    const raw = store.get(ORGANIZER_SESSION_COOKIE)?.value;
    await dbRevokeSession(raw);
}

/** Session cookie options (path `/` so host APIs + pages share it). */
export function organizerSessionCookieOptions(maxAge = SESSION_TTL_SEC) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge,
    };
}

export function shortLivedCookieOptions(maxAgeSec = 600) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge: maxAgeSec,
    };
}

/**
 * True when the verified session owns this event.
 * Claimed query/body identity must also match the session (prevents session A acting as B).
 */
export function verifiedSessionOwnsEvent(
    session: OrganizerSession | null,
    eventOrganizer: string,
    claimed?: { organizerWallet?: string | null; organizerEmail?: string | null }
): boolean {
    if (!session) return false;
    const o = eventOrganizer.trim();

    if (isEmailOrganizerId(o)) {
        const expected = getOrganizerEmailFromId(o);
        if (!expected || !session.email || session.email !== expected) return false;
        const claimedEmail = (claimed?.organizerEmail ?? '').trim().toLowerCase();
        if (claimedEmail && claimedEmail !== session.email) return false;
        return true;
    }

    const ow = o.toLowerCase();
    if (!session.wallet || session.wallet !== ow) return false;
    const claimedWallet = (claimed?.organizerWallet ?? '').trim().toLowerCase();
    if (claimedWallet && claimedWallet !== session.wallet) return false;
    return true;
}

/** Merge session into auth params for managed list queries. */
export function sessionToAuthParams(session: OrganizerSession | null): {
    organizerWallet?: string;
    organizerEmail?: string;
} {
    if (!session) return {};
    return {
        ...(session.wallet ? { organizerWallet: session.wallet } : {}),
        ...(session.email ? { organizerEmail: session.email } : {}),
    };
}
