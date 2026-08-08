import { validateEventPaymentConfig } from '@/lib/event-payment';

/** Browser-only draft for the create-event form (Save for later). */

export const CREATE_EVENT_DRAFT_KEY = 'gatefy-create-event-draft';

export type CreateEventDraft = {
    name: string;
    description: string;
    date: string;
    endDate: string;
    location: string;
    maxAttendees: string;
    isVip: boolean;
    vipTokenAddress: string;
    vipMinBalance: string;
    bannerUrl: string;
    isBlockchain: boolean;
    organizerEmail: string;
    organizerDisplayName: string;
    ticketPriceUsdc: string;
    mobileMoneyInstructions: string;
    ticketAcceptUsdc: boolean;
    ticketAcceptMobileMoney: boolean;
    ticketAcceptStellar: boolean;
    ticketAcceptStepay: boolean;
    savedAt?: string;
};

export function loadCreateEventDraft(): CreateEventDraft | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(CREATE_EVENT_DRAFT_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as CreateEventDraft;
    } catch {
        return null;
    }
}

export function saveCreateEventDraft(draft: CreateEventDraft): boolean {
    if (typeof window === 'undefined') return false;
    try {
        sessionStorage.setItem(
            CREATE_EVENT_DRAFT_KEY,
            JSON.stringify({ ...draft, savedAt: new Date().toISOString() })
        );
        return true;
    } catch {
        return false;
    }
}

export function clearCreateEventDraft(): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.removeItem(CREATE_EVENT_DRAFT_KEY);
    } catch {
        /* ignore */
    }
}

export type CreateEventValidation =
    | { ok: true }
    | { ok: false; error: string };

export function validateCreateEventForm(
    form: CreateEventDraft,
    opts: { hasWallet: boolean }
): CreateEventValidation {
    if (!form.name.trim()) return { ok: false, error: 'Event name is required.' };
    if (!form.date.trim()) return { ok: false, error: 'Start date & time is required.' };

    const start = new Date(form.date);
    if (Number.isNaN(start.getTime())) return { ok: false, error: 'Invalid start date.' };

    const now = new Date();
    if (start.getTime() < now.getTime() - 60_000) {
        return { ok: false, error: 'Start must be in the future.' };
    }

    if (form.endDate.trim()) {
        const end = new Date(form.endDate);
        if (Number.isNaN(end.getTime())) return { ok: false, error: 'Invalid end date.' };
        if (end.getTime() <= start.getTime()) {
            return { ok: false, error: 'End date & time must be after the start.' };
        }
    }

    if (form.isBlockchain && !opts.hasWallet) {
        return {
            ok: false,
            error: 'Connect a wallet for wallet-based events, or switch registration to email.',
        };
    }

    if (!opts.hasWallet && (!form.organizerEmail.trim() || !form.organizerDisplayName.trim())) {
        return { ok: false, error: 'Enter your email and name or company to host without a wallet.' };
    }

    const tp = parseFloat(form.ticketPriceUsdc.trim());
    const paid = Number.isFinite(tp) && tp > 0;
    if (paid) {
        const pv = validateEventPaymentConfig({
            isBlockchain: form.isBlockchain,
            ticketPriceUsdc: tp,
            ticketAcceptUsdc: form.ticketAcceptUsdc,
            ticketAcceptMobileMoney: false,
            ticketAcceptStellar: form.ticketAcceptStellar,
            ticketAcceptStepay: form.ticketAcceptStepay,
        });
        if (!pv.ok) return { ok: false, error: pv.error };
    }

    if (form.isVip && !form.vipTokenAddress.trim()) {
        return { ok: false, error: 'VIP events require a token contract address.' };
    }

    return { ok: true };
}
