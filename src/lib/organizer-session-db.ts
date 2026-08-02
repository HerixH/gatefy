import { createHash, randomBytes } from 'crypto';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const SESSION_TTL_SEC = 60 * 60 * 24 * 14;
const OTP_TTL_MS = 10 * 60 * 1000;
const WALLET_CHALLENGE_TTL_MS = 10 * 60 * 1000;

export function organizerDbAvailable(): boolean {
    return isSupabaseConfigured;
}

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function hashOtpCode(code: string, email: string): string {
    const key =
        process.env.ORGANIZER_SESSION_SECRET?.trim() ||
        process.env.ADMIN_SESSION_SECRET?.trim() ||
        process.env.ADMIN_DASHBOARD_PASSWORD?.trim() ||
        'gatefy';
    return createHash('sha256').update(`${email}:${code}:${key}`).digest('hex');
}

/** Upsert email OTP in DB. Returns plaintext code to email. */
export async function dbStoreEmailOtp(email: string): Promise<{ code: string } | { error: string }> {
    if (!isSupabaseConfigured) return { error: 'Database not configured.' };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    const { error } = await getSupabase()
        .from('organizer_otps')
        .upsert(
            {
                email,
                code_hash: hashOtpCode(code, email),
                attempts: 0,
                expires_at: expiresAt,
                created_at: new Date().toISOString(),
            },
            { onConflict: 'email' }
        );
    if (error) return { error: error.message };
    return { code };
}

export async function dbVerifyEmailOtp(
    email: string,
    code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!isSupabaseConfigured) return { ok: false, error: 'Database not configured.' };
    const { data, error } = await getSupabase()
        .from('organizer_otps')
        .select('code_hash, attempts, expires_at')
        .eq('email', email)
        .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'No active sign-in code. Request a new one.' };
    if (new Date(data.expires_at).getTime() < Date.now()) {
        return { ok: false, error: 'Code expired. Request a new one.' };
    }
    if ((data.attempts ?? 0) >= 5) {
        return { ok: false, error: 'Too many attempts. Request a new code.' };
    }
    const got = hashOtpCode(code.trim(), email);
    if (got !== data.code_hash) {
        await getSupabase()
            .from('organizer_otps')
            .update({ attempts: (data.attempts ?? 0) + 1 })
            .eq('email', email);
        return { ok: false, error: 'Invalid code.' };
    }
    await getSupabase().from('organizer_otps').delete().eq('email', email);
    return { ok: true };
}

export async function dbStoreWalletChallenge(
    address: string,
    nonce: string,
    message: string
): Promise<{ ok: true } | { error: string }> {
    if (!isSupabaseConfigured) return { error: 'Database not configured.' };
    const expiresAt = new Date(Date.now() + WALLET_CHALLENGE_TTL_MS).toISOString();
    const { error } = await getSupabase()
        .from('organizer_wallet_challenges')
        .upsert(
            {
                address: address.toLowerCase(),
                nonce,
                message,
                expires_at: expiresAt,
                created_at: new Date().toISOString(),
            },
            { onConflict: 'address' }
        );
    if (error) return { error: error.message };
    return { ok: true };
}

export async function dbGetWalletChallenge(
    address: string
): Promise<{ message: string; nonce: string } | null> {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await getSupabase()
        .from('organizer_wallet_challenges')
        .select('message, nonce, expires_at')
        .eq('address', address.toLowerCase())
        .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    return { message: data.message, nonce: data.nonce };
}

export async function dbClearWalletChallenge(address: string): Promise<void> {
    if (!isSupabaseConfigured) return;
    await getSupabase().from('organizer_wallet_challenges').delete().eq('address', address.toLowerCase());
}

export type DbOrganizerSession = {
    email?: string;
    wallet?: string;
    exp: number;
};

/** Create durable session row; returns opaque cookie token. */
export async function dbCreateSession(identity: {
    email?: string;
    wallet?: string;
}): Promise<{ token: string; session: DbOrganizerSession } | { error: string }> {
    if (!isSupabaseConfigured) return { error: 'Database not configured.' };
    if (!identity.email && !identity.wallet) return { error: 'Session needs email or wallet.' };

    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);

    // One active session per identity (replace older rows for same email/wallet).
    const supabase = getSupabase();
    if (identity.email) {
        await supabase.from('organizer_sessions').delete().eq('email', identity.email);
    }
    if (identity.wallet) {
        await supabase.from('organizer_sessions').delete().eq('wallet', identity.wallet);
    }

    const { error } = await supabase.from('organizer_sessions').insert({
        token_hash: tokenHash,
        email: identity.email ?? null,
        wallet: identity.wallet ?? null,
        expires_at: expiresAt.toISOString(),
        last_seen_at: new Date().toISOString(),
    });
    if (error) return { error: error.message };

    return {
        token,
        session: {
            email: identity.email,
            wallet: identity.wallet,
            exp,
        },
    };
}

export async function dbLookupSession(token: string | undefined): Promise<DbOrganizerSession | null> {
    if (!token || !isSupabaseConfigured) return null;
    // Opaque hex tokens are 64 chars; legacy signed cookies contain '.'
    if (token.includes('.')) return null;

    const tokenHash = hashToken(token);
    const { data, error } = await getSupabase()
        .from('organizer_sessions')
        .select('email, wallet, expires_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();
    if (error || !data) return null;
    const expMs = new Date(data.expires_at).getTime();
    if (expMs < Date.now()) {
        await getSupabase().from('organizer_sessions').delete().eq('token_hash', tokenHash);
        return null;
    }

    void getSupabase()
        .from('organizer_sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('token_hash', tokenHash);

    return {
        email: data.email ?? undefined,
        wallet: data.wallet ?? undefined,
        exp: Math.floor(expMs / 1000),
    };
}

export async function dbRevokeSession(token: string | undefined): Promise<void> {
    if (!token || !isSupabaseConfigured || token.includes('.')) return;
    await getSupabase().from('organizer_sessions').delete().eq('token_hash', hashToken(token));
}
