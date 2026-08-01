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
    /** Paid wallet events: accept USDC transfer (default true). */
    ticketAcceptUsdc?: boolean;
    /** Paid events: accept mobile-money reference (default true). Required for email-only paid events. */
    ticketAcceptMobileMoney?: boolean;
    /** Paid events: accept USDC on Stellar (default false — opt-in). */
    ticketAcceptStellar?: boolean;
    /** Soft-cancel timestamp; when set, event is offline for public signup. */
    cancelledAt?: string;
    /** True when platform admin cancelled (misconduct); hosts cannot restore. */
    cancelledByAdmin?: boolean;
    /** Optional admin cancel note. */
    cancelReason?: string;
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
    ticket_accept_usdc?: boolean | null;
    ticket_accept_mobile_money?: boolean | null;
    ticket_accept_stellar?: boolean | null;
    cancelled_at?: string | null;
    cancelled_by_admin?: boolean | null;
    cancel_reason?: string | null;
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
    'Paid ticket / payment-mode fields require DB columns. In Supabase Dashboard → SQL Editor, run:\n\n' +
    'alter table public.events add column if not exists ticket_price_usdc numeric;\n' +
    'alter table public.events add column if not exists mobile_money_instructions text;\n' +
    'alter table public.events add column if not exists ticket_accept_usdc boolean default true;\n' +
    'alter table public.events add column if not exists ticket_accept_mobile_money boolean default true;\n' +
    'alter table public.events add column if not exists ticket_accept_stellar boolean default false;\n' +
    "notify pgrst, 'reload schema';\n" +
    '\n(See supabase/patches/05_ticket_payment_modes.sql and 06_ticket_accept_stellar.sql)\n';

function isMissingPaidTicketColumnError(err: { message?: string }): boolean {
    const m = err.message ?? '';
    if (!m.includes('schema cache')) return false;
    return (
        m.includes('ticket_price_usdc') ||
        m.includes('mobile_money_instructions') ||
        m.includes('ticket_accept_usdc') ||
        m.includes('ticket_accept_mobile_money') ||
        m.includes('ticket_accept_stellar')
    );
}

/** Default true when column missing / null — old rows behave as today (both rails on). */
function acceptFlagFromDb(value: unknown): boolean {
    if (value === false || value === 'false' || value === 0) return false;
    return true;
}

/** Opt-in flags (Stellar): missing/null → false. */
function acceptFlagOptInFromDb(value: unknown): boolean {
    return value === true || value === 'true' || value === 1;
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
        ticketAcceptUsdc: acceptFlagFromDb(r.ticket_accept_usdc),
        ticketAcceptMobileMoney: acceptFlagFromDb(r.ticket_accept_mobile_money),
        ticketAcceptStellar: acceptFlagOptInFromDb(r.ticket_accept_stellar),
        cancelledAt: r.cancelled_at ?? undefined,
        cancelledByAdmin: r.cancelled_by_admin === true,
        cancelReason: r.cancel_reason?.trim() || undefined,
    };
}

