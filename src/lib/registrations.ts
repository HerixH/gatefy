import { isSupabaseConfigured, getSupabase } from './supabase';

export interface Registration {
    id?: number;
    eventId: string;
    wallet: string | null;
    email: string | null;
    name: string | null;
    registeredAt: string;
    /** none | pending_mobile | paid_crypto | paid_stellar | paid_mobile | rejected_mobile */
    paymentStatus?: string | null;
    paymentTxHash?: string | null;
    paymentReference?: string | null;
    paidAt?: string | null;
}

function mapRegistrationRow(r: {
    id?: number | null;
    event_id: string;
    wallet?: string | null;
    email?: string | null;
    name?: string | null;
    registered_at: string;
    payment_status?: string | null;
    payment_tx_hash?: string | null;
    payment_reference?: string | null;
    paid_at?: string | null;
}): Registration {
    return {
        id: typeof r.id === 'number' ? r.id : undefined,
        eventId: r.event_id,
        wallet: r.wallet ?? null,
        email: r.email ?? null,
        name: r.name ?? null,
        registeredAt: r.registered_at,
        paymentStatus: r.payment_status ?? undefined,
        paymentTxHash: r.payment_tx_hash ?? undefined,
        paymentReference: r.payment_reference ?? undefined,
        paidAt: r.paid_at ?? undefined,
    };
}

function paymentInsertFields(payment?: { txHash?: string; mobileRef?: string; rail?: 'base' | 'stellar' }) {
    const paidAt = new Date().toISOString();
    let payment_status = 'none';
    let payment_tx_hash: string | null = null;
    let payment_reference: string | null = null;
    let paid_at: string | null = null;

    if (payment?.txHash?.trim()) {
        payment_status = payment.rail === 'stellar' ? 'paid_stellar' : 'paid_crypto';
        payment_tx_hash = payment.txHash.trim();
        paid_at = paidAt;
    } else if (payment?.mobileRef?.trim()) {
        // Host must confirm mobile-money references before they count as paid.
        payment_status = 'pending_mobile';
        payment_reference = payment.mobileRef.trim();
    }

    return { payment_status, payment_tx_hash, payment_reference, paid_at };
}

export async function getRegistrations(): Promise<Registration[]> {
    if (!isSupabaseConfigured) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase.from('registrations').select('*').order('registered_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRegistrationRow);
}

export async function countRegistrationsForEvent(eventId: string): Promise<number> {
    if (!isSupabaseConfigured) return 0;
    const cleanEventId = eventId.trim().toLowerCase();
    const { count, error } = await getSupabase()
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', cleanEventId);
    if (error) throw error;
    return count ?? 0;
}

/** True if this on-chain tx hash was already used for any registration. */
export async function isPaymentTxHashUsed(txHash: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    const h = txHash.trim();
    if (!h) return false;
    const { data, error } = await getSupabase()
        .from('registrations')
        .select('id')
        .ilike('payment_tx_hash', h)
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return !!data;
}

/** True if this mobile-money reference was already used for the same event. */
export async function isMobileMoneyRefUsed(eventId: string, ref: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    const cleanEventId = eventId.trim().toLowerCase();
    const r = ref.trim();
    if (!r) return false;
    const { data, error } = await getSupabase()
        .from('registrations')
        .select('id')
        .eq('event_id', cleanEventId)
        .ilike('payment_reference', r)
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return !!data;
}

/** Single registration row for an event (wallet or email lookup). */
export async function getRegistrationForEvent(
    eventId: string,
    identifier: { wallet?: string; email?: string }
): Promise<Registration | null> {
    if (!isSupabaseConfigured) return null;
    const cleanEventId = eventId.trim().toLowerCase();
    const supabase = getSupabase();

    if (identifier.email) {
        const cleanEmail = identifier.email.trim().toLowerCase();
        const { data, error } = await supabase
            .from('registrations')
            .select('*')
            .eq('event_id', cleanEventId)
            .ilike('email', cleanEmail)
            .maybeSingle();
        if (error) throw error;
        return data ? mapRegistrationRow(data) : null;
    }

    if (identifier.wallet) {
        const cleanWallet = identifier.wallet.trim().toLowerCase();
        const { data, error } = await supabase
            .from('registrations')
            .select('*')
            .eq('event_id', cleanEventId)
            .eq('wallet', cleanWallet)
            .maybeSingle();
        if (error) throw error;
        return data ? mapRegistrationRow(data) : null;
    }

    return null;
}

export async function getRegistrationById(registrationId: number): Promise<Registration | null> {
    if (!isSupabaseConfigured) return null;
    if (!Number.isFinite(registrationId)) return null;
    const { data, error } = await getSupabase()
        .from('registrations')
        .select('*')
        .eq('id', registrationId)
        .maybeSingle();
    if (error) throw error;
    return data ? mapRegistrationRow(data) : null;
}

export type HostPaymentAction = 'confirm_mobile' | 'reject_mobile' | 'mark_paid_mobile' | 'mark_unpaid';

export async function updateRegistrationPaymentByHost(
    registrationId: number,
    action: HostPaymentAction
): Promise<Registration | null> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');
    const existing = await getRegistrationById(registrationId);
    if (!existing) return null;

    const st = (existing.paymentStatus ?? 'none').toLowerCase();
    const now = new Date().toISOString();
    let patch: Record<string, string | null>;

    if (action === 'confirm_mobile' || action === 'mark_paid_mobile') {
        if (action === 'confirm_mobile' && st !== 'pending_mobile' && st !== 'rejected_mobile') {
            throw new Error('Only pending or rejected mobile-money registrations can be confirmed.');
        }
        if (!existing.paymentReference?.trim() && action === 'confirm_mobile') {
            throw new Error('This registration has no mobile-money reference to confirm.');
        }
        patch = {
            payment_status: 'paid_mobile',
            paid_at: now,
        };
    } else if (action === 'reject_mobile') {
        if (st !== 'pending_mobile' && st !== 'paid_mobile') {
            throw new Error('Only pending or paid mobile-money registrations can be rejected.');
        }
        patch = {
            payment_status: 'rejected_mobile',
            paid_at: null,
        };
    } else {
        // mark_unpaid
        patch = {
            payment_status: 'none',
            paid_at: null,
            payment_tx_hash: null,
            payment_reference: null,
        };
    }

    const { error } = await getSupabase().from('registrations').update(patch).eq('id', registrationId);
    if (error) throw error;
    return getRegistrationById(registrationId);
}

