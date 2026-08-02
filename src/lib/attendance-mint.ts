/**
 * Mint attendance proof after successful door verify.
 * Chains: Soroban (Stellar) and/or Base ERC-721 (GatefyPOAP).
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
import { createPublicClient, createWalletClient, http, type Hex, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { clientStellarNetwork } from '@/lib/stellar-client-config';
import { GATEFY_POAP_ABI } from '@/lib/gatefy-poap-abi';

export type MintChain = 'soroban' | 'base' | 'both' | 'off';

export type MintOk = {
    ok: true;
    chain: 'soroban' | 'base' | 'both';
    txHash: string;
    tokenId: string;
    explorerUrl: string;
    /** When chain=both and the other leg also succeeded. */
    also?: {
        chain: 'soroban' | 'base';
        txHash: string;
        tokenId: string;
        explorerUrl: string;
    };
};

export type MintResult =
    | MintOk
    | {
          ok: false;
          chain: MintChain;
          status: 'skipped' | 'failed' | 'not_configured';
          error: string;
      };

export function attendanceMintChain(): MintChain {
    const raw = (process.env.ATTENDANCE_MINT_CHAIN || 'soroban').trim().toLowerCase();
    if (raw === 'off' || raw === 'false' || raw === '0') return 'off';
    if (raw === 'base') return 'base';
    if (raw === 'both' || raw === 'all') return 'both';
    return 'soroban';
}

export function mintWantsSoroban(chain = attendanceMintChain()): boolean {
    return chain === 'soroban' || chain === 'both';
}

