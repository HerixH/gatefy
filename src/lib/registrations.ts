import { isSupabaseConfigured, getSupabase } from './supabase';

export interface Registration {
    eventId: string;
    wallet: string | null;
    email: string | null;
    name: string | null;
    registeredAt: string;
}

function mapRegistrationRow(r: {
    event_id: string;
    wallet?: string | null;
    email?: string | null;
    name?: string | null;
    registered_at: string;
}): Registration {
    return {
        eventId: r.event_id,
        wallet: r.wallet ?? null,
        email: r.email ?? null,
        name: r.name ?? null,
        registeredAt: r.registered_at,
    };
}

export async function getRegistrations(): Promise<Registration[]> {
    if (!isSupabaseConfigured) return [];
    const supabase = getSupabase();
    const { data, error } = await supabase.from('registrations').select('*').order('registered_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRegistrationRow);
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

export async function registerForEvent(
    eventId: string,
    wallet: string,
    details?: { email?: string; name?: string }
): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    const cleanEventId = eventId.trim().toLowerCase();
    const cleanWallet = wallet.trim().toLowerCase();

    const { data: existing } = await getSupabase().from('registrations').select('event_id').eq('event_id', cleanEventId).eq('wallet', cleanWallet).maybeSingle();
    if (existing) return false;

    const email = details?.email?.trim().toLowerCase();
    const displayName = details?.name?.trim() || null;

    const { error } = await getSupabase().from('registrations').insert({
        event_id: cleanEventId,
        wallet: cleanWallet,
        email: email || null,
        name: displayName,
    });
    if (error) throw error;
    return true;
}

export async function registerForEventWithEmail(eventId: string, email: string, name?: string): Promise<boolean> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    const cleanEventId = eventId.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    const { data: existing } = await getSupabase().from('registrations').select('event_id').eq('event_id', cleanEventId).ilike('email', cleanEmail).maybeSingle();
    if (existing) return false;

    const { error } = await getSupabase().from('registrations').insert({
        event_id: cleanEventId,
        email: cleanEmail,
        name: name?.trim() || null,
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

export async function isRegisteredByEmail(eventId: string, email: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    const cleanEventId = eventId.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    const { data } = await getSupabase().from('registrations').select('event_id').eq('event_id', cleanEventId).ilike('email', cleanEmail).maybeSingle();
    return !!data;
}
