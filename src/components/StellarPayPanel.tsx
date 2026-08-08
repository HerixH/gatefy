'use client';

import { useEffect, useState } from 'react';
import {
    clientStellarNetwork,
    clientStellarTreasury,
    clientStellarUsdcIssuer,
} from '@/lib/stellar-client-config';
import { connectFreighter, freighterAvailable, payTicketUsdcWithFreighter } from '@/lib/stellar-freighter-pay';
import { readStellarAddress } from '@/lib/stellar-session';
import { isLikelyMobileDevice } from '@/lib/stellar-walletconnect';

type Props = {
    amountUsdc: number;
    /** Optional memo (e.g. email) — max 28 chars on Stellar text memo */
    memoHint?: string;
    onPaid: (txHash: string) => void;
    disabled?: boolean;
};

/**
 * Stellar USDC pay panel (wallet connect → pay → parent gets tx hash).
 * Desktop: Freighter extension. Mobile: WalletConnect → Freighter Mobile.
 */
export function StellarPayPanel({ amountUsdc, memoHint, onPaid, disabled }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [address, setAddress] = useState<string | null>(null);
    const [mobileHint, setMobileHint] = useState(false);
    const network = clientStellarNetwork();
    const treasury = clientStellarTreasury();
    const issuer = clientStellarUsdcIssuer();

    useEffect(() => {
        setAddress(readStellarAddress());
        void freighterAvailable().then((ok) => {
            setMobileHint(!ok && isLikelyMobileDevice());
        });
    }, []);

    const handleConnect = async () => {
        setError('');
        setBusy(true);
        try {
            const r = await connectFreighter();
            if (!r.ok) {
                setError(r.error);
                return;
            }
            setAddress(r.address);
        } finally {
            setBusy(false);
        }
    };

    const handlePay = async () => {
        setError('');
        setBusy(true);
        try {
            const r = await payTicketUsdcWithFreighter(amountUsdc, memoHint);
            if (!r.ok) {
                setError(r.error);
                return;
            }
            setAddress(r.address);
            onPaid(r.hash);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 border border-violet-500/25 bg-violet-500/[0.06] p-3">
            <p className="text-[8px] uppercase tracking-widest text-violet-300/90 font-black">
                Crypto rail · Stellar ({network})
            </p>
            <p className="text-[10px] text-white/55 leading-relaxed">
                Same ticket. Pay{' '}
                <span className="text-white font-bold">{amountUsdc}</span> in stablecoin on Stellar, then register.
                Hash fills in automatically.
            </p>
            {mobileHint ? (
                <p className="text-[9px] text-violet-200/70 leading-relaxed">
                    On mobile this opens Freighter via WalletConnect — approve in the Freighter app.
                </p>
            ) : null}
            <p className="text-[9px] font-mono text-white/40 break-all">
                To: {treasury || '(set NEXT_PUBLIC_STELLAR_TREASURY)'}
            </p>
            <p className="text-[8px] font-mono text-white/30 truncate" title={issuer}>
                Asset · {issuer.slice(0, 4)}…{issuer.slice(-4)}
            </p>
            {address ? (
                <p className="text-[9px] font-mono text-violet-200/80 truncate">Connected: {address}</p>
            ) : null}
            <div className="flex flex-col sm:flex-row gap-2">
                <button
                    type="button"
                    disabled={busy || disabled}
                    onClick={() => void handleConnect()}
                    className="flex-1 py-2.5 border border-violet-400/40 text-[8px] font-black uppercase tracking-widest text-violet-100 hover:bg-violet-500/20 disabled:opacity-40"
                >
                    {busy && !address
                        ? 'Connecting…'
                        : address
                          ? 'Reconnect wallet'
                          : 'Connect Stellar wallet'}
                </button>
                <button
                    type="button"
                    disabled={busy || disabled || !treasury}
                    onClick={() => void handlePay()}
                    className="flex-1 py-2.5 bg-violet-500 text-black text-[8px] font-black uppercase tracking-widest hover:bg-violet-400 disabled:opacity-40"
                >
                    {busy ? 'Waiting…' : `Pay ${amountUsdc}`}
                </button>
            </div>
            {error ? <p className="text-[9px] text-red-400 font-mono leading-relaxed">{error}</p> : null}
        </div>
    );
}
