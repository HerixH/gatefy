'use client';

import { useState, useEffect, useCallback, useMemo, startTransition } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import {
    formatOrganizerShort,
    getOrganizerEmailFromId,
    isEmailOrganizerId,
} from '@/lib/event-organizer';
import {
    formatEventTicketSummary,
    isPaidRegistration,
    registrationPaymentLabel,
} from '@/lib/event-payment';
import { isPast } from '@/lib/event-status';
import { explorerUrlForMint } from '@/lib/attendance-mint';

interface AttendanceRecord {
    wallet?: string | null;
    email?: string | null;
    code: string;
    checkedInAt: string;
    eventId?: string;
    mintChain?: string | null;
    mintStatus?: string | null;
    mintTxHash?: string | null;
    mintTokenId?: string | null;
}

interface DashboardEvent {
    id: string;
    name: string;
    description: string;
    date: string;
    endDate?: string;
    location: string;
    organizer: string;
    organizerDisplayName?: string;
    verificationCode: string;
    createdAt: string;
    attendeeCount: number;
    registrationCount?: number;
    maxAttendees?: number;
    isVip?: boolean;
    vipTokenAddress?: string;
    vipMinBalance?: string;
    isBlockchain?: boolean;
    ticketPriceUsdc?: number;
    mobileMoneyInstructions?: string;
    ticketAcceptUsdc?: boolean;
    ticketAcceptMobileMoney?: boolean;
    cancelledAt?: string;
    cancelledByAdmin?: boolean;
    cancelReason?: string;
}

interface Registration {
    eventId: string;
    wallet: string | null;
    email: string | null;
    name: string | null;
    registeredAt: string;
    paymentStatus?: string | null;
    paymentTxHash?: string | null;
    paymentReference?: string | null;
    paidAt?: string | null;
}

type Tab = 'overview' | 'managers' | 'attendance' | 'events';

type OrganizerHostType = 'wallet' | 'email';

