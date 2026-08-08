import { isSupabaseConfigured } from './supabase';
import { getEvents } from './events';
import { getAttendance } from './codes';
import { getRegistrations } from './registrations';
import { isEmailOrganizerId } from './event-organizer';

export interface LeaderboardAttendee {
    rank: number;
    /** Registration name / shortened wallet — never raw email */
    displayLabel: string;
    /** Email-based check-ins vs wallet-based */
    participantType: 'wallet' | 'email';
    /** Distinct events with recorded attendance */
    eventCount: number;
}

export interface LeaderboardOrganizer {
    rank: number;
    displayLabel: string;
    organizerType: 'wallet' | 'email';
    /** Events created under this organiser id */
    eventCount: number;
    /** Sum of verified check-ins across those events */
    totalAttendees: number;
    /** How many hosted events are email-signup (non-wallet) events */
    emailSignupEvents: number;
    /** How many hosted events use wallet registration */
    walletSignupEvents: number;
}

export async function getLeaderboardAttendees(limit = 50): Promise<LeaderboardAttendee[]> {
    if (!isSupabaseConfigured) return [];
    const [records, registrations] = await Promise.all([getAttendance(), getRegistrations()]);

    const emailToName = new Map<string, string>();
    for (const reg of registrations) {
        if (reg.email && reg.name?.trim()) {
            const k = reg.email.trim().toLowerCase();
            if (!emailToName.has(k)) emailToName.set(k, reg.name.trim());
        }
    }

    type Agg = { eventCount: number; wallet: string | null; email: string | null };
    const counts = new Map<string, Agg>();

    for (const r of records) {
        if (!r.eventId) continue;
        // Leaderboard shows email attendees only (hide Base / wallet address rows).
        const em = (r.email ?? '').trim().toLowerCase();
        if (!em) continue;
        const key = `e:${em}`;
        const cur = counts.get(key) ?? { eventCount: 0, wallet: null, email: em };
        cur.eventCount += 1;
        counts.set(key, cur);
    }

    const sorted = [...counts.values()]
        .sort((a, b) => b.eventCount - a.eventCount)
        .slice(0, limit);

    return sorted.map((s, i) => {
        const displayLabel = s.email ? emailToName.get(s.email) ?? 'Guest' : '—';
        return {
            rank: i + 1,
            displayLabel,
            participantType: 'email' as const,
            eventCount: s.eventCount,
        };
    });
}

export async function getLeaderboardOrganizers(limit = 50): Promise<LeaderboardOrganizer[]> {
    const events = await getEvents();
    const byOrganizer = new Map<
        string,
        {
            eventCount: number;
            totalAttendees: number;
            displayName?: string;
            emailSignupEvents: number;
            walletSignupEvents: number;
        }
    >();
    for (const e of events) {
        const o = e.organizer.toLowerCase();
        const cur = byOrganizer.get(o) ?? {
            eventCount: 0,
            totalAttendees: 0,
            emailSignupEvents: 0,
            walletSignupEvents: 0,
        };
        cur.eventCount += 1;
        cur.totalAttendees += e.attendeeCount ?? 0;
        if (e.isBlockchain === false) cur.emailSignupEvents += 1;
        else cur.walletSignupEvents += 1;
        if (!cur.displayName && e.organizerDisplayName?.trim()) {
            cur.displayName = e.organizerDisplayName.trim();
        }
        byOrganizer.set(o, cur);
    }
    const sorted = [...byOrganizer.entries()]
        .map(([organizerId, data]) => ({ organizerId, ...data }))
        // Hide wallet organisers (0x… Base hosts); email hosts only.
        .filter((s) => isEmailOrganizerId(s.organizerId))
        .sort((a, b) => b.totalAttendees - a.totalAttendees)
        .slice(0, limit);
    return sorted.map((s, i) => {
        return {
            rank: i + 1,
            displayLabel: s.displayName ?? 'Organiser',
            organizerType: 'email' as const,
            eventCount: s.eventCount,
            totalAttendees: s.totalAttendees,
            emailSignupEvents: s.emailSignupEvents,
            walletSignupEvents: s.walletSignupEvents,
        };
    });
}
