import { isSupabaseConfigured, getSupabase } from './supabase';

export interface Registration {
    eventId: string;
    wallet: string;
    registeredAt: string;
}

export async function getRegistrations(): Promise<Registration[]> {
    if (!isSupabaseConfigured) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase.from('registrations').select('*').order('registered_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => ({
        eventId: r.event_id,
        wallet: r.wallet,
        registeredAt: r.registered_at,
    }));
}

export async function registerForEvent(eventId: string, wallet: string): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    const cleanEventId = eventId.trim().toLowerCase();
    const cleanWallet = wallet.trim().toLowerCase();

    const { data: existing } = await getSupabase().from('registrations').select('event_id').eq('event_id', cleanEventId).eq('wallet', cleanWallet).maybeSingle();
    if (existing) return false;

    const { error } = await getSupabase().from('registrations').insert({
        event_id: cleanEventId,
        wallet: cleanWallet,
    });
    if (error) throw error;
    return true;
}

export async function isRegistered(eventId: string, wallet: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    const cleanEventId = eventId.trim().toLowerCase();
    const cleanWallet = wallet.trim().toLowerCase();

    const { data } = await getSupabase().from('registrations').select('event_id').eq('event_id', cleanEventId).eq('wallet', cleanWallet).maybeSingle();
    return !!data;
}