export default function AdminDashboard() {
    const [authed, setAuthed] = useState(false);
    const [sessionChecked, setSessionChecked] = useState(false);
    const [adminConfigured, setAdminConfigured] = useState(true);
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState(false);
    const [tab, setTab] = useState<Tab>('overview');
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [events, setEvents] = useState<DashboardEvent[]>([]);
    const [attendanceCollapsed, setAttendanceCollapsed] = useState<Record<string, boolean>>({});
    const [selectedEventQR, setSelectedEventQR] = useState<DashboardEvent | null>(null);
    const [selectedEventDetail, setSelectedEventDetail] = useState<DashboardEvent | null>(null);
    const [rosterQuery, setRosterQuery] = useState('');
    const [rosterFilter, setRosterFilter] = useState('');
    const [rosterPerson, setRosterPerson] = useState<
        | { kind: 'verified'; row: AttendanceRecord }
        | { kind: 'pending'; row: Registration }
        | null
    >(null);
    const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const [contactEvent, setContactEvent] = useState<DashboardEvent | null>(null);
    const [contactSubject, setContactSubject] = useState('');
    const [contactMessage, setContactMessage] = useState('');
    const [contactToEmail, setContactToEmail] = useState('');
    const [contactBusy, setContactBusy] = useState(false);
    const [contactError, setContactError] = useState('');
    const [contactOk, setContactOk] = useState('');

    // Interactivity: Search & Filter
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'vip' | 'regular'>('all');
    const [managerHostFilter, setManagerHostFilter] = useState<'all' | OrganizerHostType>('all');

    /** Filter events tab to hosts matching this organizer id (normalized). */
    const [selectedOrganizerKey, setSelectedOrganizerKey] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/admin/session', { credentials: 'include' })
            .then(r => r.json())
            .then((d: { authenticated?: boolean; configured?: boolean }) => {
                if (d.configured === false) setAdminConfigured(false);
                if (d.authenticated) setAuthed(true);
            })
            .catch(() => {})
            .finally(() => setSessionChecked(true));
    }, []);

    const fetchAttendance = useCallback(async () => {
        const res = await fetch('/api/admin/attendance', { cache: 'no-store', credentials: 'include' });
        if (res.status === 401) {
            setAuthed(false);
            return;
        }
        const data = await res.json();
        if (Array.isArray(data)) setAttendance(data);
    }, []);

    const fetchEvents = useCallback(async () => {
        const res = await fetch('/api/admin/events', { cache: 'no-store', credentials: 'include' });
        if (res.status === 401) {
            setAuthed(false);
            return;
        }
        const data = await res.json();
        if (Array.isArray(data)) setEvents(data);
    }, []);

    const setAdminEventCancelled = useCallback(
        async (ev: DashboardEvent, cancelled: boolean) => {
            let reason: string | null = null;
            if (cancelled) {
                if (isPast(ev.date, ev.endDate)) {
                    window.alert('Past events cannot be cancelled, even by admins.');
                    return;
                }
                const ok = window.confirm(
                    `Cancel “${ev.name}” for misconduct / policy? It will leave public browse and signup will close. The host cannot restore it.`
                );
                if (!ok) return;
                const note = window.prompt('Optional reason (shown to host support):', 'Misconduct / policy');
                if (note === null) return;
                reason = note.trim() || 'Cancelled by admin';
            } else {
                if (!window.confirm(`Restore “${ev.name}”? It will be public again.`)) return;
            }
            setCancelBusyId(ev.id);
            try {
                const res = await fetch('/api/admin/events', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        eventId: ev.id,
                        cancelled,
                        ...(reason ? { reason } : {}),
                    }),
                });
                if (res.status === 401) {
                    setAuthed(false);
                    return;
                }
                const data = await res.json();
                if (!res.ok) {
                    window.alert(typeof data?.error === 'string' ? data.error : 'Update failed');
                    return;
                }
                await fetchEvents();
                setSelectedEventDetail((cur) =>
                    cur && cur.id === ev.id
                        ? {
                              ...cur,
                              cancelledAt: data.cancelledAt,
                              cancelledByAdmin: data.cancelledByAdmin,
                              cancelReason: data.cancelReason,
                          }
                        : cur
                );
            } catch {
                window.alert('Network error');
            } finally {
                setCancelBusyId(null);
            }
        },
        [fetchEvents]
    );

    const fetchRegistrations = useCallback(async () => {
        const res = await fetch('/api/admin/registrations', { cache: 'no-store', credentials: 'include' });
        if (res.status === 401) {
            setAuthed(false);
            return;
        }
        const data = await res.json();
        if (Array.isArray(data)) setRegistrations(data);
    }, []);

    const refreshAll = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchAttendance(), fetchRegistrations(), fetchEvents()]);
            setLastRefreshed(new Date());
        } finally {
            setRefreshing(false);
        }
    }, [fetchAttendance, fetchRegistrations, fetchEvents]);

    useEffect(() => {
        if (!authed) return;
        startTransition(() => {
            void refreshAll();
        });
    }, [authed, refreshAll]);

    // Soft live poll while the terminal is open (overview stays current).
    useEffect(() => {
        if (!authed) return;
        const id = window.setInterval(() => {
            void refreshAll();
        }, 30_000);
        return () => window.clearInterval(id);
    }, [authed, refreshAll]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(false);
        try {
            const res = await fetch('/api/admin/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password }),
            });
            if (res.ok) {
                setAuthed(true);
                setPassword('');
            } else {
                setAuthError(true);
                setPassword('');
            }
        } catch {
            setAuthError(true);
            setPassword('');
        }
    };

    const handleLogout = async () => {
        await fetch('/api/admin/session', { method: 'DELETE', credentials: 'include' });
        setAuthed(false);
    };

    // Export Logic
    const exportToCSV = (data: Record<string, string | number | boolean | null | undefined>[], filename: string) => {
        if (data.length === 0) return;
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row =>
                headers.map(h => `"${String(row[h] ?? '')}"`).join(','),
            ),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    /** Per–event-host aggregate stats for admins (wallet vs email-hosted events). */
    const organizerSummaries = useMemo(() => {
        type Row = {
            organizer: string;
            display: string;
            hostType: OrganizerHostType;
            events: DashboardEvent[];
        };
        const m = new Map<string, Row>();
        for (const ev of events) {
            const k = ev.organizer.toLowerCase();
            let row = m.get(k);
            if (!row) {
                row = {
                    organizer: ev.organizer,
                    display: formatOrganizerShort(ev),
                    hostType: isEmailOrganizerId(ev.organizer) ? 'email' : 'wallet',
                    events: [],
                };
                m.set(k, row);
            }
            row.events.push(ev);
        }

        const eventIdLower = (id: string) => id.trim().toLowerCase();

        return [...m.values()]
            .map((row) => {
                const ids = new Set(row.events.map((e) => eventIdLower(e.id)));
                const registrationCount = registrations.filter((r) =>
                    ids.has(eventIdLower(r.eventId ?? '')),
                ).length;
                const verifiedCheckins = attendance.filter(
                    (a) =>
                        !!a.eventId &&
                        ids.has(eventIdLower(a.eventId)),
                ).length;
                return {
                    ...row,
                    registrationCount,
                    verifiedCheckins,
                };
            })
            .sort(
                (a, b) =>
                    b.events.length - a.events.length ||
                    a.display.localeCompare(b.display),
            );
    }, [events, registrations, attendance]);

    const platformStats = useMemo(() => {
        const paid = registrations.filter((r) => isPaidRegistration(r.paymentStatus)).length;
        const pendingMobile = registrations.filter(
            (r) => (r.paymentStatus ?? '').toLowerCase() === 'pending_mobile',
        ).length;
        const cancelled = events.filter((e) => !!e.cancelledAt).length;
        const adminCancelled = events.filter((e) => e.cancelledByAdmin).length;
        const minted = attendance.filter((a) => (a.mintStatus ?? '').toLowerCase() === 'minted').length;
        const activeEvents = events.filter((e) => !e.cancelledAt).length;
        const checkInRate =
            registrations.length > 0
                ? Math.round((attendance.length / registrations.length) * 100)
                : null;
        return {
            paid,
            pendingMobile,
            cancelled,
            adminCancelled,
            minted,
            activeEvents,
            checkInRate,
            registrations: registrations.length,
            walletHosts: organizerSummaries.filter((h) => h.hostType === 'wallet').length,
            emailHosts: organizerSummaries.filter((h) => h.hostType === 'email').length,
        };
    }, [registrations, events, attendance, organizerSummaries]);

    const densestEvents = useMemo(() => {
        return [...events]
            .filter((e) => !e.cancelledAt)
            .sort((a, b) => (b.attendeeCount ?? 0) - (a.attendeeCount ?? 0) || (b.registrationCount ?? 0) - (a.registrationCount ?? 0))
            .slice(0, 6);
    }, [events]);

    const recentActivity = useMemo(() => {
        return [...attendance]
            .sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime())
            .slice(0, 8);
    }, [attendance]);

    // Filtered data
    const filteredEvents = events.filter((ev) => {
        const orgLower = ev.organizer.toLowerCase();
        if (selectedOrganizerKey && orgLower !== selectedOrganizerKey.toLowerCase()) return false;
        const matchesSearch =
            ev.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (ev.organizerDisplayName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            ev.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ev.organizer.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter =
            filterType === 'all' || (filterType === 'vip' && ev.isVip) || (filterType === 'regular' && !ev.isVip);
        const isEmailHost = isEmailOrganizerId(ev.organizer);
        const matchesHost =
            managerHostFilter === 'all' ||
            (managerHostFilter === 'wallet' && !isEmailHost) ||
            (managerHostFilter === 'email' && isEmailHost);
        return matchesSearch && matchesFilter && matchesHost;
    });

    const filteredOrganizerSummaries = organizerSummaries.filter((row) => {
        if (managerHostFilter === 'wallet' && row.hostType !== 'wallet') return false;
        if (managerHostFilter === 'email' && row.hostType !== 'email') return false;
        const q = searchQuery.toLowerCase();
        if (!q) return true;
        return (
            row.display.toLowerCase().includes(q) ||
            row.organizer.toLowerCase().includes(q) ||
            row.events.some((e) => e.name.toLowerCase().includes(q))
        );
    });

    const openHostEvents = (organizerKey: string) => {
        setSelectedOrganizerKey(organizerKey);
        setTab('events');
        setSearchQuery('');
    };

    const openContactHost = (ev: DashboardEvent) => {
        const known = getOrganizerEmailFromId(ev.organizer) || '';
        setContactEvent(ev);
        setContactToEmail(known);
        setContactSubject(`Regarding ${ev.name}`);
        setContactMessage('');
        setContactError('');
        setContactOk('');
    };

    const sendContactHost = async () => {
        if (!contactEvent) return;
        setContactBusy(true);
        setContactError('');
        setContactOk('');
        try {
            const res = await fetch('/api/admin/contact-host', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    eventId: contactEvent.id,
                    subject: contactSubject,
                    message: contactMessage,
                    ...(contactToEmail.trim() ? { toEmail: contactToEmail.trim() } : {}),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 401) {
                setAuthed(false);
                return;
            }
            if (!res.ok) {
                setContactError(typeof data?.error === 'string' ? data.error : 'Failed to send.');
                return;
            }
            setContactOk(`Sent to ${typeof data?.to === 'string' ? data.to : contactToEmail}`);
            setContactMessage('');
        } catch {
            setContactError('Network error');
        } finally {
            setContactBusy(false);
        }
    };

    const exportManagersCSV = () => {
        exportToCSV(
            filteredOrganizerSummaries.map((r) => ({
                display: r.display,
                organizer_raw: r.organizer,
                host_type: r.hostType,
                events_managed: r.events.length,
                registrations_total: r.registrationCount,
                verified_checkins_total: r.verifiedCheckins,
            })),
            'gatefy-event-managers.csv',
        );
    };

    const LEGACY_EVENT_KEY = '__legacy__';
    const attendanceSearch = searchQuery.trim().toLowerCase();

    /** Match full strings, or truncated UI form like `0xde25f466…f2a13e7a`. */
    const textMatchesSearch = (value: string | null | undefined, query = attendanceSearch) => {
        if (!query) return true;
        const h = (value ?? '').toLowerCase();
        if (!h) return false;
        if (h.includes(query)) return true;
        const parts = query.split(/…|\.{2,}/).filter(Boolean);
        if (parts.length === 2) {
            const [pre, suf] = parts;
            if (pre.length >= 4 && suf.length >= 4 && h.startsWith(pre) && h.endsWith(suf)) return true;
        }
        return false;
    };

    /** Canonical event id (dashboard casing) so attendance rows match Events tab ids. */
    const canonicalEventId = (raw?: string | null) => {
        const t = raw?.trim();
        if (!t) return LEGACY_EVENT_KEY;
        const hit = events.find((e) => e.id.toLowerCase() === t.toLowerCase());
        return hit?.id ?? t;
    };

    const eventMatchesAttendanceSearch = (eventId: string) => {
        if (!attendanceSearch) return true;
        if (eventId === LEGACY_EVENT_KEY) return 'legacy'.includes(attendanceSearch);
        const ev = events.find((e) => e.id.toLowerCase() === eventId.toLowerCase());
        if (!ev) return textMatchesSearch(eventId);
        return (
            textMatchesSearch(ev.name) ||
            textMatchesSearch(ev.location) ||
            textMatchesSearch(ev.id) ||
            textMatchesSearch(ev.organizer) ||
            textMatchesSearch(ev.organizerDisplayName)
        );
    };

    const attendanceRecordMatchesSearch = (record: AttendanceRecord) => {
        if (!attendanceSearch) return true;
        if (eventMatchesAttendanceSearch(canonicalEventId(record.eventId))) return true;
        return (
            textMatchesSearch(record.wallet) ||
            textMatchesSearch(record.email) ||
            textMatchesSearch(record.code) ||
            textMatchesSearch(record.mintTxHash) ||
            textMatchesSearch(record.mintChain) ||
            textMatchesSearch(record.mintTokenId)
        );
    };

    const registrationMatchesSearch = (reg: Registration) => {
        if (!attendanceSearch) return true;
        if (eventMatchesAttendanceSearch(canonicalEventId(reg.eventId))) return true;
        return (
            textMatchesSearch(reg.wallet) ||
            textMatchesSearch(reg.email) ||
            textMatchesSearch(reg.name) ||
            textMatchesSearch(reg.paymentTxHash) ||
            textMatchesSearch(reg.paymentReference) ||
            textMatchesSearch(reg.paymentStatus)
        );
    };

    const filteredAttendance = attendance.filter(attendanceRecordMatchesSearch);

    const groupedAttendance = filteredAttendance.reduce<Record<string, AttendanceRecord[]>>((acc, record) => {
        const key = canonicalEventId(record.eventId);
        if (!acc[key]) acc[key] = [];
        acc[key].push(record);
        return acc;
    }, {});

    /** Full verified set (ignores search) — used so search doesn't reclassify verified people as registered-only. */
    const verifiedAllByEvent = attendance.reduce<Record<string, AttendanceRecord[]>>((acc, record) => {
        const key = canonicalEventId(record.eventId);
        if (!acc[key]) acc[key] = [];
        acc[key].push(record);
        return acc;
    }, {});

    /** True if wallet OR email matches a verified check-in (regs often have both). */
    const registrationIsCheckedIn = (
        r: Registration,
        attendedWallets: Set<string>,
        attendedEmails: Set<string>
    ) => {
        const w = r.wallet?.trim().toLowerCase();
        const e = r.email?.trim().toLowerCase();
        if (w && attendedWallets.has(w)) return true;
        if (e && attendedEmails.has(e)) return true;
        return false;
    };

    function getRegisteredOnly(eventId: string): Registration[] {
        if (eventId === LEGACY_EVENT_KEY) return [];
        const verifiedRecords = verifiedAllByEvent[eventId] || [];
        const attendedWallets = new Set(
            verifiedRecords.map((r) => (r.wallet ?? '').toLowerCase()).filter(Boolean)
        );
        const attendedEmails = new Set(
            verifiedRecords.map((r) => (r.email ?? '').toLowerCase()).filter(Boolean)
        );
        return registrations.filter((r) => {
            if ((r.eventId ?? '').toLowerCase() !== eventId.toLowerCase()) return false;
            if (registrationIsCheckedIn(r, attendedWallets, attendedEmails)) return false;
            return registrationMatchesSearch(r);
        });
    }

    const attendanceSectionIds: string[] = [
        ...events
            .map((e) => e.id)
            .filter(
                (id) => (groupedAttendance[id]?.length ?? 0) > 0 || getRegisteredOnly(id).length > 0
            ),
    ];
    for (const key of Object.keys(groupedAttendance)) {
        if (key === LEGACY_EVENT_KEY) continue;
        if (!attendanceSectionIds.some((id) => id.toLowerCase() === key.toLowerCase())) {
            attendanceSectionIds.push(key);
        }
    }
    if ((groupedAttendance[LEGACY_EVENT_KEY]?.length ?? 0) > 0) {
        attendanceSectionIds.push(LEGACY_EVENT_KEY);
    }

    const renderMintVerify = (record: Pick<AttendanceRecord, 'mintChain' | 'mintStatus' | 'mintTxHash' | 'mintTokenId'>) => {
        const minted = (record.mintStatus ?? '').toLowerCase() === 'minted';
        if (!minted) {
            return <span className="text-white/20">—</span>;
        }
        const explorer = explorerUrlForMint(record.mintChain, record.mintTxHash);
        const chainLabel = (record.mintChain || 'soroban').toLowerCase();
        const tokenPart = record.mintTokenId ? ` #${record.mintTokenId}` : '';
        return (
            <span className="text-[8px] font-mono text-blue-300/85 leading-relaxed">
                Minted{tokenPart}
                {' · '}
                {explorer ? (
                    <a
                        href={explorer}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 decoration-blue-400/50 hover:text-blue-200 hover:decoration-blue-200"
                        title="Verify mint on explorer"
                    >
                        {chainLabel}
                    </a>
                ) : (
                    <span>{chainLabel}</span>
                )}
                {explorer ? (
                    <>
                        {' · '}
                        <a
                            href={explorer}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/45 hover:text-white underline underline-offset-2"
                        >
                            verify tx
                        </a>
                    </>
                ) : null}
            </span>
        );
    };

    const toggleAttendanceSection = (eventId: string) => {
        setAttendanceCollapsed(prev => ({ ...prev, [eventId]: !prev[eventId] }));
    };

    const exportAttendanceReport = () => {
        const rows: {
            Event: string;
            Identity: string;
            Status: string;
            'Auth Code': string;
            Mint: string;
            'Mint Tx': string;
            Explorer: string;
            Timestamp: string;
        }[] = [];
        const eventName = (id: string) =>
            id === LEGACY_EVENT_KEY
                ? 'Legacy check-ins'
                : (events.find((e) => e.id === id || e.id.toLowerCase() === id.toLowerCase())?.name ?? id);
        attendance.forEach((record) => {
            const id = record.wallet?.trim() || record.email?.trim() || '—';
            const minted = (record.mintStatus ?? '').toLowerCase() === 'minted';
            const explorer = explorerUrlForMint(record.mintChain, record.mintTxHash);
            rows.push({
                Event: eventName(canonicalEventId(record.eventId)),
                Identity: id,
                Status: 'Verified',
                'Auth Code': record.code,
                Mint: minted
                    ? `Minted${record.mintTokenId ? ` #${record.mintTokenId}` : ''} · ${(record.mintChain || 'soroban').toLowerCase()}`
                    : (record.mintStatus || '—'),
                'Mint Tx': record.mintTxHash || '',
                Explorer: explorer || '',
                Timestamp: new Date(record.checkedInAt).toLocaleString('en-GB'),
            });
        });
        registrations.forEach((reg) => {
            const regWallet = reg.wallet;
            const walletHit =
                !!regWallet &&
                attendance.some(
                    (a) =>
                        a.eventId &&
                        (reg.eventId ?? '').toLowerCase() === a.eventId.toLowerCase() &&
                        (a.wallet ?? '').toLowerCase() === regWallet.toLowerCase()
                );
            const regEmail = reg.email;
            const emailHit =
                !!regEmail &&
                attendance.some(
                    (a) =>
                        a.eventId &&
                        (reg.eventId ?? '').toLowerCase() === a.eventId.toLowerCase() &&
                        (a.email ?? '').toLowerCase() === regEmail.toLowerCase()
                );
            if (!walletHit && !emailHit) {
                rows.push({
                    Event:
                        events.find((e) => e.id.toLowerCase() === (reg.eventId ?? '').toLowerCase())?.name ??
                        reg.eventId,
                    Identity: reg.wallet?.trim() || reg.email?.trim() || '—',
                    Status: 'Registered only',
                    'Auth Code': '-',
                    Mint: '—',
                    'Mint Tx': '',
                    Explorer: '',
                    Timestamp: new Date(reg.registeredAt).toLocaleString('en-GB'),
                });
            }
        });
        if (rows.length === 0) return;
        exportToCSV(rows, 'gatefy-attendance-report.csv');
    };

    const shortIdentity = (wallet?: string | null, email?: string | null) => {
        const raw = wallet?.trim() || email?.trim() || '—';
        if (raw.length <= 24) return raw;
        return `${raw.slice(0, 10)}…${raw.slice(-8)}`;
    };

    const shortHash = (h?: string | null) => {
        const t = h?.trim();
        if (!t) return '';
        if (t.length <= 14) return t;
        return `${t.slice(0, 8)}…${t.slice(-6)}`;
    };

    const registrationPaymentDetail = (r: Registration): string => {
        const st = (r.paymentStatus ?? '').trim().toLowerCase();
        if (st === 'paid_crypto' && r.paymentTxHash?.trim()) return r.paymentTxHash.trim();
        if (st === 'paid_mobile' && r.paymentReference?.trim()) return r.paymentReference.trim();
        return '';
    };

    const getVerifiedForEvent = (eventId: string) =>
        attendance
            .filter(a => a.eventId && a.eventId.toLowerCase() === eventId.toLowerCase())
            .sort((x, y) => new Date(y.checkedInAt).getTime() - new Date(x.checkedInAt).getTime());

    const getRegisteredOnlyForEvent = (eventId: string): Registration[] => {
        const verified = getVerifiedForEvent(eventId);
        const attendedWallets = new Set(verified.map(r => (r.wallet ?? '').toLowerCase()).filter(Boolean));
        const attendedEmails = new Set(verified.map(r => (r.email ?? '').toLowerCase()).filter(Boolean));
        return registrations.filter((r) => {
            if ((r.eventId ?? '').toLowerCase() !== eventId.toLowerCase()) return false;
            return !registrationIsCheckedIn(r, attendedWallets, attendedEmails);
        });
    };

    const openEventRoster = (ev: DashboardEvent) => {
        setRosterQuery('');
        setRosterFilter('');
        setRosterPerson(null);
        setSelectedEventDetail(ev);
    };

    const applyRosterSearch = () => {
        setRosterFilter(rosterQuery.trim());
        setRosterPerson(null);
    };

    const findRegistrationForAttendance = (eventId: string, row: AttendanceRecord): Registration | undefined => {
        const w = (row.wallet ?? '').toLowerCase();
        const e = (row.email ?? '').toLowerCase();
        return registrations.find((r) => {
            if ((r.eventId ?? '').toLowerCase() !== eventId.toLowerCase()) return false;
            if (w && (r.wallet ?? '').toLowerCase() === w) return true;
            if (e && (r.email ?? '').toLowerCase() === e) return true;
            return false;
        });
    };

    const rosterQ = rosterFilter.toLowerCase();
    const rosterVerifiedAll = selectedEventDetail ? getVerifiedForEvent(selectedEventDetail.id) : [];
    const rosterPendingAll = selectedEventDetail ? getRegisteredOnlyForEvent(selectedEventDetail.id) : [];
    const rosterVerified = !rosterQ
        ? rosterVerifiedAll
        : rosterVerifiedAll.filter(
              (row) =>
                  textMatchesSearch(row.wallet, rosterQ) ||
                  textMatchesSearch(row.email, rosterQ) ||
                  textMatchesSearch(row.code, rosterQ) ||
                  textMatchesSearch(row.mintTxHash, rosterQ) ||
                  textMatchesSearch(row.mintChain, rosterQ) ||
                  textMatchesSearch(row.mintTokenId, rosterQ)
          );
    const rosterPending = !rosterQ
        ? rosterPendingAll
        : rosterPendingAll.filter(
              (reg) =>
                  textMatchesSearch(reg.wallet, rosterQ) ||
                  textMatchesSearch(reg.email, rosterQ) ||
                  textMatchesSearch(reg.name, rosterQ) ||
                  textMatchesSearch(reg.paymentTxHash, rosterQ) ||
                  textMatchesSearch(reg.paymentReference, rosterQ)
          );

    const exportEventRoster = (ev: DashboardEvent) => {
        const verified = getVerifiedForEvent(ev.id);
        const onlyReg = getRegisteredOnlyForEvent(ev.id);
        const rows: {
            Status: string;
            Identity: string;
            Name: string;
            Email: string;
            Code: string;
            Mint: string;
            'Mint Tx': string;
            Explorer: string;
            Payment: string;
            PaymentDetail: string;
            Timestamp: string;
        }[] = [];
        verified.forEach((v) => {
            const minted = (v.mintStatus ?? '').toLowerCase() === 'minted';
            const explorer = explorerUrlForMint(v.mintChain, v.mintTxHash);
            rows.push({
                Status: 'Verified',
                Identity: v.wallet?.trim() || v.email?.trim() || '—',
                Name: '—',
                Email: (v.email ?? '').trim() || '—',
                Code: v.code,
                Mint: minted
                    ? `Minted${v.mintTokenId ? ` #${v.mintTokenId}` : ''} · ${(v.mintChain || 'soroban').toLowerCase()}`
                    : (v.mintStatus || '—'),
                'Mint Tx': v.mintTxHash || '',
                Explorer: explorer || '',
                Payment: '—',
                PaymentDetail: '—',
                Timestamp: new Date(v.checkedInAt).toLocaleString('en-GB'),
            });
        });
        onlyReg.forEach((r) => {
            rows.push({
                Status: 'Registered only',
                Identity: r.wallet?.trim() || r.email?.trim() || '—',
                Name: (r.name ?? '').trim() || '—',
                Email: (r.email ?? '').trim() || '—',
                Code: '-',
                Mint: '—',
                'Mint Tx': '',
                Explorer: '',
                Payment: registrationPaymentLabel(r.paymentStatus),
                PaymentDetail: registrationPaymentDetail(r) || '—',
                Timestamp: new Date(r.registeredAt).toLocaleString('en-GB'),
            });
        });
        if (rows.length === 0) return;
        exportToCSV(rows, `gatefy-roster-${ev.name.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}.csv`);
    };

    // ── LOGIN SCREEN ────────────────────────────────────────────────────────
    if (!sessionChecked) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white/40 text-[10px] uppercase tracking-widest">
                Loading…
            </div>
        );
    }

    if (!authed) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                <div className="absolute inset-0 opacity-30"
                    style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                        backgroundSize: '60px 60px',
                    }}
                />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />

                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="relative z-10 w-full max-w-md px-8"
                >
                    <div className="mb-16 text-center">
                        <div className="inline-flex items-center gap-3 mb-6">
                            <svg width="40" height="40" viewBox="0 0 28 28" fill="none" className="shrink-0">
                                <defs>
                                    <filter id="login-glow" x="-40%" y="-40%" width="180%" height="180%">
                                        <feGaussianBlur stdDeviation="1.2" result="blur" />
                                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                    </filter>
                                </defs>
                                <g filter="url(#login-glow)">
                                    <rect x="1" y="1" width="26" height="26" rx="1.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                                    <path d="M1 7 L1 1 L7 1" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M21 1 L27 1 L27 7" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M1 21 L1 27 L7 27" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M21 27 L27 27 L27 21" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <circle cx="14" cy="14" r="3" fill="rgba(255,255,255,1)" />
                                </g>
                            </svg>
                            <div className="flex flex-col items-start leading-none gap-1">
                                <span className="text-2xl font-semibold tracking-[0.12em] text-white">
                                    Gate <span className="text-white/65 font-medium">Protocol</span>
                                </span>
                            </div>
                        </div>
                        <p className="text-[10px] tracking-[0.4em] uppercase text-white/20 font-bold">Admin Terminal Access</p>
                    </div>

                    <div className="bg-white/[0.03] border border-white/10 p-10 backdrop-blur-xl">
                        {!adminConfigured && (
                            <p className="text-[9px] tracking-[0.2em] uppercase text-amber-400/90 font-bold mb-6 leading-relaxed">
                                Server misconfiguration: add <span className="font-mono">ADMIN_DASHBOARD_PASSWORD</span> to <span className="font-mono">.env.local</span>, then restart the dev server.
                            </p>
                        )}
                        <form onSubmit={handleLogin} className="space-y-8">
                            <div className="space-y-3">
                                <label className="block text-[9px] tracking-[0.35em] uppercase text-white/30 font-bold">Authorization Key</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => { setPassword(e.target.value); setAuthError(false); }}
                                    placeholder="Enter admin key..."
                                    className="w-full bg-black/40 border border-white/10 px-5 py-4 text-white text-sm font-mono tracking-widest placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                                    autoFocus
                                />
                                <AnimatePresence>
                                    {authError && (
                                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[9px] tracking-[0.3em] uppercase text-red-500/80 font-bold">
                                            ✗ Authorization Denied
                                        </motion.p>
                                    )}
                                </AnimatePresence>
                            </div>
                            <button type="submit" disabled={!adminConfigured} className="w-full bg-white text-black py-4 text-xs tracking-[0.25em] uppercase font-bold hover:bg-white/90 transition-colors active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none">
                                Authenticate
                            </button>
                        </form>
                        <p className="mt-8 text-center">
                            <Link href="/" className="text-[9px] tracking-[0.3em] uppercase text-white/30 hover:text-white font-bold">← Back to site</Link>
                        </p>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#070707] text-white selection:bg-white selection:text-black">
            {/* Header / Nav */}
            <header className="fixed top-0 left-0 right-0 z-[100] min-h-16 py-2 md:py-0 md:h-16 flex flex-wrap md:flex-nowrap items-center gap-y-2 px-3 sm:px-6 lg:px-12 border-b border-white/[0.04] bg-black/80 backdrop-blur-3xl">
                <div className="flex items-center gap-2 sm:gap-3 mr-3 sm:mr-6 lg:mr-12 shrink-0">
                    <Link href="/" className="text-[8px] tracking-[0.25em] uppercase text-white/35 hover:text-white font-bold hidden sm:inline">Home</Link>
                    <svg width="24" height="24" viewBox="0 0 28 28" fill="none" className="shrink-0 sm:w-7 sm:h-7">
                        <defs>
                            <filter id="admin-glow" x="-40%" y="-40%" width="180%" height="180%">
                                <feGaussianBlur stdDeviation="0.8" result="blur" />
                                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                        </defs>
                        <g filter="url(#admin-glow)">
                            <rect x="1" y="1" width="26" height="26" rx="1.5" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
                            <path d="M1 7 L1 1 L7 1" stroke="rgba(255,255,255,0.95)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="14" cy="14" r="3" fill="rgba(255,255,255,1)" />
                        </g>
                    </svg>
                    <div className="flex flex-col leading-none">
                        <span className="text-[10px] font-semibold tracking-[0.12em] text-white">
                            Gate <span className="text-white/65">Protocol</span>
                        </span>
                    </div>
                </div>

                <nav className="hidden md:flex items-center gap-2 min-w-0">
                    {(['overview', 'managers', 'attendance', 'events'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => {
                                setTab(t);
                                setSearchQuery('');
                                if (t !== 'events') {
                                    setSelectedOrganizerKey(null);
                                    setFilterType('all');
                                    setManagerHostFilter('all');
                                }
                            }}
                            className={`px-4 lg:px-6 py-2 text-[9px] tracking-[0.28em] lg:tracking-[0.35em] uppercase font-black transition-all ${tab === t
                                ? 'bg-white text-black'
                                : 'text-white/30 hover:text-white/70'}`}
                        >
                            {t === 'managers' ? 'Hosts' : t}
                        </button>
                    ))}
                </nav>

                <div className="order-3 md:order-none w-full md:w-auto md:hidden flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                    {(['overview', 'managers', 'attendance', 'events'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => {
                                setTab(t);
                                setSearchQuery('');
                                if (t !== 'events') {
                                    setSelectedOrganizerKey(null);
                                    setFilterType('all');
                                    setManagerHostFilter('all');
                                }
                            }}
                            className={`px-3 py-2 text-[8px] tracking-[0.18em] uppercase font-black transition-all whitespace-nowrap min-h-[36px] ${tab === t
                                ? 'bg-white text-black'
                                : 'text-white/30 border border-white/10'}`}
                        >
                            {t === 'managers' ? 'Hosts' : t}
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center gap-2 sm:gap-4 lg:gap-6 shrink-0">
                    <button
                        type="button"
                        onClick={() => void refreshAll()}
                        disabled={refreshing}
                        className="text-[8px] sm:text-[9px] tracking-[0.2em] uppercase text-white/40 hover:text-white font-bold border border-white/15 px-2.5 py-1.5 disabled:opacity-40"
                        title={lastRefreshed ? `Last refresh ${lastRefreshed.toLocaleTimeString()}` : 'Refresh data'}
                    >
                        {refreshing ? 'Sync…' : 'Refresh'}
                    </button>
                    <div className="hidden sm:flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-[9px] tracking-[0.2em] uppercase text-white/40 font-bold whitespace-nowrap">
                            Auth active
                        </span>
                    </div>
                    <button type="button" onClick={handleLogout} className="text-[9px] tracking-[0.2em] uppercase text-white/30 hover:text-red-400 transition-colors font-bold">Logout</button>
                </div>
            </header>

            <div className="pt-28 md:pt-24 pb-20 px-3 sm:px-6 lg:px-12 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr] gap-8 lg:gap-12">
                {/* Sidebar Stats Panel — horizontal scroll strip on mobile */}
                <aside className="lg:sticky lg:top-24 lg:h-fit space-y-4 lg:space-y-8 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] uppercase tracking-[0.35em] font-black text-white/25">System Summary</p>
                        {lastRefreshed ? (
                            <span className="text-[8px] font-mono text-white/25 tracking-wider">
                                {lastRefreshed.toLocaleTimeString()}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-visible no-scrollbar pb-1 lg:pb-0 -mx-1 px-1">
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="min-w-[140px] lg:min-w-0 shrink-0 p-5 sm:p-6 lg:p-8 border border-white/[0.06] bg-white/[0.02] relative overflow-hidden"
                        >
                            <p className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tighter mb-1 tabular-nums">
                                {attendance.length}
                            </p>
                            <p className="text-[8px] sm:text-[9px] tracking-[0.25em] uppercase text-white/50 font-bold">
                                Check-ins
                            </p>
                        </motion.div>

                        <div className="min-w-[120px] lg:min-w-0 shrink-0 p-4 sm:p-5 border border-white/[0.06] bg-white/[0.01]">
                            <p className="text-xl sm:text-2xl font-bold mb-1 tabular-nums">{platformStats.registrations}</p>
                            <p className="text-[8px] tracking-[0.2em] uppercase text-white/40 font-bold">Registrations</p>
                            <p className="text-[8px] font-mono text-emerald-400/85 mt-1.5">
                                {platformStats.paid} paid
                                {platformStats.pendingMobile > 0 ? ` · ${platformStats.pendingMobile} awaiting` : ''}
                            </p>
                        </div>

                        <div className="min-w-[120px] lg:min-w-0 shrink-0 p-4 sm:p-5 border border-white/[0.06] bg-white/[0.01]">
                            <p className="text-xl sm:text-2xl font-bold mb-1 tabular-nums">{platformStats.activeEvents}</p>
                            <p className="text-[8px] tracking-[0.2em] uppercase text-white/40 font-bold">Active events</p>
                            <p className="text-[8px] font-mono text-white/35 mt-1.5">
                                {events.length} total
                                {platformStats.cancelled > 0 ? ` · ${platformStats.cancelled} cancelled` : ''}
                            </p>
                        </div>

                        <div className="min-w-[120px] lg:min-w-0 shrink-0 p-4 sm:p-5 border border-white/[0.06] bg-white/[0.01]">
                            <p className="text-xl sm:text-2xl font-bold mb-1 tabular-nums">{organizerSummaries.length}</p>
                            <p className="text-[8px] tracking-[0.2em] uppercase text-white/40 font-bold">Event hosts</p>
                            <p className="text-[8px] font-mono text-white/35 mt-1.5">
                                W {platformStats.walletHosts} · E {platformStats.emailHosts}
                            </p>
                        </div>

                        <div className="min-w-[160px] lg:min-w-0 shrink-0 border border-white/[0.06] bg-white/[0.015] p-4 space-y-2">
                            <p className="text-[8px] uppercase tracking-[0.25em] font-black text-white/25">Network health</p>
                            <div className="flex justify-between text-[10px] font-mono">
                                <span className="text-white/45">Check-in rate</span>
                                <span className="text-white/85 font-bold tabular-nums">
                                    {platformStats.checkInRate != null ? `${platformStats.checkInRate}%` : '—'}
                                </span>
                            </div>
                            <div className="flex justify-between text-[10px] font-mono">
                                <span className="text-white/45">Proofs minted</span>
                                <span className="text-blue-300/90 font-bold tabular-nums">{platformStats.minted}</span>
                            </div>
                            <div className="flex justify-between text-[10px] font-mono">
                                <span className="text-white/45">Admin holds</span>
                                <span className="text-red-300/85 font-bold tabular-nums">{platformStats.adminCancelled}</span>
                            </div>
                        </div>
                    </div>

                    {tab === 'overview' ? (
                        <div className="hidden lg:grid grid-cols-2 gap-2">
                            {(
                                [
                                    { label: 'Hosts', t: 'managers' as Tab },
                                    { label: 'Attendance', t: 'attendance' as Tab },
                                    { label: 'Events', t: 'events' as Tab },
                                    { label: 'Overview', t: 'overview' as Tab },
                                ] as const
                            ).map((q) => (
                                <button
                                    key={q.t}
                                    type="button"
                                    onClick={() => setTab(q.t)}
                                    className={`px-3 py-2.5 text-[8px] uppercase tracking-widest font-black border transition-colors ${
                                        tab === q.t
                                            ? 'border-white bg-white text-black'
                                            : 'border-white/15 text-white/45 hover:text-white hover:border-white/30'
                                    }`}
                                >
                                    {q.label}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </aside>

                {/* Main Dynamic Panel */}
                <main>
                    {/* Search Bar */}
                    {tab !== 'overview' && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 sm:mb-12 space-y-4">
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder={
                                        tab === 'managers'
                                            ? 'Filter hosts by display name, wallet, email id, or event title…'
                                            : `Filter ${tab} data by address, ID, or name…`
                                    }
                                    className="w-full bg-white/[0.02] border border-white/[0.06] px-4 sm:px-6 py-3.5 sm:py-5 text-xs sm:text-sm font-mono tracking-wide sm:tracking-widest placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-all font-bold"
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                    {tab === 'attendance' && (
                                        <button
                                            type="button"
                                            onClick={() => exportAttendanceReport()}
                                            className="px-4 py-1 text-[8px] uppercase tracking-widest font-black font-mono transition-colors bg-white text-black hover:bg-neutral-200"
                                        >
                                            Export CSV
                                        </button>
                                    )}
                                    {tab === 'managers' && (
                                        <>
                                            <div className="flex bg-black p-1 border border-white/5">
                                                {(['all', 'wallet', 'email'] as const).map((f) => (
                                                    <button
                                                        key={f}
                                                        type="button"
                                                        onClick={() => setManagerHostFilter(f)}
                                                        className={`px-3 py-1 text-[8px] uppercase tracking-widest font-black font-mono transition-colors ${managerHostFilter === f ? 'bg-white text-black' : 'text-white/30'}`}
                                                    >
                                                        {f}
                                                    </button>
                                                ))}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => exportManagersCSV()}
                                                className="px-4 py-1 text-[8px] uppercase tracking-widest font-black font-mono bg-white text-black hover:bg-neutral-200"
                                            >
                                                Export CSV
                                            </button>
                                        </>
                                    )}
                                    {tab === 'events' && (
                                        <>
                                            <div className="flex bg-black p-1 border border-white/5">
                                                {(['all', 'vip', 'regular'] as const).map((f) => (
                                                    <button
                                                        key={f}
                                                        type="button"
                                                        onClick={() => setFilterType(f)}
                                                        className={`px-3 py-1 text-[8px] uppercase tracking-widest font-black font-mono transition-colors ${filterType === f ? 'bg-white text-black' : 'text-white/30'}`}
                                                    >
                                                        {f}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex bg-black p-1 border border-white/5">
                                                <span className="px-2 py-1 text-[7px] text-white/20 font-black uppercase self-center tracking-wider">hosts</span>
                                                {(['all', 'wallet', 'email'] as const).map((f) => (
                                                    <button
                                                        key={`h-${f}`}
                                                        type="button"
                                                        onClick={() => setManagerHostFilter(f)}
                                                        className={`px-2 py-1 text-[8px] uppercase tracking-widest font-black font-mono transition-colors ${managerHostFilter === f ? 'bg-emerald-600/90 text-white' : 'text-white/30'}`}
                                                    >
                                                        {f}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            {tab === 'events' && selectedOrganizerKey && (
                                <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono text-white/50">
                                    <span className="text-white/30 uppercase tracking-[0.2em] font-black">Pinned host:</span>
                                    <span className="px-2 py-1 border border-white/15 bg-white/[0.04] text-white/80 truncate max-w-md" title={selectedOrganizerKey}>
                                        {organizerSummaries.find((s) => s.organizer.toLowerCase() === selectedOrganizerKey.toLowerCase())
                                            ?.display ?? selectedOrganizerKey}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedOrganizerKey(null)}
                                        className="text-white/40 hover:text-white uppercase tracking-widest font-black"
                                    >
                                        Clear
                                    </button>
                                    <Link
                                        href="/"
                                        className="text-blue-400/90 hover:text-blue-300 uppercase tracking-widest font-black ml-2"
                                    >
                                        Public app →
                                    </Link>
                                </div>
                            )}
                            {tab === 'managers' && (
                                <p className="text-[9px] text-white/30 font-mono leading-relaxed max-w-3xl">
                                    <span className="text-white/50 font-bold uppercase tracking-[0.15em]">Note:</span>{' '}
                                    Wallet hosts are identified by on-chain addresses; email hosts use{' '}
                                    <code className="text-white/45">email:…</code> in storage. Organizer email is{' '}
                                    <span className="text-amber-400/70">browser-session based</span> on the site — admins see all events here regardless.
                                </p>
                            )}
                        </motion.div>
                    )}

                    <AnimatePresence mode="wait">
                        {/* OVERVIEW TAB */}
                        {tab === 'overview' && (
                            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10 sm:space-y-14">
                                <div className="space-y-3 sm:space-y-4">
                                    <h1 className="text-[clamp(2.25rem,8vw,4.5rem)] font-medium tracking-tighter italic leading-[0.95]">
                                        PROTOCOL DASHBOARD.
                                    </h1>
                                    <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.28em] sm:tracking-[0.45em] text-white/25 font-black">
                                        Gate Protocol · verification node
                                    </p>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setTab('events')}
                                            className="px-3 py-2 text-[8px] font-black uppercase tracking-widest border border-white/15 text-white/55 hover:text-white hover:border-white/35"
                                        >
                                            All events →
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTab('managers')}
                                            className="px-3 py-2 text-[8px] font-black uppercase tracking-widest border border-white/15 text-white/55 hover:text-white hover:border-white/35"
                                        >
                                            Hosts →
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTab('attendance')}
                                            className="px-3 py-2 text-[8px] font-black uppercase tracking-widest border border-white/15 text-white/55 hover:text-white hover:border-white/35"
                                        >
                                            Attendance →
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                                    {[
                                        { label: 'Paid tickets', value: platformStats.paid, tone: 'text-emerald-400/90' },
                                        { label: 'Awaiting mobile', value: platformStats.pendingMobile, tone: 'text-amber-400/90' },
                                        { label: 'Minted proofs', value: platformStats.minted, tone: 'text-blue-300/90' },
                                        { label: 'Admin cancels', value: platformStats.adminCancelled, tone: 'text-red-300/85' },
                                    ].map((m) => (
                                        <div key={m.label} className="border border-white/[0.06] bg-white/[0.015] px-3 py-3 sm:px-4 sm:py-4">
                                            <p className="text-[7px] sm:text-[8px] uppercase tracking-widest text-white/30 font-bold">{m.label}</p>
                                            <p className={`text-xl sm:text-2xl font-black tabular-nums mt-1 ${m.tone}`}>{m.value}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                                    <div className="space-y-4 sm:space-y-5 min-w-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-[10px] uppercase tracking-[0.35em] font-black text-white/25">Recent activity</p>
                                            <button
                                                type="button"
                                                onClick={() => setTab('attendance')}
                                                className="text-[8px] uppercase tracking-widest text-white/35 hover:text-white font-bold"
                                            >
                                                Full log
                                            </button>
                                        </div>
                                        <div className="border border-white/[0.06] bg-white/[0.01] divide-y divide-white/[0.04]">
                                            {recentActivity.length === 0 ? (
                                                <div className="p-10 sm:p-12 text-center text-white/20 text-[10px] uppercase tracking-widest italic">
                                                    Stream idle
                                                </div>
                                            ) : (
                                                recentActivity.map((act, i) => {
                                                    const evName = act.eventId
                                                        ? events.find((e) => e.id.toLowerCase() === act.eventId!.toLowerCase())?.name
                                                        : null;
                                                    const minted = (act.mintStatus ?? '').toLowerCase() === 'minted';
                                                    const mintExplorer = explorerUrlForMint(act.mintChain, act.mintTxHash);
                                                    const chainLabel = (act.mintChain || 'soroban').toLowerCase();
                                                    return (
                                                        <div
                                                            key={`${act.code}-${act.checkedInAt}-${i}`}
                                                            className="p-4 sm:p-5 flex items-start sm:items-center justify-between gap-3 group hover:bg-white/[0.015] transition-colors"
                                                        >
                                                            <div className="flex items-start gap-3 min-w-0">
                                                                <div className="w-1.5 h-1.5 mt-1.5 shrink-0 bg-blue-400 rounded-full" />
                                                                <div className="min-w-0">
                                                                    <p className="text-[11px] font-mono text-white/85 truncate">
                                                                        {shortIdentity(act.wallet, act.email)}
                                                                    </p>
                                                                    <p className="text-[8px] tracking-[0.16em] uppercase text-white/30 font-bold mt-1 truncate">
                                                                        Verified @ {act.code}
                                                                        {evName ? ` · ${evName}` : ''}
                                                                    </p>
                                                                    {minted ? (
                                                                        <p className="text-[8px] font-mono text-blue-300/80 mt-1">
                                                                            Minted{act.mintTokenId ? ` #${act.mintTokenId}` : ''}
                                                                            {' · '}
                                                                            {mintExplorer ? (
                                                                                <a
                                                                                    href={mintExplorer}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="underline underline-offset-2 decoration-blue-400/50 hover:text-blue-200 hover:decoration-blue-200"
                                                                                    title="Verify mint on explorer"
                                                                                >
                                                                                    {chainLabel}
                                                                                </a>
                                                                            ) : (
                                                                                <span>{chainLabel}</span>
                                                                            )}
                                                                            {mintExplorer ? (
                                                                                <>
                                                                                    {' · '}
                                                                                    <a
                                                                                        href={mintExplorer}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="text-white/45 hover:text-white underline underline-offset-2"
                                                                                    >
                                                                                        verify tx
                                                                                    </a>
                                                                                </>
                                                                            ) : null}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                            <span className="text-[9px] font-mono text-white/25 shrink-0 tabular-nums">
                                                                {new Date(act.checkedInAt).toLocaleString('en-GB', {
                                                                    day: '2-digit',
                                                                    month: 'short',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit',
                                                                })}
                                                            </span>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-4 sm:space-y-5 min-w-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-[10px] uppercase tracking-[0.35em] font-black text-white/25">Event pool density</p>
                                            <button
                                                type="button"
                                                onClick={() => setTab('events')}
                                                className="text-[8px] uppercase tracking-widest text-white/35 hover:text-white font-bold"
                                            >
                                                Manage
                                            </button>
                                        </div>
                                        <div className="border border-white/[0.06] bg-white/[0.01] p-5 sm:p-7 space-y-6">
                                            {densestEvents.map((ev) => {
                                                const reg = ev.registrationCount ?? ev.attendeeCount;
                                                const cap = ev.maxAttendees && ev.maxAttendees > 0 ? ev.maxAttendees : Math.max(reg, 1);
                                                const pct = Math.min((ev.attendeeCount / cap) * 100, 100);
                                                return (
                                                    <button
                                                        key={ev.id}
                                                        type="button"
                                                        onClick={() => {
                                                            openEventRoster(ev);
                                                            setTab('events');
                                                        }}
                                                        className="w-full space-y-2.5 text-left group"
                                                    >
                                                        <div className="flex justify-between items-end gap-3">
                                                            <p className="text-xs font-bold tracking-tight uppercase truncate group-hover:text-white text-white/85">
                                                                {ev.name}
                                                            </p>
                                                            <p className="text-[10px] font-mono text-white/45 shrink-0 tabular-nums">
                                                                {ev.attendeeCount}
                                                                {ev.maxAttendees != null && ev.maxAttendees > 0
                                                                    ? ` / ${ev.maxAttendees}`
                                                                    : ' verified'}
                                                                {reg > ev.attendeeCount ? ` · ${reg} reg` : ''}
                                                            </p>
                                                        </div>
                                                        <div className="h-[3px] w-full bg-white/10 relative overflow-hidden">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${pct}%` }}
                                                                transition={{ duration: 0.55 }}
                                                                className="absolute inset-y-0 left-0 bg-blue-400/90"
                                                            />
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                            {densestEvents.length === 0 && (
                                                <p className="text-[10px] text-white/20 italic text-center py-10">No active pools</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* EVENT HOSTS (organizers) */}
                        {tab === 'managers' && (
                            <motion.div key="managers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                                <div className="space-y-2">
                                    <h2 className="text-3xl font-black tracking-tighter uppercase text-white/90">Event hosts</h2>
                                    <p className="text-[10px] uppercase tracking-[0.35em] text-white/25 font-black">
                                        Unique wallet and email-session organizers · click a row to open their events
                                    </p>
                                </div>
                                <div className="border border-white/[0.06] divide-y divide-white/[0.06]">
                                    {filteredOrganizerSummaries.length === 0 ? (
                                        <div className="p-16 text-center text-white/25 text-[10px] uppercase tracking-widest">
                                            No hosts match this filter
                                        </div>
                                    ) : (
                                        filteredOrganizerSummaries.map((row, i) => (
                                            <motion.div
                                                key={row.organizer}
                                                role="button"
                                                tabIndex={0}
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.03 }}
                                                onClick={() => openHostEvents(row.organizer)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        openHostEvents(row.organizer);
                                                    }
                                                }}
                                                className="px-5 py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 hover:bg-white/[0.03] cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
                                            >
                                                <div className="space-y-2 min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span
                                                            className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 border ${
                                                                row.hostType === 'wallet'
                                                                    ? 'border-white/25 text-white/80 bg-white/[0.04]'
                                                                    : 'border-emerald-500/35 text-emerald-400/90 bg-emerald-500/10'
                                                            }`}
                                                        >
                                                            {row.hostType === 'wallet' ? 'Wallet host' : 'Email host'}
                                                        </span>
                                                    </div>
                                                    <p className="text-lg font-bold tracking-tight text-white truncate" title={row.display}>
                                                        {row.display}
                                                    </p>
                                                    <p className="text-[10px] font-mono text-white/35 truncate" title={row.organizer}>
                                                        {row.organizer}
                                                    </p>
                                                    <p className="text-[9px] text-white/25 font-mono line-clamp-2">
                                                        Events:{' '}
                                                        <span className="text-white/45">
                                                            {row.events.map((e) => e.name).join(' · ')}
                                                        </span>
                                                    </p>
                                                </div>
                                                <div className="flex flex-wrap gap-3 sm:gap-6 shrink-0 text-[10px] font-mono text-white/50 items-center">
                                                    <div>
                                                        <p className="text-[8px] uppercase tracking-wider text-white/25 mb-0.5">Events</p>
                                                        <p className="text-white font-bold">{row.events.length}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[8px] uppercase tracking-wider text-white/25 mb-0.5">Registrations</p>
                                                        <p className="text-white font-bold">{row.registrationCount}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[8px] uppercase tracking-wider text-white/25 mb-0.5">Check-ins</p>
                                                        <p className="text-blue-400/90 font-bold">{row.verifiedCheckins}</p>
                                                    </div>
                                                    {row.events[0] ? (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openContactHost(row.events[0]);
                                                            }}
                                                            className="self-center px-3 py-2 border border-blue-400/35 text-blue-200/90 text-[8px] font-black uppercase tracking-widest hover:bg-blue-500/10"
                                                        >
                                                            Contact
                                                        </button>
                                                    ) : null}
                                                    <span className="self-center px-3 py-2 border border-white/15 text-[8px] font-black uppercase tracking-widest text-white/50">
                                                        Open →
                                                    </span>
                                                </div>
                                            </motion.div>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* ATTENDANCE TAB */}
                        {tab === 'attendance' && (
                            <motion.div key="attendance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                                <div className="border border-white/[0.06] overflow-x-auto">
                                    <div className="min-w-[920px]">
                                    <div className="grid grid-cols-[1fr_140px_120px_200px_140px] px-4 sm:px-8 py-4 border-b border-white/[0.08] bg-white/[0.03]">
                                        <span className="text-[9px] tracking-[0.4em] uppercase text-white/40 font-black">Wallet / email</span>
                                        <span className="text-[9px] tracking-[0.4em] uppercase text-white/40 font-black">Event / Source</span>
                                        <span className="text-[9px] tracking-[0.4em] uppercase text-white/40 font-black">Auth Code</span>
                                        <span className="text-[9px] tracking-[0.4em] uppercase text-white/40 font-black">Mint / verify</span>
                                        <span className="text-[9px] tracking-[0.4em] uppercase text-white/40 font-black">Timestamp</span>
                                    </div>
                                    <div className="divide-y divide-white/[0.04]">
                                        {attendanceSectionIds.length === 0 && filteredAttendance.length === 0 ? (
                                            <div className="p-20 text-center opacity-20 italic">No entry logs matching query</div>
                                        ) : (
                                            attendanceSectionIds.map((eventId) => {
                                                const ev = eventId === LEGACY_EVENT_KEY ? undefined : events.find(e => e.id === eventId || e.id.toLowerCase() === eventId.toLowerCase());
                                                const records = groupedAttendance[eventId] || [];
                                                const sortedRecords = [...records].sort((a, b) =>
                                                    new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime()
                                                );
                                                const registeredOnly = getRegisteredOnly(eventId);
                                                const isCollapsed = attendanceCollapsed[eventId];
                                                const verifiedCount = sortedRecords.length;
                                                const notVerifiedCount = registeredOnly.length;
                                                return (
                                                    <div key={eventId} className="border-t border-white/[0.04]">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleAttendanceSection(eventId)}
                                                            className="w-full px-8 py-3 bg-white/[0.02] flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-white/50 transition-transform inline-block" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>
                                                                    ▼
                                                                </span>
                                                                <div className="flex flex-col">
                                                                    <span className="text-[9px] tracking-[0.4em] uppercase text-white/50 font-black">
                                                                        {ev?.name || 'Legacy check-ins'}
                                                                    </span>
                                                                    {ev && (
                                                                        <span className="text-[9px] font-mono text-white/30">
                                                                            {ev.location || 'Distributed Node'} · {new Date(ev.date).toLocaleDateString('en-GB', {
                                                                                day: '2-digit', month: 'short', year: 'numeric'
                                                                            })}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-4 text-[9px] font-mono text-white/40">
                                                                <span>{verifiedCount} verified</span>
                                                                {notVerifiedCount > 0 && (
                                                                    <span className="text-amber-400/80">{notVerifiedCount} registered, not verified</span>
                                                                )}
                                                            </div>
                                                        </button>
                                                        <AnimatePresence>
                                                            {!isCollapsed && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: 'auto', opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    transition={{ duration: 0.2 }}
                                                                    className="overflow-hidden"
                                                                >
                                                                    {sortedRecords.length > 0 && (
                                                                        <div className="px-8 py-2 bg-blue-500/5 border-t border-blue-500/10 flex items-center gap-2">
                                                                            <span className="text-[9px] tracking-[0.3em] uppercase text-blue-300/90 font-black">Verified check-ins</span>
                                                                            <span className="text-[9px] font-mono text-blue-300/50">{sortedRecords.length}</span>
                                                                        </div>
                                                                    )}
                                                                    {sortedRecords.map((record, i) => (
                                                                        <div
                                                                            key={`${eventId}-v-${i}`}
                                                                            role="button"
                                                                            tabIndex={0}
                                                                            onClick={() => {
                                                                                if (!ev) return;
                                                                                openEventRoster(ev);
                                                                                setRosterPerson({ kind: 'verified', row: record });
                                                                            }}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                                    e.preventDefault();
                                                                                    if (!ev) return;
                                                                                    openEventRoster(ev);
                                                                                    setRosterPerson({ kind: 'verified', row: record });
                                                                                }
                                                                            }}
                                                                            className="w-full grid grid-cols-[1fr_140px_120px_200px_140px] px-8 py-5 items-center hover:bg-white/[0.03] transition-colors group border-t border-white/[0.02] text-left cursor-pointer"
                                                                        >
                                                                            <span className="font-mono text-xs text-white/60 group-hover:text-white transition-colors">
                                                                                {shortIdentity(record.wallet, record.email)}
                                                                            </span>
                                                                            <span className="text-[10px] uppercase tracking-wider text-white/40">
                                                                                {ev?.name ||
                                                                                    (record.eventId
                                                                                        ? events.find(
                                                                                              (e) =>
                                                                                                  e.id.toLowerCase() ===
                                                                                                  record.eventId!.toLowerCase()
                                                                                          )?.name || 'Unscoped'
                                                                                        : 'Legacy_Entry')}
                                                                            </span>
                                                                            <span className="font-mono text-sm tracking-[0.2em] text-blue-400 font-bold">{record.code}</span>
                                                                            <span onClick={(e) => e.stopPropagation()}>
                                                                                {renderMintVerify(record)}
                                                                            </span>
                                                                            <span className="text-[10px] text-white/20 font-mono flex items-center justify-between gap-2">
                                                                                {new Date(record.checkedInAt).toLocaleString('en-GB', {
                                                                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                                                                })}
                                                                                <span className="text-[8px] uppercase tracking-widest text-white/25 group-hover:text-white/50">Details</span>
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                    {registeredOnly.length > 0 && (
                                                                        <>
                                                                            <div className="px-8 py-2 bg-amber-500/5 border-t border-amber-500/10 flex items-center gap-2">
                                                                                <span className="text-[9px] tracking-[0.3em] uppercase text-amber-400/90 font-black">Registered but not verified</span>
                                                                                <span className="text-[9px] font-mono text-amber-400/50">{registeredOnly.length}</span>
                                                                            </div>
                                                                            {registeredOnly.map((reg, i) => (
                                                                                <div
                                                                                    key={`${eventId}-r-${i}`}
                                                                                    role="button"
                                                                                    tabIndex={0}
                                                                                    onClick={() => {
                                                                                        if (!ev) return;
                                                                                        openEventRoster(ev);
                                                                                        setRosterPerson({ kind: 'pending', row: reg });
                                                                                    }}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                                                            e.preventDefault();
                                                                                            if (!ev) return;
                                                                                            openEventRoster(ev);
                                                                                            setRosterPerson({ kind: 'pending', row: reg });
                                                                                        }
                                                                                    }}
                                                                                    className="grid grid-cols-[1fr_140px_120px_200px_140px] px-8 py-4 items-center hover:bg-white/[0.03] transition-colors group border-t border-white/[0.02] cursor-pointer"
                                                                                >
                                                                                    <span className="font-mono text-xs text-white/50 group-hover:text-white/70 transition-colors">
                                                                                        {shortIdentity(reg.wallet, reg.email)}
                                                                                    </span>
                                                                                    <span className="text-[10px] uppercase tracking-wider text-amber-400/60">
                                                                                        {ev?.name ?? reg.eventId}
                                                                                    </span>
                                                                                    <span className="font-mono text-[10px] text-white/35 leading-tight">
                                                                                        {!isPaidRegistration(reg.paymentStatus)
                                                                                            ? '—'
                                                                                            : (
                                                                                                  <>
                                                                                                      <span className="block text-amber-400/80">{registrationPaymentLabel(reg.paymentStatus)}</span>
                                                                                                      {registrationPaymentDetail(reg) && (
                                                                                                          <span className="block truncate text-white/25 text-[9px]" title={registrationPaymentDetail(reg)}>
                                                                                                              {shortHash(registrationPaymentDetail(reg)) || registrationPaymentDetail(reg)}
                                                                                                          </span>
                                                                                                      )}
                                                                                                  </>
                                                                                              )}
                                                                                    </span>
                                                                                    <span className="text-white/20 text-[9px]">—</span>
                                                                                    <span className="text-[10px] text-white/20 font-mono flex items-center justify-between gap-2">
                                                                                        Registered {new Date(reg.registeredAt).toLocaleString('en-GB', {
                                                                                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                                                                        })}
                                                                                        <span className="text-[8px] uppercase tracking-widest text-white/25 group-hover:text-white/50">Details</span>
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                        </>
                                                                    )}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* EVENTS TAB */}
                        {tab === 'events' && (
                            <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                                <div className="grid grid-cols-1 gap-2">
                                    {filteredEvents.map((ev, i) => (
                                        <motion.div
                                            key={ev.id}
                                            role="button"
                                            tabIndex={0}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            onClick={() => openEventRoster(ev)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    openEventRoster(ev);
                                                }
                                            }}
                                            className="px-4 py-3 border border-white/[0.06] bg-white/[0.01] group hover:bg-white/[0.06] transition-all flex items-center justify-between gap-4 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                                        >
                                            <div className="space-y-2 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className={`w-1 h-1 shrink-0 rounded-full ${ev.cancelledAt ? 'bg-red-500' : new Date(ev.date) >= new Date() ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`} />
                                                    <h3 className="text-sm font-bold tracking-tight group-hover:tracking-wide transition-all uppercase truncate">{ev.name}</h3>
                                                    {ev.isVip && <span className="text-[7px] px-1.5 py-0.5 border border-yellow-500/30 text-yellow-500 font-black tracking-widest uppercase bg-yellow-500/5">VIP Exclusive</span>}
                                                    {ev.cancelledAt ? (
                                                        <span className="text-[7px] px-1.5 py-0.5 border border-red-500/35 text-red-300 font-black tracking-widest uppercase bg-red-500/10">
                                                            {ev.cancelledByAdmin ? 'Admin cancel' : 'Cancelled'}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <div className="flex flex-wrap gap-x-5 gap-y-1">
                                                    <div className="space-y-0.5">
                                                        <p className="text-[7px] uppercase tracking-[0.2em] text-white/30 font-bold">Location</p>
                                                        <p className="text-[9px] font-mono text-white/60 uppercase">{ev.location || 'N/A'}</p>
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <p className="text-[7px] uppercase tracking-[0.2em] text-white/30 font-bold">Event host</p>
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <span
                                                                className={`text-[7px] font-black uppercase tracking-wider px-1 py-0.5 ${
                                                                    isEmailOrganizerId(ev.organizer)
                                                                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                                                        : 'bg-white/[0.06] text-white/70 border border-white/10'
                                                                }`}
                                                            >
                                                                {isEmailOrganizerId(ev.organizer) ? 'Email' : 'Wallet'}
                                                            </span>
                                                            <p className="text-[9px] font-mono text-white/60 truncate max-w-[200px]" title={formatOrganizerShort(ev)}>
                                                                {formatOrganizerShort(ev)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <p className="text-[7px] uppercase tracking-[0.2em] text-white/30 font-bold">Ticket</p>
                                                        <p className="text-[9px] font-mono text-white/60">
                                                            {formatEventTicketSummary(ev)}
                                                        </p>
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <p className="text-[7px] uppercase tracking-[0.2em] text-white/30 font-bold">Verified</p>
                                                        <p className="text-[9px] font-mono text-white/60">{ev.attendeeCount} check-ins</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="shrink-0 flex flex-col sm:flex-row gap-1.5">
                                                {ev.cancelledAt ? (
                                                    <button
                                                        type="button"
                                                        disabled={cancelBusyId === ev.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void setAdminEventCancelled(ev, false);
                                                        }}
                                                        className="px-3 py-1.5 border border-emerald-500/30 text-emerald-300/90 hover:bg-emerald-500/10 text-[8px] font-black tracking-[0.25em] uppercase transition-all whitespace-nowrap disabled:opacity-50"
                                                    >
                                                        {cancelBusyId === ev.id ? '…' : 'Restore'}
                                                    </button>
                                                ) : isPast(ev.date, ev.endDate) ? (
                                                    <span className="px-3 py-1.5 border border-white/10 text-white/30 text-[8px] font-black tracking-[0.25em] uppercase whitespace-nowrap">
                                                        Past — no cancel
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        disabled={cancelBusyId === ev.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void setAdminEventCancelled(ev, true);
                                                        }}
                                                        className="px-3 py-1.5 border border-red-500/35 text-red-300/90 hover:bg-red-500/10 text-[8px] font-black tracking-[0.25em] uppercase transition-all whitespace-nowrap disabled:opacity-50"
                                                    >
                                                        {cancelBusyId === ev.id ? '…' : 'Cancel'}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openContactHost(ev);
                                                    }}
                                                    className="px-3 py-1.5 border border-blue-400/35 text-blue-200/90 hover:bg-blue-500/10 text-[8px] font-black tracking-[0.25em] uppercase transition-all whitespace-nowrap"
                                                >
                                                    Contact
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setSelectedEventQR(ev);
                                                    }}
                                                    className="px-3 py-1.5 border border-white/10 hover:bg-white hover:text-black text-[8px] font-black tracking-[0.25em] uppercase transition-all whitespace-nowrap"
                                                >
                                                    Pool QR
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                    {filteredEvents.length === 0 && (
                                        <div className="p-20 border border-dashed border-white/10 text-center opacity-20 italic">No events matching query</div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </main>
            </div>

            {/* Event roster — registrations & verified */}
            <AnimatePresence>
                {selectedEventDetail && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[290] bg-black/90 backdrop-blur-3xl flex items-center justify-center p-4 sm:p-8"
                        onClick={e => {
                            if (e.target === e.currentTarget) {
                                setSelectedEventDetail(null);
                                setRosterPerson(null);
                                setRosterQuery('');
                                setRosterFilter('');
                            }
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="w-full max-w-3xl max-h-[90vh] border border-white/10 bg-[#0a0a0a] flex flex-col shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="shrink-0 p-5 sm:p-6 border-b border-white/[0.06] flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 space-y-1">
                                    <p className="text-[9px] tracking-[0.45em] uppercase text-blue-400/90 font-black">Event roster</p>
                                    <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase truncate">{selectedEventDetail.name}</h2>
                                    <p className="text-[10px] font-mono text-white/35">
                                        {selectedEventDetail.location || '—'} · {new Date(selectedEventDetail.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </p>
                                    {selectedEventDetail.cancelledAt ? (
                                        <p className="text-[10px] text-red-300/90 font-mono">
                                            Cancelled{selectedEventDetail.cancelledByAdmin ? ' by admin' : ''}
                                            {selectedEventDetail.cancelReason
                                                ? ` · ${selectedEventDetail.cancelReason}`
                                                : ''}
                                        </p>
                                    ) : null}
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span
                                                className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 border ${
                                                    isEmailOrganizerId(selectedEventDetail.organizer)
                                                        ? 'border-emerald-500/35 text-emerald-400 bg-emerald-500/10'
                                                        : 'border-white/20 text-white/70 bg-white/[0.04]'
                                                }`}
                                            >
                                                {isEmailOrganizerId(selectedEventDetail.organizer) ? 'Email host' : 'Wallet host'}
                                            </span>
                                        </div>
                                        <p className="text-sm font-mono text-white/60 truncate" title={formatOrganizerShort(selectedEventDetail)}>
                                            {formatOrganizerShort(selectedEventDetail)}
                                        </p>
                                        <p className="text-[9px] font-mono text-white/25 truncate" title={selectedEventDetail.organizer}>
                                            {selectedEventDetail.organizer}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                    {selectedEventDetail.cancelledAt ? (
                                        <button
                                            type="button"
                                            disabled={cancelBusyId === selectedEventDetail.id}
                                            onClick={() => void setAdminEventCancelled(selectedEventDetail, false)}
                                            className="px-3 py-2 border border-emerald-500/35 text-emerald-300 text-[8px] font-black tracking-[0.2em] uppercase hover:bg-emerald-500/10 disabled:opacity-50"
                                        >
                                            Restore event
                                        </button>
                                    ) : isPast(selectedEventDetail.date, selectedEventDetail.endDate) ? (
                                        <span className="px-3 py-2 border border-white/10 text-white/35 text-[8px] font-black tracking-[0.2em] uppercase">
                                            Past — cannot cancel
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={cancelBusyId === selectedEventDetail.id}
                                            onClick={() => void setAdminEventCancelled(selectedEventDetail, true)}
                                            className="px-3 py-2 border border-red-500/40 text-red-300 text-[8px] font-black tracking-[0.2em] uppercase hover:bg-red-500/10 disabled:opacity-50"
                                        >
                                            Cancel (misconduct)
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => openContactHost(selectedEventDetail)}
                                        className="px-3 py-2 border border-blue-400/40 text-blue-200 text-[8px] font-black tracking-[0.2em] uppercase hover:bg-blue-500/10"
                                    >
                                        Contact host
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => exportEventRoster(selectedEventDetail)}
                                        className="px-3 py-2 bg-white text-black text-[8px] font-black tracking-[0.2em] uppercase hover:bg-neutral-200"
                                    >
                                        Export CSV
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedEventQR(selectedEventDetail);
                                        }}
                                        className="px-3 py-2 border border-white/15 text-[8px] font-black tracking-[0.2em] uppercase text-white/70 hover:bg-white/5"
                                    >
                                        Pool QR
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedEventDetail(null);
                                            setRosterPerson(null);
                                            setRosterQuery('');
                                            setRosterFilter('');
                                        }}
                                        className="px-3 py-2 text-[8px] font-black tracking-[0.2em] uppercase text-white/40 hover:text-white"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            <div className="shrink-0 px-5 sm:px-6 py-3 border-b border-white/[0.04] space-y-3">
                                <div className="flex flex-wrap gap-3 text-[9px] font-mono text-white/50">
                                    <span className="text-white/80 font-bold">
                                        {registrations.filter(r => (r.eventId ?? '').toLowerCase() === selectedEventDetail.id.toLowerCase()).length} registered
                                    </span>
                                    <span>·</span>
                                    <span>{rosterVerifiedAll.length} verified</span>
                                    <span>·</span>
                                    <span className="text-amber-400/90">{rosterPendingAll.length} pending check-in</span>
                                    {selectedEventDetail.maxAttendees != null && selectedEventDetail.maxAttendees > 0 && (
                                        <>
                                            <span>·</span>
                                            <span>Cap {selectedEventDetail.maxAttendees}</span>
                                        </>
                                    )}
                                    {formatEventTicketSummary(selectedEventDetail) !== 'Free' ? (
                                        <>
                                            <span>·</span>
                                            <span className="text-cyan-400/85">
                                                {formatEventTicketSummary(selectedEventDetail)}
                                            </span>
                                        </>
                                    ) : null}
                                </div>
                                <form
                                    className="flex flex-col sm:flex-row gap-2"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        applyRosterSearch();
                                    }}
                                >
                                    <input
                                        type="search"
                                        value={rosterQuery}
                                        onChange={(e) => setRosterQuery(e.target.value)}
                                        placeholder="Search user by email, wallet, code, or mint tx…"
                                        className="flex-1 min-w-0 bg-white/[0.03] border border-white/10 px-3 py-2.5 text-[11px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400/40"
                                    />
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            type="submit"
                                            className="px-4 py-2.5 bg-white text-black text-[8px] font-black tracking-[0.2em] uppercase hover:bg-neutral-200"
                                        >
                                            Search
                                        </button>
                                        {rosterFilter ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setRosterQuery('');
                                                    setRosterFilter('');
                                                    setRosterPerson(null);
                                                }}
                                                className="px-3 py-2.5 border border-white/15 text-[8px] font-black tracking-[0.2em] uppercase text-white/50 hover:text-white"
                                            >
                                                Clear
                                            </button>
                                        ) : null}
                                    </div>
                                </form>
                                {rosterFilter ? (
                                    <p className="text-[9px] font-mono text-white/35">
                                        Showing {rosterVerified.length + rosterPending.length} match
                                        {rosterVerified.length + rosterPending.length === 1 ? '' : 'es'} for “{rosterFilter}”
                                    </p>
                                ) : null}
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto">
                                <div className="p-5 sm:p-6 space-y-8 pb-10">
                                    {rosterPerson ? (
                                        <section className="border border-blue-400/25 bg-blue-500/[0.04] p-4 sm:p-5 space-y-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-[9px] tracking-[0.35em] uppercase font-black text-blue-300/90 mb-1">User details</p>
                                                    <p className="text-[10px] font-mono text-white/40">
                                                        {rosterPerson.kind === 'verified' ? 'Verified check-in' : 'Registered — pending check-in'}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setRosterPerson(null)}
                                                    className="text-[8px] font-black tracking-[0.2em] uppercase text-white/40 hover:text-white"
                                                >
                                                    Close details
                                                </button>
                                            </div>
                                            {(() => {
                                                const verified = rosterPerson.kind === 'verified' ? rosterPerson.row : null;
                                                const pending = rosterPerson.kind === 'pending' ? rosterPerson.row : null;
                                                const linkedReg = verified
                                                    ? findRegistrationForAttendance(selectedEventDetail.id, verified)
                                                    : pending;
                                                const mintExplorer = verified
                                                    ? explorerUrlForMint(verified.mintChain, verified.mintTxHash)
                                                    : null;
                                                return (
                                                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[10px] font-mono">
                                                        <div className="sm:col-span-2">
                                                            <dt className="text-[8px] uppercase tracking-wider text-white/30 mb-0.5">Email</dt>
                                                            <dd className="text-white/85 break-all">
                                                                {(verified?.email || linkedReg?.email || '—').trim() || '—'}
                                                            </dd>
                                                        </div>
                                                        <div className="sm:col-span-2">
                                                            <dt className="text-[8px] uppercase tracking-wider text-white/30 mb-0.5">Wallet</dt>
                                                            <dd className="text-white/85 break-all">
                                                                {(verified?.wallet || linkedReg?.wallet || '—').trim() || '—'}
                                                            </dd>
                                                        </div>
                                                        <div>
                                                            <dt className="text-[8px] uppercase tracking-wider text-white/30 mb-0.5">Name</dt>
                                                            <dd className="text-white/70">{linkedReg?.name?.trim() || '—'}</dd>
                                                        </div>
                                                        <div>
                                                            <dt className="text-[8px] uppercase tracking-wider text-white/30 mb-0.5">Auth code</dt>
                                                            <dd className="text-blue-300 font-bold tracking-wider">{verified?.code || '—'}</dd>
                                                        </div>
                                                        <div>
                                                            <dt className="text-[8px] uppercase tracking-wider text-white/30 mb-0.5">Registered</dt>
                                                            <dd className="text-white/60">
                                                                {linkedReg
                                                                    ? new Date(linkedReg.registeredAt).toLocaleString('en-GB')
                                                                    : '—'}
                                                            </dd>
                                                        </div>
                                                        <div>
                                                            <dt className="text-[8px] uppercase tracking-wider text-white/30 mb-0.5">Checked in</dt>
                                                            <dd className="text-white/60">
                                                                {verified
                                                                    ? new Date(verified.checkedInAt).toLocaleString('en-GB')
                                                                    : '—'}
                                                            </dd>
                                                        </div>
                                                        <div>
                                                            <dt className="text-[8px] uppercase tracking-wider text-white/30 mb-0.5">Payment</dt>
                                                            <dd className="text-white/70">
                                                                {linkedReg
                                                                    ? registrationPaymentLabel(linkedReg.paymentStatus)
                                                                    : '—'}
                                                            </dd>
                                                        </div>
                                                        <div>
                                                            <dt className="text-[8px] uppercase tracking-wider text-white/30 mb-0.5">Payment detail</dt>
                                                            <dd className="text-white/60 break-all">
                                                                {linkedReg ? registrationPaymentDetail(linkedReg) || '—' : '—'}
                                                            </dd>
                                                        </div>
                                                        <div className="sm:col-span-2 border-t border-white/[0.06] pt-3 mt-1 space-y-2">
                                                            <dt className="text-[8px] uppercase tracking-wider text-white/30">Mint / verify</dt>
                                                            <dd className="space-y-2">
                                                                {verified ? (
                                                                    <>
                                                                        <div>{renderMintVerify(verified)}</div>
                                                                        <p className="text-white/45 break-all">
                                                                            Chain: {(verified.mintChain || '—').toLowerCase()}
                                                                            {verified.mintTokenId ? ` · Token #${verified.mintTokenId}` : ''}
                                                                        </p>
                                                                        <p className="text-white/45 break-all">
                                                                            Tx: {verified.mintTxHash || '—'}
                                                                        </p>
                                                                        {mintExplorer ? (
                                                                            <a
                                                                                href={mintExplorer}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="inline-block text-blue-300 underline underline-offset-2 hover:text-blue-200"
                                                                            >
                                                                                Open on explorer →
                                                                            </a>
                                                                        ) : null}
                                                                    </>
                                                                ) : (
                                                                    <span className="text-white/30">Not minted — pending check-in</span>
                                                                )}
                                                            </dd>
                                                        </div>
                                                    </dl>
                                                );
                                            })()}
                                        </section>
                                    ) : null}

                                    <section>
                                        <h3 className="text-[9px] tracking-[0.35em] uppercase font-black text-white/30 mb-3">
                                            Verified check-ins
                                            {rosterFilter ? (
                                                <span className="ml-2 text-white/25 font-mono normal-case tracking-normal">
                                                    {rosterVerified.length}/{rosterVerifiedAll.length}
                                                </span>
                                            ) : null}
                                        </h3>
                                        {rosterVerifiedAll.length === 0 ? (
                                            <p className="text-[10px] text-white/20 italic py-6 border border-dashed border-white/10 text-center">No verified entries yet</p>
                                        ) : rosterVerified.length === 0 ? (
                                            <p className="text-[10px] text-white/20 italic py-6 border border-dashed border-white/10 text-center">No verified matches for this search</p>
                                        ) : (
                                            <ul className="border border-white/[0.06] divide-y divide-white/[0.04]">
                                                {rosterVerified.map((row, idx) => (
                                                    <li key={`${row.code}-${idx}`}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setRosterPerson({ kind: 'verified', row })}
                                                            className="w-full text-left px-4 py-3 flex flex-col gap-2 text-[10px] font-mono hover:bg-white/[0.04] transition-colors"
                                                        >
                                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                                <span className="text-white/80">{shortIdentity(row.wallet, row.email)}</span>
                                                                <span className="text-blue-400/90 font-bold tracking-wider">{row.code}</span>
                                                                <span className="text-white/30">
                                                                    {new Date(row.checkedInAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div>{renderMintVerify(row)}</div>
                                                                <span className="text-[8px] uppercase tracking-widest text-white/30 shrink-0">Details →</span>
                                                            </div>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </section>

                                    <section>
                                        <h3 className="text-[9px] tracking-[0.35em] uppercase font-black text-white/30 mb-3">
                                            Registered — not verified
                                            {rosterFilter ? (
                                                <span className="ml-2 text-white/25 font-mono normal-case tracking-normal">
                                                    {rosterPending.length}/{rosterPendingAll.length}
                                                </span>
                                            ) : null}
                                        </h3>
                                        {rosterPendingAll.length === 0 ? (
                                            <p className="text-[10px] text-white/20 italic py-6 border border-dashed border-white/10 text-center">Everyone registered has checked in (or no registrations)</p>
                                        ) : rosterPending.length === 0 ? (
                                            <p className="text-[10px] text-white/20 italic py-6 border border-dashed border-white/10 text-center">No pending matches for this search</p>
                                        ) : (
                                            <ul className="border border-white/[0.06] divide-y divide-white/[0.04]">
                                                {rosterPending.map((reg, idx) => (
                                                    <li key={`${reg.email ?? ''}-${reg.wallet ?? ''}-${idx}`}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setRosterPerson({ kind: 'pending', row: reg })}
                                                            className="w-full text-left px-4 py-3 flex flex-col gap-1 text-[10px] font-mono hover:bg-white/[0.04] transition-colors"
                                                        >
                                                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                                                    <span className="text-white/80">{shortIdentity(reg.wallet, reg.email)}</span>
                                                                    {reg.name?.trim() && <span className="text-white/50">{reg.name}</span>}
                                                                </div>
                                                                <span className="text-[8px] uppercase tracking-widest text-white/30 shrink-0">Details →</span>
                                                            </div>
                                                            {(reg.email?.trim()) && <span className="text-white/35 text-[9px]">{reg.email}</span>}
                                                            {isPaidRegistration(reg.paymentStatus) && (
                                                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                                                    <span
                                                                        className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 border ${
                                                                            (reg.paymentStatus ?? '').toLowerCase() === 'paid_crypto'
                                                                                ? 'border-cyan-500/35 text-cyan-300 bg-cyan-500/10'
                                                                                : 'border-emerald-500/35 text-emerald-300 bg-emerald-500/10'
                                                                        }`}
                                                                    >
                                                                        {registrationPaymentLabel(reg.paymentStatus)}
                                                                    </span>
                                                                    {(reg.paymentStatus ?? '').toLowerCase() === 'paid_crypto' &&
                                                                        reg.paymentTxHash?.trim() && (
                                                                            <span className="text-[9px] text-white/40" title={reg.paymentTxHash}>
                                                                                Tx {shortHash(reg.paymentTxHash)}
                                                                            </span>
                                                                        )}
                                                                    {(reg.paymentStatus ?? '').toLowerCase() === 'paid_mobile' &&
                                                                        reg.paymentReference?.trim() && (
                                                                            <span className="text-[9px] text-white/40 truncate max-w-full" title={reg.paymentReference}>
                                                                                Ref {reg.paymentReference}
                                                                            </span>
                                                                        )}
                                                                </div>
                                                            )}
                                                            <span className="text-white/25 text-[9px]">
                                                                Registered {new Date(reg.registeredAt).toLocaleString('en-GB')}
                                                            </span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </section>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Event QR Modal */}
            <AnimatePresence>
                {selectedEventQR && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8"
                        onClick={(e) => e.target === e.currentTarget && setSelectedEventQR(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="w-full max-w-lg border border-white/10 bg-[#0a0a0a] overflow-hidden"
                        >
                            <div className="p-8 border-b border-white/[0.06] flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] tracking-[0.5em] uppercase text-blue-400 font-black mb-1">Optical Verification Pass</p>
                                    <p className="text-[10px] font-mono text-white/40">{selectedEventQR.id}</p>
                                </div>
                                <button onClick={() => setSelectedEventQR(null)} className="text-[10px] font-black tracking-[0.3em] uppercase opacity-30 hover:opacity-100 italic transition-opacity">Abort</button>
                            </div>

                            <div className="p-12 space-y-12">
                                <div className="text-center space-y-2">
                                    <h2 className="text-4xl font-black tracking-tighter uppercase">{selectedEventQR.name}</h2>
                                    <p className="text-[10px] font-mono text-white/20 tracking-[0.4em] uppercase">{selectedEventQR.location || 'Distributed Node'}</p>
                                </div>

                                <div className="flex flex-col items-center gap-10">
                                    <div className="p-6 bg-white ring-8 ring-white/5">
                                        <QRCodeCanvas
                                            id={`qr-modal-${selectedEventQR.id}`}
                                            value={selectedEventQR.verificationCode || selectedEventQR.id}
                                            size={280}
                                            level="H"
                                        />
                                    </div>
                                    <div className="text-center space-y-4 w-full">
                                        <p className="text-[9px] uppercase tracking-[0.5em] text-white/20 font-black">Auth Code Fragment</p>
                                        <p className="font-mono text-2xl tracking-[0.5em] text-white underline decoration-blue-500 decoration-2 underline-offset-8 font-bold">{selectedEventQR.verificationCode}</p>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        onClick={() => {
                                            const canvas = document.getElementById(`qr-modal-${selectedEventQR.id}`) as HTMLCanvasElement;
                                            if (!canvas) return;
                                            const url = canvas.toDataURL('image/png');
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `${selectedEventQR.name.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
                                            a.click();
                                        }}
                                        className="flex-1 bg-white text-black py-5 text-[10px] font-black tracking-[0.4em] uppercase hover:bg-neutral-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                                    >
                                        Export PNG
                                    </button>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(selectedEventQR.verificationCode);
                                        }}
                                        className="flex-1 py-5 border border-white/10 hover:bg-white/[0.04] text-[10px] font-black tracking-[0.4em] uppercase text-white/40"
                                    >
                                        Copy Fragment
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Contact host */}
            <AnimatePresence>
                {contactEvent && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[310] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-8"
                        onClick={(e) => e.target === e.currentTarget && setContactEvent(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 16 }}
                            className="w-full max-w-lg border border-white/10 bg-[#0a0a0a] max-h-[92vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-5 sm:p-6 border-b border-white/[0.06] flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[9px] tracking-[0.4em] uppercase text-blue-300/90 font-black">
                                        Contact host
                                    </p>
                                    <h2 className="text-lg font-bold tracking-tight mt-1 truncate">
                                        {contactEvent.name}
                                    </h2>
                                    <p className="text-[10px] font-mono text-white/40 mt-1 truncate">
                                        {formatOrganizerShort(contactEvent)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setContactEvent(null)}
                                    className="text-[9px] font-black uppercase tracking-widest text-white/35 hover:text-white shrink-0"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="p-5 sm:p-6 space-y-4">
                                <div className="space-y-2">
                                    <label className="block text-[8px] uppercase tracking-[0.3em] text-white/35 font-bold">
                                        Host email
                                    </label>
                                    <input
                                        type="email"
                                        value={contactToEmail}
                                        onChange={(e) => setContactToEmail(e.target.value)}
                                        placeholder={
                                            getOrganizerEmailFromId(contactEvent.organizer)
                                                ? undefined
                                                : 'No email on file — enter contact…'
                                        }
                                        readOnly={!!getOrganizerEmailFromId(contactEvent.organizer)}
                                        className="w-full bg-white/[0.04] border border-white/10 px-3 py-2.5 text-white text-sm font-mono placeholder:text-white/25 focus:outline-none focus:border-blue-400/40 read-only:opacity-70"
                                    />
                                    {!getOrganizerEmailFromId(contactEvent.organizer) ? (
                                        <p className="text-[9px] text-amber-400/80 leading-relaxed">
                                            Wallet host — no email stored on the event. Enter an address if you have
                                            one, or use the wallet id below offline.
                                        </p>
                                    ) : (
                                        <a
                                            href={`mailto:${getOrganizerEmailFromId(contactEvent.organizer)}?subject=${encodeURIComponent(contactSubject || `Regarding ${contactEvent.name}`)}`}
                                            className="inline-block text-[9px] uppercase tracking-widest text-blue-300/90 hover:text-blue-200 font-bold"
                                        >
                                            Open in mail app →
                                        </a>
                                    )}
                                    {!isEmailOrganizerId(contactEvent.organizer) ? (
                                        <p className="text-[9px] font-mono text-white/30 break-all">
                                            Wallet: {contactEvent.organizer}
                                        </p>
                                    ) : null}
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[8px] uppercase tracking-[0.3em] text-white/35 font-bold">
                                        Subject
                                    </label>
                                    <input
                                        type="text"
                                        value={contactSubject}
                                        onChange={(e) => setContactSubject(e.target.value)}
                                        maxLength={160}
                                        className="w-full bg-white/[0.04] border border-white/10 px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400/40"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[8px] uppercase tracking-[0.3em] text-white/35 font-bold">
                                        Message
                                    </label>
                                    <textarea
                                        value={contactMessage}
                                        onChange={(e) => setContactMessage(e.target.value)}
                                        rows={6}
                                        maxLength={5000}
                                        placeholder="Write your message to the host…"
                                        className="w-full bg-white/[0.04] border border-white/10 px-3 py-2.5 text-white text-sm leading-relaxed resize-y min-h-[140px] focus:outline-none focus:border-blue-400/40 placeholder:text-white/25"
                                    />
                                </div>

                                {contactError ? (
                                    <p className="text-[10px] text-red-400 font-mono">{contactError}</p>
                                ) : null}
                                {contactOk ? (
                                    <p className="text-[10px] text-emerald-400 font-mono">{contactOk}</p>
                                ) : null}

                                <button
                                    type="button"
                                    disabled={contactBusy || !contactToEmail.trim() || contactMessage.trim().length < 10}
                                    onClick={() => void sendContactHost()}
                                    className="w-full min-h-[48px] bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-neutral-200 disabled:opacity-40"
                                >
                                    {contactBusy ? 'Sending…' : 'Send email to host'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
