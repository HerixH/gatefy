import { isSupabaseConfigured, getSupabase } from './supabase';

export interface ClaimCode {
    code: string;
    used: boolean;
    createdAt: string;
    usedAt?: string;
    usedBy?: string;
    vip?: boolean;
    txHash?: string;
    purchasedBy?: string;
}

export interface AttendanceRecord {
    wallet: string;
    code: string;
    checkedInAt: string;
    eventId?: string;
}

// --- Codes (Supabase-backed for Vercel compatibility) ---
export async function getCodes(): Promise<ClaimCode[]> {
    if (!isSupabaseConfigured) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase.from('claim_codes').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => ({
        code: r.code,
        used: r.used ?? false,
        createdAt: r.created_at,
        usedAt: r.used_at ?? undefined,
        usedBy: r.used_by ?? undefined,
        vip: r.vip ?? undefined,
        txHash: r.tx_hash ?? undefined,
        purchasedBy: r.purchased_by ?? undefined,
    }));
}

export async function generateCode(opts?: { vip?: boolean; txHash?: string; purchasedBy?: string }): Promise<string> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const supabase = getSupabase();
    const { error } = await supabase.from('claim_codes').insert({
        code,
        used: false,
        vip: opts?.vip ?? false,
        tx_hash: opts?.txHash ?? null,
        purchased_by: opts?.purchasedBy ?? null,
    });
    if (error) throw error;
    return code;
}

export async function peekCode(code: string): Promise<ClaimCode | undefined> {
    if (!isSupabaseConfigured) return undefined;
    const supabase = getSupabase();
    const { data, error } = await supabase.from('claim_codes').select('*').eq('code', code).eq('used', false).maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return {
        code: data.code,
        used: data.used ?? false,
        createdAt: data.created_at,
        usedAt: data.used_at ?? undefined,
        usedBy: data.used_by ?? undefined,
        vip: data.vip ?? undefined,
        txHash: data.tx_hash ?? undefined,
        purchasedBy: data.purchased_by ?? undefined,
    };
}

export async function verifyCode(
    code: string,
    wallet?: string,
    eventId?: string
): Promise<{ success: boolean; newCheckin: boolean }> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');
    const supabase = getSupabase();
    let newCheckin = false;

    if (!eventId) {
        const { data: codes, error: fetchErr } = await supabase.from('claim_codes').select('*').eq('code', code).eq('used', false);
        if (fetchErr) throw fetchErr;
        if (!codes?.length) return { success: false, newCheckin: false };

        const { error: updateErr } = await supabase.from('claim_codes').update({
            used: true,
            used_at: new Date().toISOString(),
            used_by: wallet ?? null,
        }).eq('code', code);
        if (updateErr) throw updateErr;
    } else {
        const { data: codes } = await supabase.from('claim_codes').select('code').eq('code', code);
        if (!codes?.length) return { success: false, newCheckin: false };

        if (wallet) {
            const { data: existing } = await supabase.from('attendance').select('id').eq('wallet', wallet.toLowerCase()).eq('event_id', eventId).limit(1);
            if (existing?.length) return { success: true, newCheckin: false };
        }
    }

    if (wallet) {
        const { data: dup } = await supabase.from('attendance').select('id').eq('wallet', wallet.toLowerCase()).eq('code', code).eq('event_id', eventId ?? null).limit(1);
        if (!dup?.length) {
            const { error: insErr } = await supabase.from('attendance').insert({
                wallet: wallet.toLowerCase(),
                code,
                event_id: eventId ?? null,
            });
            if (!insErr) newCheckin = true;
        }
    }

    return { success: true, newCheckin };
}

export async function getAttendance(): Promise<AttendanceRecord[]> {
    if (!isSupabaseConfigured) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase.from('attendance').select('*').order('checked_in_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => ({
        wallet: r.wallet,
        code: r.code,
        checkedInAt: r.checked_in_at,
        eventId: r.event_id ?? undefined,
    }));
}
