'use client';

import React, { useState } from 'react';
import {
    RainbowKitProvider,
    getDefaultConfig,
    darkTheme,
} from '@rainbow-me/rainbowkit';
import { coinbaseWallet, injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { WagmiProvider, type Config } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

declare global {
    var __gatefyWagmiConfig: Config | undefined;
}

/**
 * Singleton wagmi config.
 * Avoid listing many WalletConnect-backed wallets — each calls Core.init() and under
 * Turbopack HMR that surfaces as `unhandledRejection: undefined` / Runtime Error "undefined".
 *
 * Base EVM retained for legacy host SIWE / USDC paths only.
 * Connect Wallet UI is Stellar Freighter (ConnectWalletButton).
 */
function getWagmiConfig(): Config {
    if (globalThis.__gatefyWagmiConfig) return globalThis.__gatefyWagmiConfig;

    const config = getDefaultConfig({
        appName: 'GATE PROTOCOL',
        projectId:
            process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'da9e31959714af0c9fac3f6c827a5d3e',
        chains: [base, baseSepolia],
        ssr: true,
        wallets: [
            {
                groupName: 'Base',
                wallets: [coinbaseWallet, injectedWallet],
            },
        ],
    });

    globalThis.__gatefyWagmiConfig = config;
    return config;
}

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const [config] = useState(() => getWagmiConfig());

    return (
        <WagmiProvider config={config} reconnectOnMount={false}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    modalSize="compact"
                    coolMode={false}
                    theme={darkTheme({
                        accentColor: '#ffffff',
                        accentColorForeground: '#000000',
                        borderRadius: 'none',
                        fontStack: 'system',
                        overlayBlur: 'small',
                    })}
                >
                    {children}
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
