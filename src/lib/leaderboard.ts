import { isSupabaseConfigured } from './supabase';
import { getEvents } from './events';
import { getAttendance } from './codes';

export interface LeaderboardAttendee {
    rank: number;
    wallet: string;
    eventCount: number;
}

export interface LeaderboardOrganizer {
    rank: number;
    wallet: string;
    eventCount: number;
    totalAttendees: number;
}

export async function getLeaderboardAttendees(limit = 50): Promise<LeaderboardAttendee[]> {
    if (!isSupabaseConfigured) return [];
    const records = await getAttendance();
    const byWallet = new Map<string, number>();
    for (const r of records) {
        if (r.eventId) {
            const w = r.wallet.toLowerCase();
            byWallet.set(w, (byWallet.get(w) ?? 0) + 1);
        }
    }
    const sorted = [...byWallet.entries()]
        .map(([wallet, eventCount]) => ({ wallet, eventCount }))
        .sort((a, b) => b.eventCount - a.eventCount)
        .slice(0, limit);
    return sorted.map((s, i) => ({ rank: i + 1, wallet: s.wallet, eventCount: s.eventCount }));
}

export async function getLeaderboardOrganizers(limit = 50): Promise<LeaderboardOrganizer[]> {
    const events = await getEvents();
    const byOrganizer = new Map<string, { eventCount: number; totalAttendees: number }>();
    for (const e of events) {
        const w = e.organizer.toLowerCase();
        const cur = byOrganizer.get(w) ?? { eventCount: 0, totalAttendees: 0 };
        cur.eventCount += 1;
        cur.totalAttendees += e.attendeeCount ?? 0;
        byOrganizer.set(w, cur);
    }
    const sorted = [...byOrganizer.entries()]
        .map(([wallet, data]) => ({ wallet, ...data }))
        .sort((a, b) => b.totalAttendees - a.totalAttendees) // primary: total attendees
        .slice(0, limit);
    return sorted.map((s, i) => ({
        rank: i + 1,
        wallet: s.wallet,
        eventCount: s.eventCount,
        totalAttendees: s.totalAttendees,
    }));
}