export async function getEvents(opts?: { includeCancelled?: boolean }): Promise<Event[]> {
    const includeCancelled = opts?.includeCancelled === true;
    if (isSupabaseConfigured) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('date', { ascending: true });
        if (error) throw error;
        const mapped = (data ?? []).map(rowToEvent);
        return includeCancelled ? mapped : mapped.filter((e) => !e.cancelledAt);
    }
    try {
        const raw = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8')) as (Event & { bannerUrl?: string })[];
        const mapped = raw.map(e => ({ ...e, bannerUrl: e.bannerUrl ?? undefined }));
        return includeCancelled ? mapped : mapped.filter((e) => !e.cancelledAt);
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
        ticketAcceptUsdc: data.ticketAcceptUsdc !== false,
        ticketAcceptMobileMoney: data.ticketAcceptMobileMoney !== false,
        ticketAcceptStellar: data.ticketAcceptStellar === true,
    };

    if (isSupabaseConfigured) {
        const supabase = getSupabase();
        const usdcPrice = parseTicketPrice(event.ticketPriceUsdc);
        const momo = event.mobileMoneyInstructions?.trim();
        const ticketCols: Record<string, string | number | boolean> = {};
        if (usdcPrice !== undefined) ticketCols.ticket_price_usdc = usdcPrice;
        if (momo) ticketCols.mobile_money_instructions = momo;
        ticketCols.ticket_accept_usdc = event.ticketAcceptUsdc !== false;
        ticketCols.ticket_accept_mobile_money = event.ticketAcceptMobileMoney !== false;
        ticketCols.ticket_accept_stellar = event.ticketAcceptStellar === true;

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
    const events = await getEvents({ includeCancelled: true });
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

/** Partial fields organizers may change after creation (identity & verification code are immutable). */
export type OrganizerMutableEventPatch = Partial<{
    name: string;
    description: string;
    date: string;
    endDate: string | null;
    location: string;
    maxAttendees: number | null;
    isVip: boolean;
    vipTokenAddress: string;
    vipMinBalance: string;
    bannerUrl: string | null;
    isBlockchain: boolean;
    organizerDisplayName: string;
    ticketPriceUsdc: number | null;
    mobileMoneyInstructions: string | null;
    ticketAcceptUsdc?: boolean;
    ticketAcceptMobileMoney?: boolean;
    ticketAcceptStellar?: boolean;
    /** ISO string to cancel; null to clear (uncancel). */
    cancelledAt?: string | null;
    cancelledByAdmin?: boolean | null;
    cancelReason?: string | null;
}>;

function patchToSupabaseRow(patch: OrganizerMutableEventPatch): Record<string, string | number | boolean | null> {
    const row: Record<string, string | number | boolean | null> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.date !== undefined) row.date = patch.date;
    if (patch.endDate !== undefined) row.end_date = patch.endDate;
    if (patch.location !== undefined) row.location = patch.location;
    if (patch.maxAttendees !== undefined) {
        row.max_attendees = patch.maxAttendees === null || patch.maxAttendees <= 0 ? null : patch.maxAttendees;
    }
    if (patch.isVip !== undefined) row.is_vip = patch.isVip;
    if (patch.vipTokenAddress !== undefined) row.vip_token_address = patch.vipTokenAddress;
    if (patch.vipMinBalance !== undefined) row.vip_min_balance = patch.vipMinBalance;
    if (patch.bannerUrl !== undefined) row.banner_url = patch.bannerUrl === null || patch.bannerUrl === '' ? null : patch.bannerUrl;
    if (patch.isBlockchain !== undefined) row.is_blockchain = patch.isBlockchain;
    if (patch.organizerDisplayName !== undefined) row.organizer_display_name = patch.organizerDisplayName?.trim() || null;
    if (patch.ticketPriceUsdc !== undefined) {
        const p = patch.ticketPriceUsdc;
        row.ticket_price_usdc = p === null || p <= 0 || !Number.isFinite(p) ? null : p;
    }
    if (patch.mobileMoneyInstructions !== undefined) {
        const m = patch.mobileMoneyInstructions;
        row.mobile_money_instructions = m === null || String(m).trim() === '' ? null : String(m).trim();
    }
    if (patch.ticketAcceptUsdc !== undefined) row.ticket_accept_usdc = !!patch.ticketAcceptUsdc;
    if (patch.ticketAcceptMobileMoney !== undefined) row.ticket_accept_mobile_money = !!patch.ticketAcceptMobileMoney;
    if (patch.ticketAcceptStellar !== undefined) row.ticket_accept_stellar = !!patch.ticketAcceptStellar;
    if (patch.cancelledAt !== undefined) {
        row.cancelled_at = patch.cancelledAt === null || patch.cancelledAt === '' ? null : patch.cancelledAt;
    }
    if (patch.cancelledByAdmin !== undefined) {
        row.cancelled_by_admin = patch.cancelledByAdmin === true;
    }
    if (patch.cancelReason !== undefined) {
        const r = patch.cancelReason;
        row.cancel_reason = r === null || String(r).trim() === '' ? null : String(r).trim().slice(0, 500);
    }
    return row;
}

