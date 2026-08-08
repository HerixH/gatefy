/**
 * Ticket payment rules shared by API and UI. No Node/fs — safe for client bundles.
 * Rails: Stellar USDC only for now (Stepay + mobile money + Base checkout hidden).
 */

export type TicketPaymentFields = {
    isBlockchain?: boolean;
    ticketPriceUsdc?: number;
    ticketAcceptUsdc?: boolean;
    /** @deprecated Mobile money removed — ignored. */
    ticketAcceptMobileMoney?: boolean;
    /** USDC on Stellar (Horizon-verified). */
    ticketAcceptStellar?: boolean;
    /** @deprecated Stepay checkout hidden for now — ignored. */
    ticketAcceptStepay?: boolean;
};

export function eventAcceptsUsdc(ev: Pick<TicketPaymentFields, 'ticketAcceptUsdc'>): boolean {
    return ev.ticketAcceptUsdc !== false;
}

/** Always false — mobile money rail removed. */
export function eventAcceptsMobileMoney(
    _ev: Pick<TicketPaymentFields, 'ticketAcceptMobileMoney'>
): boolean {
    return false;
}

export function eventAcceptsStellar(ev: Pick<TicketPaymentFields, 'ticketAcceptStellar'>): boolean {
    return ev.ticketAcceptStellar === true;
}

/** Always false — Stepay checkout hidden for now; Stellar only. */
export function eventAcceptsStepay(_ev: Pick<TicketPaymentFields, 'ticketAcceptStepay'>): boolean {
    return false;
}

export function validateEventPaymentConfig(
    event: Partial<TicketPaymentFields> & Pick<TicketPaymentFields, 'isBlockchain'>
):
    | { ok: true }
    | { ok: false; error: string } {
    const price = event.ticketPriceUsdc != null && event.ticketPriceUsdc > 0 ? Number(event.ticketPriceUsdc) : 0;
    if (!(Number.isFinite(price) && price > 0)) return { ok: true };

    const stellarOk = event.ticketAcceptStellar === true;
    if (!stellarOk) {
        return {
            ok: false,
            error: 'Paid events must enable Stellar checkout (USDC on Stellar).',
        };
    }
    return { ok: true };
}

/** Human-readable ticket price + accepted rails (for organizer/admin UI). */
export function formatEventTicketSummary(
    ev: Pick<
        TicketPaymentFields,
        | 'ticketPriceUsdc'
        | 'isBlockchain'
        | 'ticketAcceptUsdc'
        | 'ticketAcceptMobileMoney'
        | 'ticketAcceptStellar'
        | 'ticketAcceptStepay'
    >
): string {
    const price = ev.ticketPriceUsdc ?? 0;
    if (!(Number.isFinite(price) && price > 0)) return 'Free';
    const rails: string[] = [];
    if (eventAcceptsStellar(ev)) rails.push('Stellar');
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
    if (st === 'paid_mobile') return 'Legacy payment';
    if (st === 'pending_mobile') return 'Legacy payment (unpaid)';
    if (st === 'rejected_mobile') return 'Legacy payment (rejected)';
    if (st && st !== 'none') return st;
    return 'Unpaid';
}
