/**
 * Ticket payment rules shared by API and UI. No Node/fs — safe for client bundles.
 */

export type TicketPaymentFields = {
    isBlockchain?: boolean;
    ticketPriceUsdc?: number;
    ticketAcceptUsdc?: boolean;
    ticketAcceptMobileMoney?: boolean;
};

export function eventAcceptsUsdc(ev: Pick<TicketPaymentFields, 'ticketAcceptUsdc'>): boolean {
    return ev.ticketAcceptUsdc !== false;
}

export function eventAcceptsMobileMoney(ev: Pick<TicketPaymentFields, 'ticketAcceptMobileMoney'>): boolean {
    return ev.ticketAcceptMobileMoney !== false;
}

export function validateEventPaymentConfig(
    event: Partial<TicketPaymentFields> & Pick<TicketPaymentFields, 'isBlockchain'>
):
    | { ok: true }
    | { ok: false; error: string } {
    const price = event.ticketPriceUsdc != null && event.ticketPriceUsdc > 0 ? Number(event.ticketPriceUsdc) : 0;
    if (!(Number.isFinite(price) && price > 0)) return { ok: true };

    const usdcOk = event.ticketAcceptUsdc !== false;
    const mobOk = event.ticketAcceptMobileMoney !== false;
    if (!usdcOk && !mobOk) {
        return { ok: false, error: 'Paid events must accept at least one payment method (USDC or mobile money).' };
    }
    const bc = event.isBlockchain !== false;
    if (bc && !usdcOk) {
        return {
            ok: false,
            error: 'Wallet-based events use USDC on Base for paid tickets. Enable “USDC on Base” or set the ticket price to free.',
        };
    }
    if (!bc && !mobOk) {
        return {
            ok: false,
            error: 'Email-only paid tickets need mobile money. Enable mobile money payments or choose a free ticket.',
        };
    }
    return { ok: true };
}

/** Human-readable ticket price + accepted rails (for organizer/admin UI). */
export function formatEventTicketSummary(
    ev: Pick<TicketPaymentFields, 'ticketPriceUsdc' | 'isBlockchain' | 'ticketAcceptUsdc' | 'ticketAcceptMobileMoney'>
): string {
    const price = ev.ticketPriceUsdc ?? 0;
    if (!(Number.isFinite(price) && price > 0)) return 'Free';
    const rails: string[] = [];
    if (ev.isBlockchain !== false && eventAcceptsUsdc(ev)) rails.push('USDC');
    if (eventAcceptsMobileMoney(ev)) rails.push('Mobile');
    return rails.length ? `${price} USDC · ${rails.join(' · ')}` : `${price} USDC`;
}

export function isPaidRegistration(status?: string | null): boolean {
    const st = (status ?? '').trim().toLowerCase();
    return st === 'paid_crypto' || st === 'paid_mobile';
}

export function registrationPaymentLabel(status?: string | null): string {
    const st = (status ?? '').trim().toLowerCase();
    if (st === 'paid_crypto') return 'USDC (on-chain)';
    if (st === 'paid_mobile') return 'Mobile money ref';
    if (st && st !== 'none') return st;
    return 'Unpaid';
}
