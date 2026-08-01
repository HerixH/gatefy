/**
 * Client-safe Stellar config (NEXT_PUBLIC_* only).
 * Shared by Freighter pay UI and payment instructions.
 */

export function clientStellarNetwork(): 'public' | 'testnet' {
    const n = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'public').trim().toLowerCase();
    return n === 'testnet' ? 'testnet' : 'public';
}

export function clientStellarHorizonUrl(): string {
    if (process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL?.trim()) {
        return process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL.trim();
    }
    return clientStellarNetwork() === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org';
}

export function clientStellarTreasury(): string {
    return (process.env.NEXT_PUBLIC_STELLAR_TREASURY || '').trim();
}

/** Circle USDC mainnet issuer; testnet default is a common test USDC issuer. */
export function clientStellarUsdcIssuer(): string {
    const override = process.env.NEXT_PUBLIC_STELLAR_USDC_ISSUER?.trim();
    if (override) return override;
    return clientStellarNetwork() === 'testnet'
        ? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLWR'
        : 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
}

export function formatStellarAmount(usdc: number): string {
    if (!Number.isFinite(usdc) || usdc <= 0) return '0';
    const s = usdc.toFixed(7);
    return s.replace(/\.?0+$/, '');
}