export function mintWantsBase(chain = attendanceMintChain()): boolean {
    return chain === 'base' || chain === 'both';
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

export function stellarExplorerTxUrl(txHash: string): string {
    const net = clientStellarNetwork() === 'testnet' ? 'testnet' : 'public';
    return `https://stellar.expert/explorer/${net}/tx/${txHash}`;
}

function baseChain(): Chain {
    const raw = (process.env.NEXT_PUBLIC_BASE_CHAIN || process.env.BASE_CHAIN || 'baseSepolia')
        .trim()
        .toLowerCase();
    if (raw === 'base' || raw === 'mainnet') return base;
    return baseSepolia;
}

function baseExplorerTxUrl(txHash: string): string {
    const c = baseChain();
    if (c.id === base.id) return `https://basescan.org/tx/${txHash}`;
    return `https://sepolia.basescan.org/tx/${txHash}`;
}

function baseRpcUrl(): string {
    if (process.env.BASE_RPC_URL?.trim()) return process.env.BASE_RPC_URL.trim();
    return baseChain().id === base.id ? 'https://mainnet.base.org' : 'https://sepolia.base.org';
}

function isStellarAddress(addr: string): boolean {
    return /^G[A-Z0-9]{55}$/.test(addr.trim());
}

function isEvmAddress(addr: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
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
            error: 'Connect Freighter before mint so we can mint your Stellar proof.',
        };
    }

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
            explorerUrl: stellarExplorerTxUrl(fake),
        };
    }

    if (!contractId || !secret) {
        return {
            ok: false,
            chain: 'soroban',
            status: 'not_configured',
            error:
                'Set SOROBAN_CONTRACT_ID and STELLAR_MINTER_SECRET to mint on Stellar. See contracts/soroban/README.md',
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
            explorerUrl: stellarExplorerTxUrl(hash),
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

async function mintOnBase(params: {
    eventId: string;
    evmWallet: string;
}): Promise<MintResult> {
    const contractId = (
        process.env.BASE_POAP_CONTRACT_ID ||
        process.env.NEXT_PUBLIC_BASE_POAP_CONTRACT_ID ||
        ''
    ).trim() as Hex | '';
    const secret = (
        process.env.BASE_MINTER_PRIVATE_KEY ||
        process.env.PRIVATE_KEY ||
        ''
    ).trim();

    if (!isEvmAddress(params.evmWallet)) {
        return {
            ok: false,
            chain: 'base',
            status: 'skipped',
            error: 'Connect a Base wallet before mint so we can mint your Base proof.',
        };
    }

    if (
        process.env.NEXT_PUBLIC_DEV_MODE === 'true' &&
        (!contractId || !secret || secret === 'DEV')
    ) {
        const fake = `0xbase${Date.now().toString(16).padStart(56, '0')}`;
        return {
            ok: true,
            chain: 'base',
            txHash: fake,
            tokenId: String(Date.now() % 1_000_000),
            explorerUrl: baseExplorerTxUrl(fake),
        };
    }

    if (!contractId || !/^0x[a-fA-F0-9]{40}$/.test(contractId)) {
        return {
            ok: false,
            chain: 'base',
            status: 'not_configured',
            error:
                'Set BASE_POAP_CONTRACT_ID (deploy contracts/GatefyPOAP.sol) to mint on Base.',
        };
    }
    if (!secret || secret === 'DEV') {
        return {
            ok: false,
            chain: 'base',
            status: 'not_configured',
            error: 'Set BASE_MINTER_PRIVATE_KEY for the contract minter / owner.',
        };
    }

    try {
        const pk = (secret.startsWith('0x') ? secret : `0x${secret}`) as Hex;
        const account = privateKeyToAccount(pk);
        const chain = baseChain();
        const transport = http(baseRpcUrl());
        const wallet = createWalletClient({ account, chain, transport });
        const publicClient = createPublicClient({ chain, transport });

        const hash = await wallet.writeContract({
            address: contractId as Hex,
            abi: GATEFY_POAP_ABI,
            functionName: 'mintAttendance',
            args: [params.evmWallet.trim() as Hex, params.eventId.slice(0, 128)],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        if (receipt.status !== 'success') {
            return {
                ok: false,
                chain: 'base',
                status: 'failed',
                error: 'Base mint transaction reverted',
            };
        }

        let tokenId = '1';
        for (const log of receipt.logs) {
            try {
                // AttendanceMinted(to indexed, tokenId indexed, eventId)
                if (log.topics[2]) {
                    tokenId = BigInt(log.topics[2]).toString();
                    break;
                }
            } catch {
                /* ignore */
            }
        }

        return {
            ok: true,
            chain: 'base',
            txHash: hash,
            tokenId,
            explorerUrl: baseExplorerTxUrl(hash),
        };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Base mint failed';
        return {
            ok: false,
            chain: 'base',
            status: 'failed',
            error: msg.length > 240 ? `${msg.slice(0, 240)}…` : msg,
        };
    }
}

/**
 * After a new check-in (or retry), mint attendance proof on configured chain(s).
 */
export async function mintAttendanceProof(params: {
    eventId: string;
    stellarAddress?: string | null;
    evmWallet?: string | null;
}): Promise<MintResult> {
    const chain = attendanceMintChain();
    const eventId = params.eventId.trim().toLowerCase();
    const stellarAddress = (params.stellarAddress || '').trim();
    const evmWallet = (params.evmWallet || '').trim();

    if (chain === 'off') {
        return {
            ok: false,
            chain: 'off',
            status: 'skipped',
            error: 'Attendance minting is disabled (ATTENDANCE_MINT_CHAIN=off).',
        };
    }

    if (chain === 'soroban') {
        return mintOnSoroban({ eventId, stellarAddress });
    }

    if (chain === 'base') {
        return mintOnBase({ eventId, evmWallet });
    }

    // both — try available wallets; succeed if either mints
    const soroban = await mintOnSoroban({ eventId, stellarAddress });
    const baseMint = await mintOnBase({ eventId, evmWallet });

    if (soroban.ok && baseMint.ok) {
        return {
            ok: true,
            chain: 'both',
            txHash: soroban.txHash,
            tokenId: soroban.tokenId,
            explorerUrl: soroban.explorerUrl,
            also: {
                chain: 'base',
                txHash: baseMint.txHash,
                tokenId: baseMint.tokenId,
                explorerUrl: baseMint.explorerUrl,
            },
        };
    }
    if (soroban.ok) return soroban;
    if (baseMint.ok) return baseMint;

    // Prefer a useful error (wallet missing vs failed)
    const err =
        (!isStellarAddress(stellarAddress) && !isEvmAddress(evmWallet)
            ? 'Connect Freighter and/or a Base wallet to mint your proof.'
            : null) ||
        (soroban.ok === false ? soroban.error : null) ||
        (baseMint.ok === false ? baseMint.error : null) ||
        'Mint failed on Stellar and Base.';

    return {
        ok: false,
        chain: 'both',
        status: 'failed',
        error: err,
    };
}

/** Explorer URL helper for persisted rows (client/API). */
export function explorerUrlForMint(chain: string | null | undefined, txHash: string | null | undefined): string | null {
    if (!txHash) return null;
    const c = (chain || '').toLowerCase();
    if (c === 'base') return baseExplorerTxUrl(txHash);
    if (c === 'both' || c === 'soroban' || !c) {
        if (txHash.startsWith('0x')) return baseExplorerTxUrl(txHash);
        return stellarExplorerTxUrl(txHash);
    }
    return stellarExplorerTxUrl(txHash);
}
