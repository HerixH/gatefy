/** Browser cache for Freighter public key (G…). */

export const STELLAR_SESSION_KEY = 'gatefy-stellar-address';

export function readStellarAddress(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const fromLocal = localStorage.getItem(STELLAR_SESSION_KEY);
        const fromSession = sessionStorage.getItem(STELLAR_SESSION_KEY);
        const addr = (fromLocal || fromSession || '').trim();
        return /^G[A-Z0-9]{55}$/.test(addr) ? addr : null;
    } catch {
        return null;
    }
}

export function writeStellarAddress(address: string): void {
    if (typeof window === 'undefined') return;
    const addr = address.trim();
    if (!/^G[A-Z0-9]{55}$/.test(addr)) return;
    try {
        localStorage.setItem(STELLAR_SESSION_KEY, addr);
    } catch {
        /* ignore */
    }
    try {
        sessionStorage.setItem(STELLAR_SESSION_KEY, addr);
    } catch {
        /* ignore */
    }
}

export function clearStellarAddress(): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(STELLAR_SESSION_KEY);
    } catch {
        /* ignore */
    }
    try {
        sessionStorage.removeItem(STELLAR_SESSION_KEY);
    } catch {
        /* ignore */
    }
}
