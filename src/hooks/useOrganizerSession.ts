'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

const ORG_SESSION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useOrganizerSession(walletAddress?: string) {
    const [organizerSessionEmail, setOrganizerSessionEmail] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setOrganizerSessionEmail(sessionStorage.getItem('gatefy-organizer-email'));
    }, []);

    const signedIn = !!(walletAddress?.trim()) || !!organizerSessionEmail;

    const managedQuery = useMemo(() => {
        if (walletAddress) return `organizerWallet=${encodeURIComponent(walletAddress)}`;
        if (organizerSessionEmail) return `organizerEmail=${encodeURIComponent(organizerSessionEmail)}`;
        return '';
    }, [walletAddress, organizerSessionEmail]);

    const listAuthSuffix = useMemo(() => {
        if (walletAddress) return `&organizerWallet=${encodeURIComponent(walletAddress)}`;
        if (organizerSessionEmail) return `&organizerEmail=${encodeURIComponent(organizerSessionEmail)}`;
        return '';
    }, [walletAddress, organizerSessionEmail]);

    const commitEmailSession = useCallback((raw: string) => {
        const em = raw.trim().toLowerCase();
        if (!ORG_SESSION_EMAIL_RE.test(em)) return false;
        try {
            sessionStorage.setItem('gatefy-organizer-email', em);
        } catch {
            return false;
        }
        setOrganizerSessionEmail(em);
        return true;
    }, []);

    const clearEmailSession = useCallback(() => {
        try {
            sessionStorage.removeItem('gatefy-organizer-email');
        } catch {
            /* ignore */
        }
        setOrganizerSessionEmail(null);
    }, []);

    return {
        organizerSessionEmail,
        signedIn,
        managedQuery,
        listAuthSuffix,
        commitEmailSession,
        clearEmailSession,
    };
}
