import fs from 'fs';
import path from 'path';
import { generateCode } from './codes';
import { isSupabaseConfigured, getSupabase } from './supabase';

const DATA_DIR = path.join(process.cwd(), 'data');
const EVENTS_PATH = path.join(DATA_DIR, 'events.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(EVENTS_PATH)) fs.writeFileSync(EVENTS_PATH, JSON.stringify([]));

export interface Event {
    id: string;
    name: string;
    description: string;
    date: string;
    endDate?: string;
    location: string;
    organizer: string;
    verificationCode: string;
    createdAt: string;
    attendeeCount: number;
    maxAttendees?: number;
    isVip?: boolean;
    vipTokenAddress?: string;
    vipMinBalance?: string;
    bannerUrl?: string;
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
};

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
    const raw = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8')) as (Event & { bannerUrl?: string })[];
    return raw.map(e => ({ ...e, bannerUrl: e.bannerUrl ?? undefined }));
}

export async function createEvent(data: Omit<Event, 'id' | 'createdAt' | 'attendeeCount' | 'verificationCode'>): Promise<Event> {
    const id = Math.random().toString(36).substring(2, 10).toUpperCase();
    const verificationCode = generateCode();
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
        });
        if (error) throw error;
        return event;
    }

    const events = await getEvents();
    events.push(event);
    fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2));
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
        fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2));
    }
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