export async function updateEventById(
    eventId: string,
    patch: OrganizerMutableEventPatch
): Promise<Event | undefined> {
    const id = eventId.trim();
    if (!id) return undefined;

    const row = patchToSupabaseRow(patch);
    if (Object.keys(row).length === 0) {
        return getEventById(id);
    }

    if (isSupabaseConfigured) {
        const supabase = getSupabase();
        const { error } = await supabase.from('events').update(row).eq('id', id);
        if (error) {
            if (isMissingPaidTicketColumnError(error)) throw new Error(MISSING_PAID_TICKET_COLUMNS_HINT);
            throw error;
        }
        return getEventById(id);
    }

    const events = await getEvents({ includeCancelled: true });
    const idx = events.findIndex((e) => e.id.toLowerCase() === id.toLowerCase());
    if (idx === -1) return undefined;

    const cur = events[idx];
    const next: Event = { ...cur };
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.date !== undefined) next.date = patch.date;
    if (patch.endDate !== undefined) next.endDate = patch.endDate ?? undefined;
    if (patch.location !== undefined) next.location = patch.location;
    if (patch.maxAttendees !== undefined) {
        next.maxAttendees = patch.maxAttendees === null || patch.maxAttendees <= 0 ? undefined : patch.maxAttendees;
    }
    if (patch.isVip !== undefined) next.isVip = patch.isVip;
    if (patch.vipTokenAddress !== undefined) next.vipTokenAddress = patch.vipTokenAddress;
    if (patch.vipMinBalance !== undefined) next.vipMinBalance = patch.vipMinBalance;
    if (patch.bannerUrl !== undefined) next.bannerUrl = patch.bannerUrl ?? undefined;
    if (patch.isBlockchain !== undefined) next.isBlockchain = patch.isBlockchain;
    if (patch.organizerDisplayName !== undefined) next.organizerDisplayName = patch.organizerDisplayName?.trim() || undefined;
    if (patch.ticketPriceUsdc !== undefined) {
        next.ticketPriceUsdc =
            patch.ticketPriceUsdc === null || patch.ticketPriceUsdc <= 0 ? undefined : patch.ticketPriceUsdc;
    }
    if (patch.mobileMoneyInstructions !== undefined) {
        const m = patch.mobileMoneyInstructions;
        next.mobileMoneyInstructions = m === null || !String(m).trim() ? undefined : String(m).trim();
    }
    if (patch.ticketAcceptUsdc !== undefined) next.ticketAcceptUsdc = patch.ticketAcceptUsdc;
    if (patch.ticketAcceptMobileMoney !== undefined) next.ticketAcceptMobileMoney = patch.ticketAcceptMobileMoney;
    if (patch.ticketAcceptStellar !== undefined) next.ticketAcceptStellar = patch.ticketAcceptStellar;
    if (patch.cancelledAt !== undefined) {
        next.cancelledAt = patch.cancelledAt === null || patch.cancelledAt === '' ? undefined : patch.cancelledAt;
    }
    if (patch.cancelledByAdmin !== undefined) {
        next.cancelledByAdmin = patch.cancelledByAdmin === true;
    }
    if (patch.cancelReason !== undefined) {
        const r = patch.cancelReason;
        next.cancelReason = r === null || !String(r).trim() ? undefined : String(r).trim().slice(0, 500);
    }

    events[idx] = next;
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
        fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2));
    } catch {
        throw new Error('File system not writable (e.g. on Vercel). Use Supabase.');
    }
    return next;
}
