/**
 * Mint attendance proof after successful door verify.
 * Primary chain: Soroban (Stellar). Base ERC-721 reserved for later.
 */

import {
    Address,
    BASE_FEE,
    Contract,
    Keypair,
    nativeToScVal,
    Networks,
    TransactionBuilder,
    xdr,
} from '@stellar/stellar-sdk';
import { Api, Server as SorobanServer } from '@stellar/stellar-sdk/rpc';
import { clientStellarNetwork } from '@/lib/stellar-client-config';

export type MintChain = 'soroban' | 'base' | 'off';

export type MintResult =
    | {
          ok: true;
          chain: 'soroban';
          txHash: string;
          tokenId: string;
          explorerUrl: string;
      }
    | {
          ok: false;
          chain: MintChain;
          status: 'skipped' | 'failed' | 'not_configured' | 'base_later';
          error: string;
      };

export function attendanceMintChain(): MintChain {
    const raw = (process.env.ATTENDANCE_MINT_CHAIN || 'soroban').trim().toLowerCase();
    if (raw === 'off' || raw === 'false' || raw === '0') return 'off';
    if (raw === 'base') return 'base';
    return 'soroban';
}

function sorobanRpcUrl(): string {
    if (process.env.SOROBAN_RPC_URL?.trim()) return process.env.SOROBAN_RPC_URL.trim();
    return clientStellarNetwork() === 'testnet'
        ? 'https://soroban-testnet.stellar.org'
        : 'https://mainnet.sorobanrpc.com';
}

function networkPassphrase(): string {
    return clientStellarNetwork() === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
}

function explorerTxUrl(txHash: string): string {
    const net = clientStellarNetwork() === 'testnet' ? 'testnet' : 'public';
    return `https://stellar.expert/explorer/${net}/tx/${txHash}`;
}

function isStellarAddress(addr: string): boolean {
    return /^G[A-Z0-9]{55}$/.test(addr.trim());
}

async function waitForTx(server: SorobanServer, hash: string, attempts = 30): Promise<string> {
    for (let i = 0; i < attempts; i++) {
        const r = await server.getTransaction(hash);
        if (r.status === Api.GetTransactionStatus.SUCCESS) {
            return hash;
        }
        if (r.status === Api.GetTransactionStatus.FAILED) {
            throw new Error('Soroban mint transaction failed');
        }
        await new Promise((res) => setTimeout(res, 1000));
    }
    throw new Error('Timed out waiting for Soroban mint confirmation');
}

function extractTokenId(meta: xdr.TransactionMeta | undefined): string {
    try {
        if (!meta || meta.switch() !== 3) return '';
        const v3 = meta.v3();
        const sorobanMeta = v3.sorobanMeta();
        if (!sorobanMeta) return '';
        const ret = sorobanMeta.returnValue();
        if (ret.switch().name === 'scvU64') {
            return ret.u64().toString();
        }
    } catch {
        /* ignore */
    }
    return '';
}

async function mintOnSoroban(params: {
    eventId: string;
    stellarAddress: string;
}): Promise<MintResult> {
    const contractId = (process.env.SOROBAN_CONTRACT_ID || '').trim();
    const secret = (process.env.STELLAR_MINTER_SECRET || '').trim();

    if (!isStellarAddress(params.stellarAddress)) {
        return {
            ok: false,
            chain: 'soroban',
            status: 'skipped',
            error: 'Connect a Stellar wallet (Freighter) before verify so we can mint your proof.',
        };
    }

    // Local/demo: simulate mint when contract env is missing or secret is DEV
    if (
        process.env.NEXT_PUBLIC_DEV_MODE === 'true' &&
        (!contractId || !secret || secret === 'DEV')
    ) {
        const fake = `soroban-dev-${Date.now().toString(16)}`;
        return {
            ok: true,
            chain: 'soroban',
            txHash: fake,
            tokenId: String(Date.now() % 1_000_000),
            explorerUrl: explorerTxUrl(fake),
        };
    }

    if (!contractId || !secret) {
        return {
            ok: false,
            chain: 'soroban',
            status: 'not_configured',
            error:
                'Set SOROBAN_CONTRACT_ID and STELLAR_MINTER_SECRET to mint on verify. See contracts/soroban/README.md',
        };
    }

    try {
        const keypair = Keypair.fromSecret(secret);
        const server = new SorobanServer(sorobanRpcUrl());
        const account = await server.getAccount(keypair.publicKey());
        const contract = new Contract(contractId);
        const attendee = Address.fromString(params.stellarAddress.trim());

        const tx = new TransactionBuilder(account, {
            fee: BASE_FEE,
            networkPassphrase: networkPassphrase(),
        })
            .addOperation(
                contract.call(
                    'mint',
                    attendee.toScVal(),
                    nativeToScVal(params.eventId.slice(0, 64), { type: 'string' })
                )
            )
            .setTimeout(60)
            .build();

        const prepared = await server.prepareTransaction(tx);
        prepared.sign(keypair);
        const sent = await server.sendTransaction(prepared);

        if (sent.status === 'ERROR' || !sent.hash) {
            return {
                ok: false,
                chain: 'soroban',
                status: 'failed',
                error: sent.errorResult?.toXDR('base64') || 'Soroban submit rejected',
            };
        }

        const hash = await waitForTx(server, sent.hash);
        const got = await server.getTransaction(hash);
        const tokenId =
            got.status === Api.GetTransactionStatus.SUCCESS
                ? extractTokenId(got.resultMetaXdr) || '1'
                : '1';

        return {
            ok: true,
            chain: 'soroban',
            txHash: hash,
            tokenId,
            explorerUrl: explorerTxUrl(hash),
        };
    } catch (e) {
        return {
            ok: false,
            chain: 'soroban',
            status: 'failed',
            error: e instanceof Error ? e.message : 'Soroban mint failed',
        };
    }
}

/**
 * After a new check-in, mint the attendance proof.
 * Base path is intentionally stubbed — Soroban first.
 */
export async function mintAttendanceProof(params: {
    eventId: string;
    stellarAddress?: string | null;
    /** EVM wallet — ignored until Base adapter ships */
    evmWallet?: string | null;
}): Promise<MintResult> {
    const chain = attendanceMintChain();

    if (chain === 'off') {
        return {
            ok: false,
            chain: 'off',
            status: 'skipped',
            error: 'Attendance minting is disabled (ATTENDANCE_MINT_CHAIN=off).',
        };
    }

    if (chain === 'base') {
        return {
            ok: false,
            chain: 'base',
            status: 'base_later',
            error: 'Base mint is not wired yet. Use ATTENDANCE_MINT_CHAIN=soroban.',
        };
    }

    return mintOnSoroban({
        eventId: params.eventId,
        stellarAddress: (params.stellarAddress || '').trim(),
    });
}
