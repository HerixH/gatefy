'use client';

import React from 'react';
import {
    RainbowKitProvider,
    getDefaultConfig,
    darkTheme,
} from '@rainbow-me/rainbowkit';
import { coinbaseWallet } from '@rainbow-me/rainbowkit/wallets';
import { WagmiProvider } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

// Only Coinbase / Base wallet for EVM. Freighter (Stellar) is handled separately in ConnectWalletButton.
// No MetaMask, Rainbow, WalletConnect, or injected multi-wallet list.
const config = getDefaultConfig({
    appName: 'GATE PROTOCOL',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'da9e31959714af0c9fac3f6c827a5d3e',
    chains: [base, baseSepolia],
    ssr: true,
    wallets: [
        {
            groupName: 'Base',
            wallets: [coinbaseWallet],
        },
    ],
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        // No auto-reconnect on reload — connect only when the user chooses Base or Freighter.
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
