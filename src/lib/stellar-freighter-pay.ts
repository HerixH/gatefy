'use client';

/**
 * Freighter Connect — sign & submit USDC ticket payments on Stellar.
 * Official SCF Integration List partner: Freighter Connect (SDF).
 */

import {
    isConnected as freighterIsConnected,
    requestAccess,
    getAddress,
    signTransaction,
} from '@stellar/freighter-api';
import {
    Asset,
    Horizon,
    Memo,
    Networks,
    Operation,
    TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
    clientStellarHorizonUrl,
    clientStellarNetwork,
    clientStellarTreasury,
    clientStellarUsdcIssuer,
    formatStellarAmount,
} from '@/lib/stellar-client-config';

export type FreighterPayResult =
    | { ok: true; hash: string; address: string }
    | { ok: false; error: string };

function networkPassphrase(): string {
    return clientStellarNetwork() === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
}

/** True if Freighter extension is available in the browser. */
export async function freighterAvailable(): Promise<boolean> {
    try {
        const r = await freighterIsConnected();
        return !!r.isConnected;
    } catch {
        return false;
    }
}

/** Request Freighter access; returns public key (G…). */
export async function connectFreighter(): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
    try {
        const available = await freighterAvailable();
        if (!available) {
            return {
                ok: false,
                error: 'Install a Stellar wallet extension, then refresh this page.',
            };
        }
        const access = await requestAccess();
        if (access.error) {
            return { ok: false, error: access.error.message || 'Wallet access denied' };
        }
        const addr = (access as { address?: string }).address;
        if (addr && /^G[A-Z0-9]{55}$/.test(addr)) {
            return { ok: true, address: addr };
        }
        const ga = await getAddress();
        if (ga.error || !ga.address) {
            return { ok: false, error: ga.error?.message || 'Could not read wallet address' };
        }
        return { ok: true, address: ga.address };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Wallet connection failed';
        return { ok: false, error: msg };
    }
}

/**
 * Build a classic USDC payment, sign with Freighter, submit to Horizon.
 * @param amountUsdc human USDC amount
 * @param memo optional memo (max 28 bytes for text)
 */
export async function payTicketUsdcWithFreighter(
    amountUsdc: number,
    memo?: string
): Promise<FreighterPayResult> {
    const treasury = clientStellarTreasury();
    if (!treasury || !/^G[A-Z0-9]{55}$/.test(treasury)) {
        return {
            ok: false,
            error: 'Stellar treasury not configured (NEXT_PUBLIC_STELLAR_TREASURY).',
        };
    }
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
        return { ok: false, error: 'Invalid ticket amount' };
    }

    const connected = await connectFreighter();
    if (!connected.ok) return connected;
    const address = connected.address;

    const server = new Horizon.Server(clientStellarHorizonUrl());
    let account;
    try {
        account = await server.loadAccount(address);
    } catch {
        return {
            ok: false,
            error:
                clientStellarNetwork() === 'testnet'
                    ? 'Account not found on Testnet. Fund it via Friendbot first.'
                    : 'Stellar account not found or not funded on Public Network.',
        };
    }

    const usdc = new Asset('USDC', clientStellarUsdcIssuer());
    const amount = formatStellarAmount(amountUsdc);
    const builder = new TransactionBuilder(account, {
        fee: '100000',
        networkPassphrase: networkPassphrase(),
    }).addOperation(
        Operation.payment({
            destination: treasury,
            asset: usdc,
            amount,
        })
    );

    const memoText = (memo ?? '').trim().slice(0, 28);
    if (memoText) builder.addMemo(Memo.text(memoText));

    const tx = builder.setTimeout(180).build();

    try {
        const signed = await signTransaction(tx.toXDR(), {
            networkPassphrase: networkPassphrase(),
            address,
        });
        if (signed.error) {
            return { ok: false, error: signed.error.message || 'Wallet declined to sign' };
        }
        const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, networkPassphrase());
        const result = await server.submitTransaction(signedTx);
        const hash = (result as { hash?: string }).hash;
        if (!hash || !/^[a-fA-F0-9]{64}$/.test(hash)) {
            return { ok: false, error: 'Payment submitted but hash missing from Horizon response' };
        }
        return { ok: true, hash, address };
    } catch (e: unknown) {
        const anyErr = e as { response?: { data?: { extras?: { result_codes?: unknown } } }; message?: string };
        const codes = anyErr?.response?.data?.extras?.result_codes;
        if (codes) {
            return { ok: false, error: `Stellar rejected payment: ${JSON.stringify(codes)}` };
        }
        const msg = e instanceof Error ? e.message : 'Payment failed';
        if (/User declined|rejected|denied/i.test(msg)) {
            return { ok: false, error: 'Payment cancelled in wallet' };
        }
        return { ok: false, error: msg };
    }
}
