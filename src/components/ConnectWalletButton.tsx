'use client';

import { useEffect, useRef, useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';
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
    /** Full-width trigger + panel (e.g. inside mobile menu). */
    fullWidth?: boolean;
    onStellarConnected?: (address: string) => void;
};

/**
 * Single “Connect Wallet” control with Base (RainbowKit) and Freighter (Stellar) inside.
 */
export function ConnectWalletButton({
    className = '',
    compact = false,
    fullWidth = false,
    onStellarConnected,
}: Props) {
    const { openConnectModal } = useConnectModal();
    const { address, isConnected } = useAccount();
    const { disconnect } = useDisconnect();
    const [open, setOpen] = useState(false);
    const [stellar, setStellar] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setStellar(readStellarAddress());
    }, []);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

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
        setOpen(false);
    };

    const disconnectStellar = () => {
        clearStellarAddress();
        setStellar(null);
        setError(null);
    };

    const label = (() => {
        if (isConnected && address && stellar) return `${shortAddr(address)} · ★`;
        if (isConnected && address) return shortAddr(address);
        if (stellar) return `★ ${shortAddr(stellar)}`;
        return 'Connect Wallet';
    })();

    const item =
        'w-full text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] hover:bg-white/8 disabled:opacity-50 transition-colors';

    return (
        <div ref={rootRef} className={`relative ${fullWidth ? 'w-full' : ''} ${className}`}>
            <button
                type="button"
                onClick={() => {
                    setOpen((v) => !v);
                    setError(null);
                }}
                className={
                    fullWidth
                        ? 'w-full min-h-[48px] px-4 py-3 border border-white/25 bg-white text-black text-[12px] font-black tracking-[0.16em] uppercase hover:bg-neutral-200'
                        : compact
                          ? 'px-3 py-2 border border-white/25 bg-white text-black text-[9px] font-bold tracking-wide hover:bg-neutral-200'
                          : 'px-4 py-2.5 border border-white/25 bg-white text-black text-[11px] font-bold tracking-wide hover:bg-neutral-200'
                }
            >
                {label}
            </button>

            {open ? (
                <div
                    className={
                        fullWidth
                            ? 'relative mt-2 z-[600] w-full border border-white/15 bg-black/95 backdrop-blur-md'
                            : 'absolute right-0 top-full mt-1 z-[600] min-w-[220px] border border-white/15 bg-black/95 backdrop-blur-md shadow-xl'
                    }
                >
                    <div className="px-3 py-2 border-b border-white/10">
                        <p className="text-[8px] uppercase tracking-[0.25em] text-white/40 font-bold">
                            Choose network wallet
                        </p>
                    </div>

                    <div className="py-1">
                        {isConnected && address ? (
                            <div className="px-3 py-2 space-y-1.5">
                                <p className="text-[9px] uppercase tracking-widest text-white/35 font-bold">
                                    Base (EVM)
                                </p>
                                <p className="text-[10px] font-mono text-white/70">{shortAddr(address)}</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        disconnect();
                                        setOpen(false);
                                    }}
                                    className={`${item} text-white/60 border border-white/10`}
                                >
                                    Disconnect Base
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    openConnectModal?.();
                                }}
                                className={`${item} text-white`}
                            >
                                Base — Coinbase, MetaMask…
                            </button>
                        )}

                        <div className="mx-3 my-1 border-t border-white/10" />

                        {stellar ? (
                            <div className="px-3 py-2 space-y-1.5">
                                <p className="text-[9px] uppercase tracking-widest text-violet-300/80 font-bold">
                                    Stellar · Freighter
                                </p>
                                <p className="text-[10px] font-mono text-white/70">{shortAddr(stellar)}</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        disconnectStellar();
                                        setOpen(false);
                                    }}
                                    className={`${item} text-white/60 border border-white/10`}
                                >
                                    Disconnect Freighter
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void connectStellar()}
                                className={`${item} text-violet-200`}
                            >
                                {busy ? 'Connecting…' : 'Stellar — Freighter'}
                            </button>
                        )}
                    </div>

                    {error ? (
                        <p className="px-3 pb-3 text-[9px] text-amber-300/90 leading-snug">{error}</p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
