'use client';

import { useEffect, useState } from 'react';
import { connectFreighter, disconnectFreighter } from '@/lib/stellar-freighter-pay';
import { readStellarAddress } from '@/lib/stellar-session';

function shortAddr(addr: string) {
    if (addr.length < 12) return addr;
    return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

type Props = {
    className?: string;
    /** Compact for header / scanner */
    compact?: boolean;
    onConnected?: (address: string) => void;
};

export function ConnectStellarButton({ className = '', compact = false, onConnected }: Props) {
    const [address, setAddress] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setAddress(readStellarAddress());
    }, []);

    const connect = async () => {
        setBusy(true);
        setError(null);
        const r = await connectFreighter();
        setBusy(false);
        if (!r.ok) {
            setError(r.error);
            return;
        }
        setAddress(r.address);
        onConnected?.(r.address);
    };

    const disconnect = async () => {
        setBusy(true);
        await disconnectFreighter();
        setAddress(null);
        setError(null);
        setBusy(false);
    };

    if (address) {
        return (
            <div className={`flex flex-col items-stretch gap-1 ${className}`}>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void disconnect()}
                    title="Disconnect Freighter"
                    className={
                        compact
                            ? 'px-3 py-2 border border-white/20 text-[9px] font-mono uppercase tracking-wider text-white/80 hover:bg-white/5 disabled:opacity-50'
                            : 'w-full py-3 border border-white/20 text-[10px] font-mono uppercase tracking-[0.2em] text-white/80 hover:bg-white/5 disabled:opacity-50'
                    }
                >
                    {busy ? 'Disconnecting…' : `Stellar ${shortAddr(address)}`}
                </button>
            </div>
        );
    }

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            <button
                type="button"
                disabled={busy}
                onClick={() => void connect()}
                className={
                    compact
                        ? 'px-3 py-2 border border-white/25 bg-white text-black text-[9px] font-bold uppercase tracking-wider hover:bg-neutral-200 disabled:opacity-50'
                        : 'w-full py-3 border border-white/25 bg-white text-black text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-neutral-200 disabled:opacity-50'
                }
            >
                {busy ? 'Connecting…' : 'Connect Freighter'}
            </button>
            {error ? (
                <p className="text-[9px] text-amber-300/90 text-center leading-snug">{error}</p>
            ) : null}
        </div>
    );
}
