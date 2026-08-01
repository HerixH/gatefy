/**
 * Stellar USDC ticket payments — verify via Horizon (no SDK required).
 * Circle USDC on Stellar Public Network (mainnet).
 */

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

/** Circle USDC issuer on Stellar Public Network */
export const STELLAR_USDC_ISSUER_MAINNET =
    process.env.STELLAR_USDC_ISSUER?.trim() ||
    'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

/** Test anchor USDC on Testnet (override with STELLAR_USDC_ISSUER for custom assets). */
export const STELLAR_USDC_ISSUER_TESTNET =
    process.env.STELLAR_USDC_ISSUER?.trim() ||
    'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLWR';

export function stellarNetwork(): 'public' | 'testnet' {
    const n = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || process.env.STELLAR_NETWORK || 'public')
        .trim()
        .toLowerCase();
    return n === 'testnet' ? 'testnet' : 'public';
}

export function stellarHorizonUrl(): string {
    if (process.env.STELLAR_HORIZON_URL?.trim()) return process.env.STELLAR_HORIZON_URL.trim();
    return stellarNetwork() === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org';
}

export function stellarTreasury(): string {
    return (
        process.env.STELLAR_TREASURY ||
        process.env.NEXT_PUBLIC_STELLAR_TREASURY ||
        ''
    ).trim();
}

export function stellarUsdcIssuer(): string {
    return stellarNetwork() === 'testnet' ? STELLAR_USDC_ISSUER_TESTNET : STELLAR_USDC_ISSUER_MAINNET;
}

/** Stellar tx hashes are 64 hex chars (no 0x). Base EVM hashes are 0x + 64 hex. */
export function looksLikeStellarTxHash(hash: string): boolean {
    return /^[a-fA-F0-9]{64}$/.test(hash.trim());
}

export function looksLikeBaseTxHash(hash: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/i.test(hash.trim());
}

type HorizonPayment = {
    type?: string;
    to?: string;
    amount?: string;
    asset_type?: string;
    asset_code?: string;
    asset_issuer?: string;
    transaction_successful?: boolean;
};

/**
 * Verify a Stellar payment (or path_payment) of USDC to the protocol treasury.
 * @param txHash Stellar transaction hash (64 hex)
 * @param minUsdc human USDC amount (e.g. 5.5)
 */
export async function verifyStellarUsdcPayment(
    txHash: string,
    minUsdc: number
): Promise<{ ok: boolean; error?: string }> {
    const hash = txHash.trim();
    if (!looksLikeStellarTxHash(hash)) {
        return { ok: false, error: 'Invalid Stellar transaction hash (expect 64 hex characters).' };
    }

    const treasury = stellarTreasury();
    if (!treasury || !/^G[A-Z0-9]{55}$/.test(treasury)) {
        return {
            ok: false,
            error: 'Stellar treasury not configured. Set NEXT_PUBLIC_STELLAR_TREASURY (G… address).',
        };
    }

    if (DEV_MODE) {
        console.log('[DEV_MODE] Skipping Stellar USDC payment verification');
        return { ok: true };
    }

    if (!Number.isFinite(minUsdc) || minUsdc <= 0) {
        return { ok: false, error: 'Invalid ticket price' };
    }

    const issuer = stellarUsdcIssuer();
    const horizon = stellarHorizonUrl();

    try {
        const res = await fetch(`${horizon}/transactions/${hash}/payments?limit=50`, {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
        });
        if (res.status === 404) {
            return { ok: false, error: 'Stellar transaction not found on Horizon' };
        }
        if (!res.ok) {
            return { ok: false, error: `Horizon error (${res.status})` };
        }
        const data = (await res.json()) as {
            _embedded?: { records?: HorizonPayment[] };
        };
        const records = data._embedded?.records ?? [];

        for (const op of records) {
            if (op.transaction_successful === false) continue;
            const typ = (op.type ?? '').toLowerCase();
            if (typ !== 'payment' && typ !== 'path_payment_strict_send' && typ !== 'path_payment_strict_receive') {
                continue;
            }
            if ((op.to ?? '').trim() !== treasury) continue;

            const code = (op.asset_code ?? '').toUpperCase();
            const assetIssuer = (op.asset_issuer ?? '').trim();
            const isUsdc =
                (op.asset_type === 'credit_alphanum4' || op.asset_type === 'credit_alphanum12') &&
                code === 'USDC' &&
                assetIssuer === issuer;

            if (!isUsdc) continue;

            const amount = parseFloat(op.amount ?? '0');
            if (Number.isFinite(amount) && amount + 1e-7 >= minUsdc) {
                return { ok: true };
            }
        }

        return {
            ok: false,
            error: `No matching USDC payment of ≥ ${minUsdc} to Stellar treasury on this transaction.`,
        };
    } catch (e) {
        console.error('verifyStellarUsdcPayment', e);
        return { ok: false, error: 'Could not verify payment on Stellar Horizon' };
    }
}

/** Public payment instructions for UI. */
export function stellarPaymentInstructions(amountUsdc: number): {
    network: 'public' | 'testnet';
    treasury: string;
    asset: string;
    amount: string;
    memoHint: string;
} {
    return {
        network: stellarNetwork(),
        treasury: stellarTreasury() || '(set NEXT_PUBLIC_STELLAR_TREASURY)',
        asset: `USDC:${stellarUsdcIssuer().slice(0, 4)}…${stellarUsdcIssuer().slice(-4)}`,
        amount: Number.isFinite(amountUsdc) ? amountUsdc.toFixed(2) : '0',
        memoHint: 'Optional: put your email in the memo so the host can match payment.',
    };
}
