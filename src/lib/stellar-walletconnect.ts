'use client';

/**
 * Freighter Mobile via WalletConnect (UniversalProvider + AppKit).
 * Docs: https://docs.freighter.app/mobile-walletconnect/connecting
 */

import type UniversalProvider from '@walletconnect/universal-provider';
import { clientStellarNetwork } from '@/lib/stellar-client-config';

const FREIGHTER_WALLET_ID =
    '997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380';

const STELLAR_METHODS = [
    'stellar_signXDR',
    'stellar_signAndSubmitXDR',
    'stellar_signMessage',
    'stellar_signAuthEntry',
] as const;

type AppKitModal = {
    open: () => void;
    close: () => void;
};

let providerPromise: Promise<UniversalProvider> | null = null;
let modal: AppKitModal | null = null;

function walletConnectProjectId(): string {
    return (
        process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ||
        'da9e31959714af0c9fac3f6c827a5d3e'
    );
}

function stellarChainId(): 'stellar:pubnet' | 'stellar:testnet' {
    return clientStellarNetwork() === 'testnet' ? 'stellar:testnet' : 'stellar:pubnet';
}

function appOrigin(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return (process.env.NEXT_PUBLIC_APP_URL || 'https://www.gateprotocol.xyz').replace(/\/$/, '');
}

function parseStellarAddress(account: string | undefined): string | null {
    if (!account) return null;
    // Format: stellar:pubnet:G...
    const parts = account.split(':');
    const addr = (parts[2] || parts[parts.length - 1] || '').trim();
    return /^G[A-Z0-9]{55}$/.test(addr) ? addr : null;
}

async function ensureProvider(): Promise<{
    provider: UniversalProvider;
    modal: AppKitModal;
}> {
    if (typeof window === 'undefined') {
        throw new Error('WalletConnect is only available in the browser.');
    }

    if (!providerPromise) {
        providerPromise = (async () => {
            const { default: UniversalProviderCtor } = await import(
                '@walletconnect/universal-provider'
            );
            const { createAppKit } = await import('@reown/appkit/core');
            const { mainnet } = await import('@reown/appkit/networks');

            const provider = await UniversalProviderCtor.init({
                projectId: walletConnectProjectId(),
                metadata: {
                    name: 'GATE PROTOCOL',
                    description: 'Stellar ticket payments and attendance verification',
                    url: appOrigin(),
                    icons: [`${appOrigin()}/favicon.ico`],
                },
            });

            // AppKit may pin a different @walletconnect/universal-provider build — cast is safe at runtime.
            modal = createAppKit({
                projectId: walletConnectProjectId(),
                networks: [mainnet],
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                universalProvider: provider as any,
                manualWCControl: true,
                featuredWalletIds: [FREIGHTER_WALLET_ID],
            }) as AppKitModal;

            return provider;
        })();
    }

    const provider = await providerPromise;
    if (!modal) {
        throw new Error('WalletConnect modal failed to initialize.');
    }
    return { provider, modal };
}

export function isLikelyMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** Address from an existing WalletConnect session, if any. */
export async function readWalletConnectAddress(): Promise<string | null> {
    try {
        const { provider } = await ensureProvider();
        const session = provider.session;
        const accounts = session?.namespaces?.stellar?.accounts;
        if (!accounts?.length) return null;
        return parseStellarAddress(accounts[0]);
    } catch {
        return null;
    }
}

export async function connectWalletConnect(): Promise<
    { ok: true; address: string } | { ok: false; error: string }
> {
    try {
        const { provider, modal: m } = await ensureProvider();
        const chainId = stellarChainId();

        // Reuse session if already connected
        const existing = await readWalletConnectAddress();
        if (existing) return { ok: true, address: existing };

        m.open();
        let session;
        try {
            session = await provider.connect({
                namespaces: {
                    stellar: {
                        methods: [...STELLAR_METHODS],
                        chains: [chainId],
                        events: ['accountsChanged'],
                    },
                },
            });
        } finally {
            try {
                m.close();
            } catch {
                /* ignore */
            }
        }

        if (!session) {
            return { ok: false, error: 'WalletConnect cancelled. Open Freighter Mobile and approve.' };
        }

        const methods = session.namespaces?.stellar?.methods || [];
        if (!methods.includes('stellar_signXDR')) {
            return { ok: false, error: 'Wallet does not support Stellar signing.' };
        }

        const addr = parseStellarAddress(session.namespaces?.stellar?.accounts?.[0]);
        if (!addr) {
            return { ok: false, error: 'Connected but no Stellar address returned.' };
        }
        return { ok: true, address: addr };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'WalletConnect failed';
        if (/User rejected|rejected|denied|cancel/i.test(msg)) {
            return { ok: false, error: 'Connection cancelled in Freighter Mobile.' };
        }
        return {
            ok: false,
            error: `${msg}. Install Freighter Mobile and try again.`,
        };
    }
}

export async function signXdrWithWalletConnect(
    xdr: string
): Promise<{ ok: true; signedXdr: string } | { ok: false; error: string }> {
    try {
        const { provider } = await ensureProvider();
        if (!provider.session) {
            return { ok: false, error: 'Not connected via WalletConnect. Connect Freighter Mobile first.' };
        }
        const chainId = stellarChainId();
        const result = (await provider.request(
            {
                method: 'stellar_signXDR',
                params: { xdr },
            },
            chainId
        )) as { signedXDR?: string };

        const signed = result?.signedXDR?.trim();
        if (!signed) {
            return { ok: false, error: 'Wallet returned an empty signature.' };
        }
        return { ok: true, signedXdr: signed };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Signing failed';
        if (/User rejected|rejected|denied/i.test(msg)) {
            return { ok: false, error: 'Payment cancelled in Freighter Mobile.' };
        }
        return { ok: false, error: msg };
    }
}

export async function disconnectWalletConnect(): Promise<void> {
    try {
        if (!providerPromise) return;
        const provider = await providerPromise;
        if (provider.session) {
            await provider.disconnect();
        }
    } catch {
        /* ignore */
    }
}
