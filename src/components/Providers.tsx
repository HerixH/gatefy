'use client';

import React from 'react';
import {
    RainbowKitProvider,
    getDefaultConfig,
    darkTheme,
} from '@rainbow-me/rainbowkit';
import {
    baseAccount,
    coinbaseWallet,
    injectedWallet,
    metaMaskWallet,
    rainbowWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { WagmiProvider } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

// Browser + extension wallets only (no WalletConnect). WC’s session restore often opens RainbowKit’s
// reconnect / “Retry” modal on every full page reload, which feels like an unwanted pop-up.
const config = getDefaultConfig({
    appName: 'GATE PROTOCOL POAP',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'da9e31959714af0c9fac3f6c827a5d3e',
    chains: [base, baseSepolia],
    ssr: true,
    wallets: [
        {
            groupName: 'Recommended',
            wallets: [injectedWallet, baseAccount, metaMaskWallet, coinbaseWallet, rainbowWallet],
        },
    ],
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    modalSize="compact"
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
