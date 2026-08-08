/** Browser cache for Freighter / WalletConnect public key (G…). */

export const STELLAR_SESSION_KEY = 'gatefy-stellar-address';
export const STELLAR_SESSION_MODE_KEY = 'gatefy-stellar-mode';

export type StellarConnectMode = 'extension' | 'walletconnect';

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

export function readStellarConnectMode(): StellarConnectMode | null {
    if (typeof window === 'undefined') return null;
    try {
        const m = (localStorage.getItem(STELLAR_SESSION_MODE_KEY) || '').trim();
        if (m === 'extension' || m === 'walletconnect') return m;
        return readStellarAddress() ? 'extension' : null;
    } catch {
        return null;
    }
}

export function writeStellarAddress(
    address: string,
    mode: StellarConnectMode = 'extension'
): void {
    if (typeof window === 'undefined') return;
    const addr = address.trim();
    if (!/^G[A-Z0-9]{55}$/.test(addr)) return;
    try {
        localStorage.setItem(STELLAR_SESSION_KEY, addr);
        localStorage.setItem(STELLAR_SESSION_MODE_KEY, mode);
    } catch {
        /* ignore */
    }
    try {
        sessionStorage.setItem(STELLAR_SESSION_KEY, addr);
        sessionStorage.setItem(STELLAR_SESSION_MODE_KEY, mode);
    } catch {
        /* ignore */
    }
}

export function clearStellarAddress(): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(STELLAR_SESSION_KEY);
        localStorage.removeItem(STELLAR_SESSION_MODE_KEY);
    } catch {
        /* ignore */
    }
    try {
        sessionStorage.removeItem(STELLAR_SESSION_KEY);
        sessionStorage.removeItem(STELLAR_SESSION_MODE_KEY);
    } catch {
        /* ignore */
    }
}
