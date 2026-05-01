import fs from 'fs';
import path from 'path';
import { generateCode } from './codes';
import { isSupabaseConfigured, getSupabase } from './supabase';

const DATA_DIR = path.join(process.cwd(), 'data');
const EVENTS_PATH = path.join(DATA_DIR, 'events.json');

export interface Event {
    id: string;
    name: string;
    description: string;
    date: string;
    endDate?: string;
    location: string;
    /** Wallet `0x…` or `email:user@domain` for email-based organizers */
    organizer: string;
    /** Display name or company when organizer is email-based */
    organizerDisplayName?: string;
    verificationCode: string;
    createdAt: string;
    attendeeCount: number;
    maxAttendees?: number;
    isVip?: boolean;
    vipTokenAddress?: string;
    vipMinBalance?: string;
    bannerUrl?: string;
    isBlockchain?: boolean;
    /** USDC on Base per ticket; undefined / 0 = free registration */
    ticketPriceUsdc?: number;
    /** Organizer instructions for mobile money (MTN MoMo, etc.) */
    mobileMoneyInstructions?: string;
}

type EventRow = {
    id: string;
    name: string;
    description: string | null;
    date: string;
    end_date: string | null;
    location: string | null;
    organizer: string;
    verification_code: string;
    created_at: string;
    attendee_count: number;
    max_attendees: number | null;
    is_vip: boolean | null;
    vip_token_address: string | null;
    vip_min_balance: string | null;
    banner_url: string | null;
    is_blockchain: boolean | null;
    organizer_display_name: string | null;
    ticket_price_usdc?: number | string | null;
    mobile_money_instructions?: string | null;
};

/** DB / drivers may return boolean or string; null/undefined defaults to wallet (blockchain) mode. */
export function normalizeIsBlockchain(value: unknown): boolean {
    if (value === false || value === 'false' || value === 0) return false;
    if (value === true || value === 'true' || value === 1) return true;
    return true;
}

/** Coerce DB numeric/string to finite USDC price or undefined. */
function parseTicketPrice(v: unknown): number | undefined {
    if (v == null || v === '') return undefined;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
}

const MISSING_PAID_TICKET_COLUMNS_HINT =
    'Paid ticket fields require DB columns. In Supabase Dashboard → SQL Editor, run:\n\n' +
    'alter table public.events add column if not exists ticket_price_usdc numeric;\n' +
    'alter table public.events add column if not exists mobile_money_instructions text;\n' +
    "notify pgrst, 'reload schema';\n";

function isMissingPaidTicketColumnError(err: { message?: string }): boolean {
    const m = err.message ?? '';
    return m.includes('schema cache') && (m.includes('ticket_price_usdc') || m.includes('mobile_money_instructions'));
}

function rowToEvent(r: EventRow): Event {
    return {
        id: r.id,
        name: r.name,
        description: r.description ?? '',
        date: r.date,
        endDate: r.end_date ?? undefined,
        location: r.location ?? '',
        organizer: r.organizer,
        verificationCode: r.verification_code,
        createdAt: r.created_at,
        attendeeCount: r.attendee_count ?? 0,
        maxAttendees: r.max_attendees ?? undefined,
        isVip: r.is_vip ?? false,
        vipTokenAddress: r.vip_token_address ?? '',
        vipMinBalance: r.vip_min_balance ?? '',
        bannerUrl: r.banner_url ?? undefined,
        isBlockchain: normalizeIsBlockchain(r.is_blockchain),
        organizerDisplayName: r.organizer_display_name ?? undefined,
        ticketPriceUsdc: parseTicketPrice(r.ticket_price_usdc),
        mobileMoneyInstructions: r.mobile_money_instructions?.trim() || undefined,
    };
}

export async function getEvents(): Promise<Event[]> {
    if (isSupabaseConfigured) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('date', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(rowToEvent);
    }
    try {
        const raw = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8')) as (Event & { bannerUrl?: string })[];
        return raw.map(e => ({ ...e, bannerUrl: e.bannerUrl ?? undefined }));
    } catch {
        return [];
    }
}

export async function createEvent(data: Omit<Event, 'id' | 'createdAt' | 'attendeeCount' | 'verificationCode'>): Promise<Event> {
    const id = Math.random().toString(36).substring(2, 10).toUpperCase();
    const verificationCode = await generateCode();
    const createdAt = new Date().toISOString();
    const event: Event = {
        ...data,
        id,
        verificationCode,
        createdAt,
        attendeeCount: 0,
    };

    if (isSupabaseConfigured) {
        const supabase = getSupabase();
        const usdcPrice = parseTicketPrice(event.ticketPriceUsdc);
        const momo = event.mobileMoneyInstructions?.trim();
        const ticketCols: Record<string, string | number> = {};
        if (usdcPrice !== undefined) ticketCols.ticket_price_usdc = usdcPrice;
        if (momo) ticketCols.mobile_money_instructions = momo;

        const { error } = await supabase.from('events').insert({
            id: event.id,
            name: event.name,
            description: event.description,
            date: event.date,
            end_date: event.endDate ?? null,
            location: event.location,
            organizer: event.organizer,
            verification_code: event.verificationCode,
            created_at: event.createdAt,
            attendee_count: 0,
            max_attendees: event.maxAttendees ?? null,
            is_vip: event.isVip ?? false,
            vip_token_address: event.vipTokenAddress ?? '',
            vip_min_balance: event.vipMinBalance ?? '',
            banner_url: (data as Event & { bannerUrl?: string }).bannerUrl ?? null,
            is_blockchain: event.isBlockchain ?? true,
            organizer_display_name: event.organizerDisplayName ?? null,
            ...ticketCols,
        });
        if (error) {
            if (isMissingPaidTicketColumnError(error)) throw new Error(MISSING_PAID_TICKET_COLUMNS_HINT);
            throw error;
        }
        return event;
    }

    const events = await getEvents();
    events.push(event);
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
        fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2));
    } catch {
        throw new Error('File system not writable (e.g. on Vercel). Use Supabase.');
    }
    return event;
}

export async function incrementAttendee(eventId: string): Promise<void> {
    if (isSupabaseConfigured) {
        const supabase = getSupabase();
        const { data: row } = await supabase.from('events').select('attendee_count').eq('id', eventId).single();
        if (row) {
            await supabase.from('events').update({ attendee_count: (row.attendee_count ?? 0) + 1 }).eq('id', eventId);
        }
        return;
    }
    const events = await getEvents();
    const idx = events.findIndex(e => e.id === eventId);
    if (idx !== -1) {
        events[idx].attendeeCount += 1;
        try {
            fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2));
        } catch {
            // Ignore on read-only FS (Vercel)
        }
    }
}

export async function getEventById(eventId: string): Promise<Event | undefined> {
    const id = eventId.trim();
    if (!id) return undefined;
    if (isSupabaseConfigured) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? rowToEvent(data as EventRow) : undefined;
    }
    const events = await getEvents();
    return events.find((e) => e.id.toLowerCase() === id.toLowerCase());
}

export async function getEventByCode(code: string): Promise<Event | undefined> {
    if (isSupabaseConfigured) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('events').select('*').eq('verification_code', code).maybeSingle();
        if (error) throw error;
        return data ? rowToEvent(data as EventRow) : undefined;
    }
    const events = await getEvents();
    return events.find(e => e.verificationCode === code);
}
