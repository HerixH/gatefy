'use client';

import { useEffect, useState } from 'react';
import { connectFreighter, disconnectFreighter, freighterAvailable } from '@/lib/stellar-freighter-pay';
import { readStellarAddress } from '@/lib/stellar-session';
import { isLikelyMobileDevice } from '@/lib/stellar-walletconnect';

function shortAddr(addr: string) {
    if (addr.length < 12) return addr;
    return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

type Props = {
    className?: string;
    compact?: boolean;
    /** Full-width trigger (e.g. inside mobile menu). */
    fullWidth?: boolean;
    onStellarConnected?: (address: string) => void;
};

/** Connect / disconnect Freighter (extension on desktop, WalletConnect on mobile). */
export function ConnectWalletButton({
    className = '',
    compact = false,
    fullWidth = false,
    onStellarConnected,
}: Props) {
    const [stellar, setStellar] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mobileHint, setMobileHint] = useState(false);

    useEffect(() => {
        setStellar(readStellarAddress());
        void freighterAvailable().then((ok) => {
            setMobileHint(!ok && isLikelyMobileDevice());
        });
    }, []);

    const connectStellar = async () => {
        setBusy(true);
        setError(null);
        const r = await connectFreighter();
        setBusy(false);
        if (!r.ok) {
            setError(r.error);
            return;
        }
        setStellar(r.address);
        onStellarConnected?.(r.address);
    };

    const onDisconnect = async () => {
        setBusy(true);
        setError(null);
        await disconnectFreighter();
        setStellar(null);
        setBusy(false);
    };

    const btnClass = fullWidth
        ? 'w-full min-h-[48px] px-4 py-3 border border-white/25 bg-white text-black text-[12px] font-black tracking-[0.16em] uppercase hover:bg-neutral-200 disabled:opacity-50'
        : compact
          ? 'px-3 py-2 border border-white/25 bg-white text-black text-[9px] font-bold tracking-wide hover:bg-neutral-200 disabled:opacity-50'
          : 'px-4 py-2.5 border border-white/25 bg-white text-black text-[11px] font-bold tracking-wide hover:bg-neutral-200 disabled:opacity-50';

    const disconnectClass = fullWidth
        ? 'w-full min-h-[48px] px-4 py-3 border border-white/20 text-[12px] font-mono tracking-[0.12em] text-white/85 hover:bg-white/5 disabled:opacity-50'
        : compact
          ? 'px-3 py-2 border border-white/20 text-[9px] font-mono uppercase tracking-wider text-white/80 hover:bg-white/5 disabled:opacity-50'
          : 'px-4 py-2.5 border border-white/20 text-[11px] font-mono text-white/80 hover:bg-white/5 disabled:opacity-50';

    if (stellar) {
        return (
            <div className={`flex flex-col items-stretch gap-1 ${fullWidth ? 'w-full' : ''} ${className}`}>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDisconnect()}
                    title="Disconnect Freighter"
                    className={disconnectClass}
                >
                    {busy ? 'Disconnecting…' : `Stellar ${shortAddr(stellar)}`}
                </button>
            </div>
        );
    }

    return (
        <div className={`flex flex-col gap-1 ${fullWidth ? 'w-full' : ''} ${className}`}>
            <button
                type="button"
                disabled={busy}
                onClick={() => void connectStellar()}
                className={btnClass}
            >
                {busy ? 'Connecting…' : 'Connect Wallet'}
            </button>
            {mobileHint && !error ? (
                <p
                    className={`text-[9px] text-white/40 leading-snug ${fullWidth ? '' : 'text-right'}`}
                >
                    Opens Freighter Mobile via WalletConnect
                </p>
            ) : null}
            {error ? (
                <p className={`text-[9px] text-amber-300/90 leading-snug ${fullWidth ? '' : 'text-right'}`}>
                    {error}
                </p>
            ) : null}
        </div>
    );
}
