'use client';

import { useEffect, useState } from 'react';
import { connectFreighter } from '@/lib/stellar-freighter-pay';
import {
    clearStellarAddress,
    readStellarAddress,
    writeStellarAddress,
} from '@/lib/stellar-session';

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

/** Connect / disconnect Freighter (Stellar only). */
export function ConnectWalletButton({
    className = '',
    compact = false,
    fullWidth = false,
    onStellarConnected,
}: Props) {
    const [stellar, setStellar] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setStellar(readStellarAddress());
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
        writeStellarAddress(r.address);
        setStellar(r.address);
        onStellarConnected?.(r.address);
    };

    const disconnectStellar = () => {
        clearStellarAddress();
        setStellar(null);
        setError(null);
    };

    const btnClass = fullWidth
        ? 'w-full min-h-[48px] px-4 py-3 border border-white/25 bg-white text-black text-[12px] font-black tracking-[0.16em] uppercase hover:bg-neutral-200 disabled:opacity-50'
        : compact
          ? 'px-3 py-2 border border-white/25 bg-white text-black text-[9px] font-bold tracking-wide hover:bg-neutral-200 disabled:opacity-50'
          : 'px-4 py-2.5 border border-white/25 bg-white text-black text-[11px] font-bold tracking-wide hover:bg-neutral-200 disabled:opacity-50';

    const disconnectClass = fullWidth
        ? 'w-full min-h-[48px] px-4 py-3 border border-white/20 text-[12px] font-mono tracking-[0.12em] text-white/85 hover:bg-white/5'
        : compact
          ? 'px-3 py-2 border border-white/20 text-[9px] font-mono uppercase tracking-wider text-white/80 hover:bg-white/5'
          : 'px-4 py-2.5 border border-white/20 text-[11px] font-mono text-white/80 hover:bg-white/5';

    if (stellar) {
        return (
            <div className={`flex flex-col items-stretch gap-1 ${fullWidth ? 'w-full' : ''} ${className}`}>
                <button
                    type="button"
                    onClick={disconnectStellar}
                    title="Disconnect Freighter"
                    className={disconnectClass}
                >
                    Stellar {shortAddr(stellar)}
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
            {error ? (
                <p className={`text-[9px] text-amber-300/90 leading-snug ${fullWidth ? '' : 'text-right'}`}>
                    {error}
                </p>
            ) : null}
        </div>
    );
}
