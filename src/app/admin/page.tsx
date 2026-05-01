'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';

interface AttendanceRecord {
    wallet?: string | null;
    email?: string | null;
    code: string;
    checkedInAt: string;
    eventId?: string;
}

interface DashboardEvent {
    id: string;
    name: string;
    description: string;
    date: string;
    location: string;
    organizer: string;
    verificationCode: string;
    createdAt: string;
    attendeeCount: number;
    registrationCount?: number;
    maxAttendees?: number;
    isVip?: boolean;
    vipTokenAddress?: string;
    vipMinBalance?: string;
    isBlockchain?: boolean;
}

interface Registration {
    eventId: string;
    wallet: string | null;
    email: string | null;
    name: string | null;
    registeredAt: string;
}

type Tab = 'overview' | 'attendance' | 'events';

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

    // Interactivity: Search & Filter
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'vip' | 'regular'>('all');

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

    useEffect(() => {
        if (!authed) return;
        fetchAttendance();
        fetchRegistrations();
        fetchEvents();
    }, [authed]);

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

    const fetchAttendance = async () => {
        const res = await fetch('/api/admin/attendance', { cache: 'no-store', credentials: 'include' });
        if (res.status === 401) {
            setAuthed(false);
            return;
        }
        const data = await res.json();
        if (Array.isArray(data)) setAttendance(data);
    };

    const fetchEvents = async () => {
        const res = await fetch('/api/events', { cache: 'no-store' });
        const data = await res.json();
        if (Array.isArray(data)) setEvents(data);
    };

    const fetchRegistrations = async () => {
        const res = await fetch('/api/admin/registrations', { cache: 'no-store', credentials: 'include' });
        if (res.status === 401) {
            setAuthed(false);
            return;
        }
        const data = await res.json();
        if (Array.isArray(data)) setRegistrations(data);
    };

    // Export Logic
    const exportToCSV = (data: any[], filename: string) => {
        if (data.length === 0) return;
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
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

    // Filtered data
    const filteredEvents = events.filter(ev => {
        const matchesSearch = ev.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ev.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ev.organizer.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filterType === 'all' ||
            (filterType === 'vip' && ev.isVip) ||
            (filterType === 'regular' && !ev.isVip);
        return matchesSearch && matchesFilter;
    });

    const filteredAttendance = attendance.filter(record =>
        (record.wallet ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (record.email ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.code.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const LEGACY_EVENT_KEY = '__legacy__';

    const groupedAttendance = filteredAttendance.reduce<Record<string, AttendanceRecord[]>>((acc, record) => {
        const key = record.eventId || LEGACY_EVENT_KEY;
        if (!acc[key]) acc[key] = [];
        acc[key].push(record);
        return acc;
    }, {});

    const attendanceSectionIds: string[] = [
        ...events
            .map(e => e.id)
            .filter(
                id =>
                    (groupedAttendance[id]?.length ?? 0) > 0 ||
                    registrations.some(r => (r.eventId ?? '').toLowerCase() === id.toLowerCase())
            ),
    ];
    if ((groupedAttendance[LEGACY_EVENT_KEY]?.length ?? 0) > 0) {
        attendanceSectionIds.push(LEGACY_EVENT_KEY);
    }

    function getRegisteredOnly(eventId: string): Registration[] {
        if (eventId === LEGACY_EVENT_KEY) return [];
        const verifiedRecords = groupedAttendance[eventId] || [];
        const attendedWallets = new Set(
            verifiedRecords.map(r => (r.wallet ?? '').toLowerCase()).filter(Boolean)
        );
        const attendedEmails = new Set(
            verifiedRecords.map(r => (r.email ?? '').toLowerCase()).filter(Boolean)
        );
        return registrations.filter(r => {
            if ((r.eventId ?? '').toLowerCase() !== eventId.toLowerCase()) return false;
            if (r.wallet?.trim()) {
                return !attendedWallets.has(r.wallet.toLowerCase());
            }
            if (r.email?.trim()) {
                return !attendedEmails.has(r.email.toLowerCase());
            }
            return false;
        });
    }

    const toggleAttendanceSection = (eventId: string) => {
        setAttendanceCollapsed(prev => ({ ...prev, [eventId]: !prev[eventId] }));
    };

    const exportAttendanceReport = () => {
        const rows: { Event: string; Identity: string; Status: string; 'Auth Code': string; Timestamp: string }[] = [];
        const eventName = (id: string) => (id === LEGACY_EVENT_KEY ? 'Legacy check-ins' : (events.find(e => e.id === id || e.id.toLowerCase() === id)?.name ?? id));
        attendance.forEach(record => {
            const id = record.wallet?.trim() || record.email?.trim() || '—';
            rows.push({
                Event: eventName(record.eventId || LEGACY_EVENT_KEY),
                Identity: id,
                Status: 'Verified',
                'Auth Code': record.code,
                Timestamp: new Date(record.checkedInAt).toLocaleString('en-GB'),
            });
        });
        registrations.forEach(reg => {
            const regWallet = reg.wallet;
            const walletHit =
                !!regWallet &&
                attendance.some(
                    a =>
                        a.eventId &&
                        (reg.eventId ?? '').toLowerCase() === a.eventId.toLowerCase() &&
                        (a.wallet ?? '').toLowerCase() === regWallet.toLowerCase()
                );
            const regEmail = reg.email;
            const emailHit =
                !!regEmail &&
                attendance.some(
                    a =>
                        a.eventId &&
                        (reg.eventId ?? '').toLowerCase() === a.eventId.toLowerCase() &&
                        (a.email ?? '').toLowerCase() === regEmail.toLowerCase()
                );
            if (!walletHit && !emailHit) {
                rows.push({
                    Event: events.find(e => e.id.toLowerCase() === (reg.eventId ?? '').toLowerCase())?.name ?? reg.eventId,
                    Identity: reg.wallet?.trim() || reg.email?.trim() || '—',
                    Status: 'Registered only',
                    'Auth Code': '-',
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

    const getVerifiedForEvent = (eventId: string) =>
        attendance
            .filter(a => a.eventId && a.eventId.toLowerCase() === eventId.toLowerCase())
            .sort((x, y) => new Date(y.checkedInAt).getTime() - new Date(x.checkedInAt).getTime());

    const getRegisteredOnlyForEvent = (eventId: string): Registration[] => {
        const verified = getVerifiedForEvent(eventId);
        const attendedWallets = new Set(verified.map(r => (r.wallet ?? '').toLowerCase()).filter(Boolean));
        const attendedEmails = new Set(verified.map(r => (r.email ?? '').toLowerCase()).filter(Boolean));
        return registrations.filter(r => {
            if ((r.eventId ?? '').toLowerCase() !== eventId.toLowerCase()) return false;
            if (r.wallet?.trim()) return !attendedWallets.has(r.wallet.toLowerCase());
            if (r.email?.trim()) return !attendedEmails.has(r.email.toLowerCase());
            return false;
        });
    };

    const exportEventRoster = (ev: DashboardEvent) => {
        const verified = getVerifiedForEvent(ev.id);
        const onlyReg = getRegisteredOnlyForEvent(ev.id);
        const rows: { Status: string; Identity: string; Name: string; Email: string; Code: string; Timestamp: string }[] = [];
        verified.forEach(v => {
            rows.push({
                Status: 'Verified',
                Identity: v.wallet?.trim() || v.email?.trim() || '—',
                Name: '—',
                Email: (v.email ?? '').trim() || '—',
                Code: v.code,
                Timestamp: new Date(v.checkedInAt).toLocaleString('en-GB'),
            });
        });
        onlyReg.forEach(r => {
            rows.push({
                Status: 'Registered only',
                Identity: r.wallet?.trim() || r.email?.trim() || '—',
                Name: (r.name ?? '').trim() || '—',
                Email: (r.email ?? '').trim() || '—',
                Code: '-',
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
                                <span className="text-3xl font-black tracking-[0.2em] uppercase text-white">GATE</span>
                                <span className="text-[10px] font-bold tracking-[0.5em] uppercase text-white/70">Protocol</span>
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
            <header className="fixed top-0 left-0 right-0 z-[100] h-16 flex items-center px-6 lg:px-12 border-b border-white/[0.04] bg-black/80 backdrop-blur-3xl">
                <div className="flex items-center gap-3 mr-8 lg:mr-16">
                    <Link href="/" className="text-[8px] tracking-[0.25em] uppercase text-white/35 hover:text-white font-bold hidden sm:inline">Home</Link>
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="shrink-0">
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
                        <span className="text-[11px] font-black tracking-[0.2em] uppercase">GATE</span>
                        <span className="text-[6px] font-bold tracking-[0.4em] uppercase text-white/70">Protocol</span>
                    </div>
                </div>

                <nav className="hidden md:flex items-center gap-2">
                    {(['overview', 'attendance', 'events'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => { setTab(t); setSearchQuery(''); }}
                            className={`px-6 py-2 text-[9px] tracking-[0.35em] uppercase font-black transition-all ${tab === t
                                ? 'bg-white text-black'
                                : 'text-white/30 hover:text-white/70'}`}
                        >
                            {t}
                        </button>
                    ))}
                </nav>

                <div className="md:hidden flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {(['overview', 'attendance', 'events'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => { setTab(t); setSearchQuery(''); }}
                            className={`px-3 py-1.5 text-[8px] tracking-[0.2em] uppercase font-black transition-all whitespace-nowrap ${tab === t
                                ? 'bg-white text-black'
                                : 'text-white/30'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                <div className="ml-auto flex items-center gap-4 lg:gap-8">
                    <div className="hidden sm:flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                        <span className="text-[9px] tracking-[0.25em] uppercase text-white/40 font-bold">Terminal Auth: Active</span>
                    </div>
                    <button type="button" onClick={handleLogout} className="text-[9px] tracking-[0.25em] uppercase text-white/30 hover:text-red-400 transition-colors font-bold">Logout</button>
                </div>
            </header>

            <div className="pt-24 pb-20 px-6 lg:px-12 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-12">
                {/* Sidebar Stats Panel */}
                <aside className="space-y-12 h-fit sticky top-24">
                    <div className="space-y-6">
                        <p className="text-[10px] uppercase tracking-[0.4em] font-black text-white/20">System Summary</p>
                        <div className="space-y-4">
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="p-8 border border-white/[0.05] bg-white/[0.02] backdrop-blur-xl relative group overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <div className="w-16 h-16 border-t font-black border-r border-white" />
                                </div>
                                <p className="text-5xl font-medium tracking-tighter mb-1">{attendance.length}</p>
                                <p className="text-[9px] tracking-[0.3em] uppercase text-white/50 font-bold">Verification Events</p>
                            </motion.div>

                            <div className="p-6 border border-white/[0.05] bg-white/[0.01]">
                                <p className="text-2xl font-bold mb-1">{events.length}</p>
                                <p className="text-[8px] tracking-[0.2em] uppercase text-white/40 font-bold">Pools</p>
                            </div>
                        </div>
                    </div>

                </aside>

                {/* Main Dynamic Panel */}
                <main>
                    {/* Search Bar */}
                    {tab !== 'overview' && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-12 relative group">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={`Filter ${tab} data by address, ID, or name...`}
                                className="w-full bg-white/[0.02] border border-white/[0.06] px-8 py-5 text-sm font-mono tracking-widest placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-all font-bold"
                            />
                            <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-4">
                                {tab === 'attendance' && (
                                    <button
                                        onClick={() => exportAttendanceReport()}
                                        className="px-4 py-1 text-[8px] uppercase tracking-widest font-black font-mono transition-colors bg-white text-black hover:bg-neutral-200 mr-2"
                                    >
                                        Export CSV
                                    </button>
                                )}
                                {tab === 'events' && (
                                    <div className="flex bg-black p-1 border border-white/5">
                                        {(['all', 'vip', 'regular'] as const).map(f => (
                                            <button
                                                key={f}
                                                onClick={() => setFilterType(f)}
                                                className={`px-3 py-1 text-[8px] uppercase tracking-widest font-black font-mono transition-colors ${filterType === f ? 'bg-white text-black' : 'text-white/30'}`}
                                            >
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    <AnimatePresence mode="wait">
                        {/* OVERVIEW TAB */}
                        {tab === 'overview' && (
                            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-16">
                                <div className="space-y-4">
                                    <h1 className="text-7xl font-medium tracking-tighter italic">PROTOCOL DASHBOARD.</h1>
                                    <p className="text-[10px] uppercase tracking-[0.5em] text-white/20 font-black">GATE PROTOCOL Autonomous Verification Node</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-6">
                                        <p className="text-[10px] uppercase tracking-[0.4em] font-black text-white/20">Recent Activity Stream</p>
                                        <div className="border border-white/[0.04] bg-white/[0.01] divide-y divide-white/[0.04]">
                                            {attendance.length === 0 ? (
                                                <div className="p-12 text-center text-white/10 text-[10px] uppercase tracking-widest italic">Stream Idle</div>
                                            ) : (
                                                [...attendance].reverse().slice(0, 5).map((act, i) => (
                                                    <div key={i} className="p-6 flex items-center justify-between group hover:bg-white/[0.01] transition-colors">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" />
                                                            <div>
                                                                <p className="text-[11px] font-mono text-white/80">{shortIdentity(act.wallet, act.email)}</p>
                                                                <p className="text-[8px] tracking-[0.2em] uppercase text-white/20 font-bold mt-1">Presence Verified @ {act.code}</p>
                                                            </div>
                                                        </div>
                                                        <span className="text-[9px] font-mono text-white/10">{new Date(act.checkedInAt).toLocaleTimeString()}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <p className="text-[10px] uppercase tracking-[0.4em] font-black text-white/20">Event Pool Density</p>
                                        <div className="border border-white/[0.04] bg-white/[0.01] p-8 space-y-8">
                                            {events.slice(0, 3).map(ev => {
                                                const cap = ev.maxAttendees && ev.maxAttendees > 0 ? ev.maxAttendees : 100;
                                                const pct = Math.min((ev.attendeeCount / cap) * 100, 100);
                                                return (
                                                <div key={ev.id} className="space-y-3">
                                                    <div className="flex justify-between items-end">
                                                        <p className="text-xs font-bold tracking-tight uppercase">{ev.name}</p>
                                                        <p className="text-[10px] font-mono text-white/40">
                                                            {ev.attendeeCount}
                                                            {ev.maxAttendees != null && ev.maxAttendees > 0 ? ` / ${ev.maxAttendees}` : ' verified'}
                                                        </p>
                                                    </div>
                                                    <div className="h-[2px] w-full bg-white/5 relative overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${pct}%` }}
                                                            className="absolute inset-y-0 left-0 bg-white"
                                                        />
                                                    </div>
                                                </div>
                                            );})}
                                            {events.length === 0 && <p className="text-[10px] text-white/10 italic text-center py-12">No active pools</p>}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* ATTENDANCE TAB */}
                        {tab === 'attendance' && (
                            <motion.div key="attendance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                                <div className="border border-white/[0.06] overflow-hidden">
                                    <div className="grid grid-cols-[1fr_160px_160px_160px] px-8 py-4 border-b border-white/[0.08] bg-white/[0.03]">
                                        <span className="text-[9px] tracking-[0.4em] uppercase text-white/40 font-black">Wallet / email</span>
                                        <span className="text-[9px] tracking-[0.4em] uppercase text-white/40 font-black">Event / Source</span>
                                        <span className="text-[9px] tracking-[0.4em] uppercase text-white/40 font-black">Auth Code</span>
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
                                                                    {sortedRecords.map((record, i) => (
                                                                        <div
                                                                            key={`${eventId}-v-${i}`}
                                                                            className="grid grid-cols-[1fr_160px_160px_160px] px-8 py-5 items-center hover:bg-white/[0.01] transition-colors group border-t border-white/[0.02]"
                                                                        >
                                                                            <span className="font-mono text-xs text-white/60 group-hover:text-white transition-colors">
                                                                                {shortIdentity(record.wallet, record.email)}
                                                                            </span>
                                                                            <span className="text-[10px] uppercase tracking-wider text-white/40">
                                                                                {record.eventId
                                                                                    ? (events.find(e => e.id === record.eventId)?.name || 'Unscoped')
                                                                                    : 'Legacy_Entry'}
                                                                            </span>
                                                                            <span className="font-mono text-sm tracking-[0.2em] text-blue-400 font-bold">{record.code}</span>
                                                                            <span className="text-[10px] text-white/20 font-mono">
                                                                                {new Date(record.checkedInAt).toLocaleString('en-GB', {
                                                                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                                                                })}
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
                                                                                    className="grid grid-cols-[1fr_160px_160px_160px] px-8 py-4 items-center hover:bg-white/[0.01] transition-colors group border-t border-white/[0.02]"
                                                                                >
                                                                                    <span className="font-mono text-xs text-white/50 group-hover:text-white/70 transition-colors">
                                                                                        {shortIdentity(reg.wallet, reg.email)}
                                                                                    </span>
                                                                                    <span className="text-[10px] uppercase tracking-wider text-amber-400/60">
                                                                                        {ev?.name ?? reg.eventId}
                                                                                    </span>
                                                                                    <span className="font-mono text-sm text-white/20">—</span>
                                                                                    <span className="text-[10px] text-white/20 font-mono">
                                                                                        Registered {new Date(reg.registeredAt).toLocaleString('en-GB', {
                                                                                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                                                                        })}
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
                                            onClick={() => setSelectedEventDetail(ev)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    setSelectedEventDetail(ev);
                                                }
                                            }}
                                            className="px-4 py-3 border border-white/[0.06] bg-white/[0.01] group hover:bg-white/[0.06] transition-all flex items-center justify-between gap-4 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                                        >
                                            <div className="space-y-2 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className={`w-1 h-1 shrink-0 rounded-full ${new Date(ev.date) >= new Date() ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`} />
                                                    <h3 className="text-sm font-bold tracking-tight group-hover:tracking-wide transition-all uppercase truncate">{ev.name}</h3>
                                                    {ev.isVip && <span className="text-[7px] px-1.5 py-0.5 border border-yellow-500/30 text-yellow-500 font-black tracking-widest uppercase bg-yellow-500/5">VIP Exclusive</span>}
                                                </div>
                                                <div className="flex flex-wrap gap-x-5 gap-y-1">
                                                    <div className="space-y-0.5">
                                                        <p className="text-[7px] uppercase tracking-[0.2em] text-white/30 font-bold">Location</p>
                                                        <p className="text-[9px] font-mono text-white/60 uppercase">{ev.location || 'N/A'}</p>
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <p className="text-[7px] uppercase tracking-[0.2em] text-white/30 font-bold">Organizer</p>
                                                        <p className="text-[9px] font-mono text-white/60">{ev.organizer.slice(0, 8)}...{ev.organizer.slice(-6)}</p>
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <p className="text-[7px] uppercase tracking-[0.2em] text-white/30 font-bold">Pool Stats</p>
                                                        <p className="text-[9px] font-mono text-white/60">{ev.attendeeCount} Verified</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="shrink-0">
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
                        onClick={e => e.target === e.currentTarget && setSelectedEventDetail(null)}
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
                                    <p className="text-[9px] font-mono text-white/25 truncate" title={selectedEventDetail.organizer}>
                                        Organizer {selectedEventDetail.organizer}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2 sm:justify-end">
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
                                        onClick={() => setSelectedEventDetail(null)}
                                        className="px-3 py-2 text-[8px] font-black tracking-[0.2em] uppercase text-white/40 hover:text-white"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            <div className="shrink-0 px-5 sm:px-6 py-3 border-b border-white/[0.04] flex flex-wrap gap-3 text-[9px] font-mono text-white/50">
                                <span className="text-white/80 font-bold">
                                    {registrations.filter(r => (r.eventId ?? '').toLowerCase() === selectedEventDetail.id.toLowerCase()).length} registered
                                </span>
                                <span>·</span>
                                <span>{getVerifiedForEvent(selectedEventDetail.id).length} verified</span>
                                <span>·</span>
                                <span className="text-amber-400/90">{getRegisteredOnlyForEvent(selectedEventDetail.id).length} pending check-in</span>
                                {selectedEventDetail.maxAttendees != null && selectedEventDetail.maxAttendees > 0 && (
                                    <>
                                        <span>·</span>
                                        <span>Cap {selectedEventDetail.maxAttendees}</span>
                                    </>
                                )}
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto">
                                <div className="p-5 sm:p-6 space-y-8 pb-10">
                                    <section>
                                        <h3 className="text-[9px] tracking-[0.35em] uppercase font-black text-white/30 mb-3">Verified check-ins</h3>
                                        {getVerifiedForEvent(selectedEventDetail.id).length === 0 ? (
                                            <p className="text-[10px] text-white/20 italic py-6 border border-dashed border-white/10 text-center">No verified entries yet</p>
                                        ) : (
                                            <ul className="border border-white/[0.06] divide-y divide-white/[0.04]">
                                                {getVerifiedForEvent(selectedEventDetail.id).map((row, idx) => (
                                                    <li key={`${row.code}-${idx}`} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[10px] font-mono hover:bg-white/[0.02]">
                                                        <span className="text-white/80">{shortIdentity(row.wallet, row.email)}</span>
                                                        <span className="text-blue-400/90 font-bold tracking-wider">{row.code}</span>
                                                        <span className="text-white/30">
                                                            {new Date(row.checkedInAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </section>

                                    <section>
                                        <h3 className="text-[9px] tracking-[0.35em] uppercase font-black text-white/30 mb-3">Registered — not verified</h3>
                                        {getRegisteredOnlyForEvent(selectedEventDetail.id).length === 0 ? (
                                            <p className="text-[10px] text-white/20 italic py-6 border border-dashed border-white/10 text-center">Everyone registered has checked in (or no registrations)</p>
                                        ) : (
                                            <ul className="border border-white/[0.06] divide-y divide-white/[0.04]">
                                                {getRegisteredOnlyForEvent(selectedEventDetail.id).map((reg, idx) => (
                                                    <li key={`${reg.email ?? ''}-${reg.wallet ?? ''}-${idx}`} className="px-4 py-3 flex flex-col gap-1 text-[10px] font-mono hover:bg-white/[0.02]">
                                                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                                            <span className="text-white/80">{shortIdentity(reg.wallet, reg.email)}</span>
                                                            {reg.name?.trim() && <span className="text-white/50">{reg.name}</span>}
                                                        </div>
                                                        {(reg.email?.trim()) && <span className="text-white/35 text-[9px]">{reg.email}</span>}
                                                        <span className="text-white/25 text-[9px]">
                                                            Registered {new Date(reg.registeredAt).toLocaleString('en-GB')}
                                                        </span>
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
        </div>
    );
}
