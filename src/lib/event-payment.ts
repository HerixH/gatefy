/**
 * Ticket payment rules shared by API and UI. No Node/fs — safe for client bundles.
 */

export type TicketPaymentFields = {
    isBlockchain?: boolean;
    ticketPriceUsdc?: number;
    ticketAcceptUsdc?: boolean;
    ticketAcceptMobileMoney?: boolean;
    /** USDC on Stellar (Horizon-verified). Opt-in; default off for existing events. */
    ticketAcceptStellar?: boolean;
};

export function eventAcceptsUsdc(ev: Pick<TicketPaymentFields, 'ticketAcceptUsdc'>): boolean {
    return ev.ticketAcceptUsdc !== false;
}

export function eventAcceptsMobileMoney(ev: Pick<TicketPaymentFields, 'ticketAcceptMobileMoney'>): boolean {
    return ev.ticketAcceptMobileMoney !== false;
}

export function eventAcceptsStellar(ev: Pick<TicketPaymentFields, 'ticketAcceptStellar'>): boolean {
    return ev.ticketAcceptStellar === true;
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
    const stellarOk = event.ticketAcceptStellar === true;
    if (!usdcOk && !mobOk && !stellarOk) {
        return {
            ok: false,
            error: 'Paid events must accept at least one payment method (crypto on Base, crypto on Stellar, or mobile money).',
        };
    }
    const bc = event.isBlockchain !== false;
    if (bc && !usdcOk && !stellarOk) {
        return {
            ok: false,
            error:
                'Wallet-based paid tickets need crypto on Base and/or Stellar. Enable one of those rails or set the ticket free.',
        };
    }
    if (!bc && !mobOk && !stellarOk) {
        return {
            ok: false,
            error:
                'Email-only paid tickets need mobile money and/or Stellar crypto. Enable a payment rail or choose a free ticket.',
        };
    }
    return { ok: true };
}

/** Human-readable ticket price + accepted rails (for organizer/admin UI). */
export function formatEventTicketSummary(
    ev: Pick<
        TicketPaymentFields,
        'ticketPriceUsdc' | 'isBlockchain' | 'ticketAcceptUsdc' | 'ticketAcceptMobileMoney' | 'ticketAcceptStellar'
    >
): string {
    const price = ev.ticketPriceUsdc ?? 0;
    if (!(Number.isFinite(price) && price > 0)) return 'Free';
    const rails: string[] = [];
    if (ev.isBlockchain !== false && eventAcceptsUsdc(ev)) rails.push('Base');
    if (eventAcceptsStellar(ev)) rails.push('Stellar');
    if (eventAcceptsMobileMoney(ev)) rails.push('Mobile');
    return rails.length ? `Ticket ${price} · ${rails.join(' · ')}` : `Ticket ${price}`;
}

export function isPaidRegistration(status?: string | null): boolean {
    const st = (status ?? '').trim().toLowerCase();
    return st === 'paid_crypto' || st === 'paid_mobile' || st === 'paid_stellar';
}

export function isPendingMobileRegistration(status?: string | null): boolean {
    return (status ?? '').trim().toLowerCase() === 'pending_mobile';
}

export function registrationPaymentLabel(status?: string | null): string {
    const st = (status ?? '').trim().toLowerCase();
    if (st === 'paid_crypto') return 'Crypto (Base)';
    if (st === 'paid_stellar') return 'Crypto (Stellar)';
    if (st === 'paid_mobile') return 'Mobile money';
    if (st === 'pending_mobile') return 'Mobile money (awaiting host)';
    if (st === 'rejected_mobile') return 'Mobile money rejected';
    if (st && st !== 'none') return st;
    return 'Unpaid';
}
