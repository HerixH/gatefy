'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { organizerManagedQueryString } from '@/lib/event-organizer';

const ORG_SESSION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SessionState = {
    loading: boolean;
    configured: boolean;
    authenticated: boolean;
    email: string | null;
    wallet: string | null;
};

/**
 * Verified host session (httpOnly cookie).
 * Email: request OTP → verify code.
 * Wallet: connect → sign challenge message → verify.
 */
export function useOrganizerSession(walletAddress?: string) {
    const [session, setSession] = useState<SessionState>({
        loading: true,
        configured: true,
        authenticated: false,
        email: null,
        wallet: null,
    });

    const refreshSession = useCallback(async () => {
        try {
            const res = await fetch('/api/organizer/auth/session', {
                cache: 'no-store',
                credentials: 'include',
            });
            const data = await res.json();
            setSession({
                loading: false,
                configured: data.configured !== false,
                authenticated: !!data.authenticated,
                email: typeof data.email === 'string' ? data.email : null,
                wallet: typeof data.wallet === 'string' ? data.wallet : null,
            });
        } catch {
            setSession((s) => ({ ...s, loading: false }));
        }
    }, []);

    useEffect(() => {
        refreshSession();
    }, [refreshSession]);

    const organizerSessionEmail = session.email;

    // Only verified cookie identities count as host auth (not a raw connected wallet).
    const orgCtx = useMemo(
        () => ({
            address: session.wallet ?? null,
            organizerSessionEmail,
        }),
        [session.wallet, organizerSessionEmail]
    );

    /** Signed-in when we have a verified cookie session (email and/or wallet). */
    const signedIn = session.authenticated;

    const managedQuery = useMemo(() => {
        if (!session.authenticated) return '';
        return organizerManagedQueryString({
            address: session.wallet ?? null,
            organizerSessionEmail: session.email,
        });
    }, [session.authenticated, session.wallet, session.email]);

    const requestEmailCode = useCallback(async (raw: string) => {
        const em = raw.trim().toLowerCase();
        if (!ORG_SESSION_EMAIL_RE.test(em)) {
            return { ok: false as const, error: 'Enter a valid email.' };
        }
        const res = await fetch('/api/organizer/auth/email/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: em }),
        });
        const data = await res.json();
        if (!res.ok) {
            return { ok: false as const, error: typeof data?.error === 'string' ? data.error : 'Could not send code.' };
        }
        return {
            ok: true as const,
            email: em,
            message: typeof data?.message === 'string' ? data.message : 'Code sent.',
            devCode: typeof data?.devCode === 'string' ? data.devCode : undefined,
        };
    }, []);

    const verifyEmailCode = useCallback(
        async (rawEmail: string, code: string) => {
            const em = rawEmail.trim().toLowerCase();
            const res = await fetch('/api/organizer/auth/email/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email: em, code: code.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                return { ok: false as const, error: typeof data?.error === 'string' ? data.error : 'Invalid code.' };
            }
            await refreshSession();
            return { ok: true as const, email: em };
        },
        [refreshSession]
    );

    const verifyWalletSignature = useCallback(
        async (address: string, signature: string) => {
            const res = await fetch('/api/organizer/auth/wallet/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ address, signature }),
            });
            const data = await res.json();
            if (!res.ok) {
                return {
                    ok: false as const,
                    error: typeof data?.error === 'string' ? data.error : 'Wallet verification failed.',
                };
            }
            await refreshSession();
            return { ok: true as const, wallet: address };
        },
        [refreshSession]
    );

    const requestWalletChallenge = useCallback(async (address: string) => {
        const res = await fetch('/api/organizer/auth/wallet/challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ address }),
        });
        const data = await res.json();
        if (!res.ok) {
            return {
                ok: false as const,
                error: typeof data?.error === 'string' ? data.error : 'Could not start wallet sign-in.',
            };
        }
        return {
            ok: true as const,
            message: typeof data.message === 'string' ? data.message : '',
        };
    }, []);

    const clearEmailSession = useCallback(async () => {
        await fetch('/api/organizer/auth/session', { method: 'DELETE', credentials: 'include' });
        await refreshSession();
    }, [refreshSession]);

    /** @deprecated Use requestEmailCode + verifyEmailCode. Kept as no-op false for old callers. */
    const commitEmailSession = useCallback((_raw: string) => {
        return false;
    }, []);

    return {
        organizerSessionEmail,
        sessionWallet: session.wallet,
        sessionLoading: session.loading,
        authConfigured: session.configured,
        orgCtx,
        signedIn,
        managedQuery,
        refreshSession,
        requestEmailCode,
        verifyEmailCode,
        requestWalletChallenge,
        verifyWalletSignature,
        commitEmailSession,
        clearEmailSession,
    };
}
