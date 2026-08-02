'use client';

import { useState } from 'react';

type Props = {
    eventId: string;
    email: string;
    name: string;
    wallet?: string | null;
    amountUsdc: number;
    disabled?: boolean;
};

/**
 * Starts a Stepay checkout (mobile money → USDC). Docs: https://stepay.pro/developers
 */
export function StepayPayButton({ eventId, email, name, wallet, amountUsdc, disabled }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const startCheckout = async () => {
        setError('');
        setBusy(true);
        try {
            const res = await fetch('/api/payments/stepay/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId,
                    email: email.trim(),
                    name: name.trim(),
                    ...(wallet ? { wallet } : {}),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(typeof data.error === 'string' ? data.error : 'Could not start Stepay checkout.');
                return;
            }
            const url = typeof data.checkoutUrl === 'string' ? data.checkoutUrl : '';
            if (!url) {
                setError('Stepay did not return a checkout URL.');
                return;
            }
            // Persist identity so return redirect can show "registered" before/without webhook race.
            try {
                const pending = {
                    email: email.trim().toLowerCase(),
                    name: name.trim(),
                    eventId,
                    at: Date.now(),
                };
                sessionStorage.setItem(`gatefy-stepay-pending-${eventId}`, JSON.stringify(pending));
                localStorage.setItem(
                    `gatefy-reg-${eventId}`,
                    JSON.stringify({ email: pending.email, name: pending.name })
                );
                sessionStorage.setItem(
                    `gatefy-reg-${eventId}`,
                    JSON.stringify({ email: pending.email, name: pending.name })
                );
            } catch {
                /* ignore */
            }
            window.location.href = url;
        } catch {
            setError('Network error starting Stepay.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2 border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
            <p className="text-[8px] uppercase tracking-widest text-emerald-300/90 font-black">
                Pay with Stepay
            </p>
            <p className="text-[10px] text-white/55 leading-relaxed">
                Pay{' '}
                <span className="text-white font-bold">{amountUsdc} USDC</span> in-app via{' '}
                <a
                    href="https://stepay.pro/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-300/90 underline underline-offset-2"
                >
                    Stepay
                </a>
                — mobile money top-up or Stepay wallet. You return here after payment; registration
                completes automatically.
            </p>
            {error ? (
                <p className="text-[9px] text-red-400 font-bold uppercase tracking-widest">{error}</p>
            ) : null}
            <button
                type="button"
                disabled={disabled || busy || !email.trim() || !name.trim()}
                onClick={() => void startCheckout()}
                className="w-full py-3 bg-emerald-400 text-black text-[9px] font-black uppercase tracking-widest hover:bg-emerald-300 disabled:opacity-50"
            >
                {busy ? 'Opening Stepay…' : `Pay ${amountUsdc} USDC with Stepay`}
            </button>
        </div>
    );
}
