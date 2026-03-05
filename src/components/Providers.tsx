'use client';

import React from 'react';
import {
    RainbowKitProvider,
    getDefaultConfig,
    darkTheme,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider, cookieStorage, createStorage, cookieToInitialState } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

const config = getDefaultConfig({
    appName: 'Gatefy POAP',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'da9e31959714af0c9fac3f6c827a5d3e', // Default demo ID
    chains: [base, baseSepolia],
    ssr: true,
    storage: createStorage({
        storage: cookieStorage,
    }),
});

const queryClient = new QueryClient();

export function Providers({ children, cookie }: { children: React.ReactNode; cookie?: string | null }) {
    const initialState = cookie ? cookieToInitialState(config, cookie) : undefined;

    return (
        <WagmiProvider config={config} initialState={initialState}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    theme={darkTheme({
                        accentColor: '#ffffff',
                        accentColorForeground: '#000000',
                        borderRadius: 'none',
                        fontStack: 'system',
                        overlayBlur: 'large',
                    })}
                >
                    {children}
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