export async function registerForEvent(
    eventId: string,
    wallet: string,
    details?: { email?: string; name?: string },
    payment?: { txHash?: string; mobileRef?: string; rail?: 'base' | 'stellar' }
): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    const cleanEventId = eventId.trim().toLowerCase();
    const cleanWallet = wallet.trim().toLowerCase();

    const { data: existing } = await getSupabase().from('registrations').select('event_id').eq('event_id', cleanEventId).eq('wallet', cleanWallet).maybeSingle();
    if (existing) return false;

    const email = details?.email?.trim().toLowerCase();
    const displayName = details?.name?.trim() || null;
    const pay = paymentInsertFields(payment);

    const insertRow: Record<string, unknown> = {
        event_id: cleanEventId,
        wallet: cleanWallet,
        email: email || null,
        name: displayName,
    };
    if (pay.payment_status !== 'none') {
        insertRow.payment_status = pay.payment_status;
        insertRow.payment_tx_hash = pay.payment_tx_hash;
        insertRow.payment_reference = pay.payment_reference;
        if (pay.paid_at) insertRow.paid_at = pay.paid_at;
    }

    const { error } = await getSupabase().from('registrations').insert(insertRow);
    if (error) {
        if (isUniquePaymentError(error)) throw new Error('This payment proof was already used for another registration.');
        throw error;
    }
    return true;
}

export async function registerForEventWithEmail(
    eventId: string,
    email: string,
    name?: string,
    payment?: { txHash?: string; mobileRef?: string; rail?: 'base' | 'stellar' }
): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    const cleanEventId = eventId.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    const { data: existing } = await getSupabase().from('registrations').select('event_id').eq('event_id', cleanEventId).ilike('email', cleanEmail).maybeSingle();
    if (existing) return false;

    const pay = paymentInsertFields(payment);

    const insertRow: Record<string, unknown> = {
        event_id: cleanEventId,
        email: cleanEmail,
        name: name?.trim() || null,
    };
    if (pay.payment_status !== 'none') {
        insertRow.payment_status = pay.payment_status;
        insertRow.payment_tx_hash = pay.payment_tx_hash;
        insertRow.payment_reference = pay.payment_reference;
        if (pay.paid_at) insertRow.paid_at = pay.paid_at;
    }

    const { error } = await getSupabase().from('registrations').insert(insertRow);
    if (error) {
        if (isUniquePaymentError(error)) throw new Error('This payment proof was already used for another registration.');
        throw error;
    }
    return true;
}

function isUniquePaymentError(err: { code?: string; message?: string }): boolean {
    if (err.code === '23505') return true;
    const m = (err.message ?? '').toLowerCase();
    return m.includes('unique_registration_payment') || m.includes('payment_tx_hash') || m.includes('payment_reference');
}

export async function isRegistered(eventId: string, wallet: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    const cleanEventId = eventId.trim().toLowerCase();
    const cleanWallet = wallet.trim().toLowerCase();

    const { data } = await getSupabase().from('registrations').select('event_id').eq('event_id', cleanEventId).eq('wallet', cleanWallet).maybeSingle();
    return !!data;
}

export async function isRegisteredByEmail(eventId: string, email: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    const cleanEventId = eventId.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    const { data } = await getSupabase().from('registrations').select('event_id').eq('event_id', cleanEventId).ilike('email', cleanEmail).maybeSingle();
    return !!data;
}
