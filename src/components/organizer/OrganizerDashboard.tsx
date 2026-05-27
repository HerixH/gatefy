'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import {
    eventAcceptsMobileMoney,
    eventAcceptsUsdc,
    formatEventTicketSummary,
    isPaidRegistration,
} from '@/lib/event-payment';
import { getEventStatus, formatEventDateTime, isPast, isOngoing, isUpcoming } from '@/lib/event-status';
import type { OrganizerEvent } from '@/lib/organizer-event';
import { getPublicRegistrationLink } from '@/lib/organizer-event';
import { downloadEventQrImage } from '@/lib/organizer-qr';
import {
    exportOrganizerRosterCsv,
    registrantMatchesCheckIn,
    registrationPayLabel,
    registrationPaymentDetail,
    type OrganizerAttendeeRow,
    type OrganizerRegRow,
} from '@/lib/organizer-roster';
import {
    capacityPercent,
    checkInRatePercent,
    estimatedUsdcRevenue,
    getRegisteredCount,
    getRemainingSeats,
    matchesRosterSearch,
    isUnpaidRegistration,
    sumPortfolioRevenue,
} from '@/lib/organizer-stats';
import { useOrganizerSession } from '@/hooks/useOrganizerSession';
import { OrganizerManageModal } from '@/components/organizer/OrganizerManageModal';
import { PageFooter } from '@/components/PageFooter';

type StatusFilter = 'all' | 'upcoming' | 'ongoing' | 'past';
type RosterFilter = 'all' | 'pending' | 'verified' | 'paid' | 'unpaid';

function OrganizerDashboardInner() {
    const { address, isConnected } = useAccount();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const {
        organizerSessionEmail,
        signedIn,
        managedQuery,
        listAuthSuffix,
        commitEmailSession,
        clearEmailSession,
    } = useOrganizerSession(address);

    const [signInDraft, setSignInDraft] = useState('');
    const [events, setEvents] = useState<OrganizerEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [showManage, setShowManage] = useState(false);

    const [attendees, setAttendees] = useState<OrganizerAttendeeRow[]>([]);
    const [registrations, setRegistrations] = useState<OrganizerRegRow[]>([]);
    const [rosterLoading, setRosterLoading] = useState(false);
    const [eventSearch, setEventSearch] = useState('');
    const [rosterSearch, setRosterSearch] = useState('');
    const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all');

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 4000);
    };

    const fetchManaged = useCallback(async () => {
        if (!managedQuery) {
            setEvents([]);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/events/managed?${managedQuery}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) {
                setError(typeof data?.error === 'string' ? data.error : 'Failed to load events');
                setEvents([]);
                return;
            }
            setEvents(Array.isArray(data) ? data : []);
        } catch {
            setError('Network error');
            setEvents([]);
        } finally {
            setLoading(false);
        }
    }, [managedQuery]);

    useEffect(() => {
        fetchManaged();
    }, [fetchManaged]);

    const selectedEvent = useMemo(
        () => events.find((e) => e.id.toLowerCase() === (selectedId ?? '').toLowerCase()) ?? null,
        [events, selectedId]
    );

    const selectEvent = useCallback(
        (id: string | null) => {
            setSelectedId(id);
            const next = new URLSearchParams(searchParams.toString());
            if (id) next.set('event', id);
            else next.delete('event');
            const q = next.toString();
            router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
        },
        [searchParams, router, pathname]
    );

    useEffect(() => {
        const eventId = searchParams.get('event');
        if (!eventId || events.length === 0) return;
        const ev = events.find((e) => e.id.toLowerCase() === eventId.toLowerCase());
        if (ev) setSelectedId(ev.id);
    }, [searchParams, events]);

    useEffect(() => {
        if (selectedId || events.length === 0 || searchParams.get('event')) return;
        const upcoming = events.find((e) => isUpcoming(e.date, e.endDate) || isOngoing(e.date, e.endDate));
        const pick = upcoming ?? events[0];
        if (pick) selectEvent(pick.id);
    }, [events, selectedId, searchParams, selectEvent]);

    const fetchRoster = useCallback(async () => {
        if (!selectedEvent || !listAuthSuffix) return;
        setRosterLoading(true);
        try {
            const [aRes, rRes] = await Promise.all([
                fetch(`/api/events/attendees?eventId=${selectedEvent.id}${listAuthSuffix}`, { cache: 'no-store' }),
                fetch(`/api/events/registrations?eventId=${selectedEvent.id}${listAuthSuffix}`, {
                    cache: 'no-store',
                }),
            ]);
            const aData = await aRes.json();
            const rData = await rRes.json();
            setAttendees(Array.isArray(aData) ? aData : []);
            setRegistrations(Array.isArray(rData) ? rData : []);
        } finally {
            setRosterLoading(false);
        }
    }, [selectedEvent, listAuthSuffix]);

    useEffect(() => {
        setAttendees([]);
        setRegistrations([]);
        setRosterSearch('');
        setRosterFilter('all');
        if (selectedEvent && listAuthSuffix) fetchRoster();
    }, [selectedEvent?.id, listAuthSuffix, fetchRoster]);

    const filteredEvents = useMemo(() => {
        const q = eventSearch.trim().toLowerCase();
        const sorted = [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return sorted.filter((ev) => {
            if (statusFilter !== 'all' && getEventStatus(ev.date, ev.endDate) !== statusFilter) return false;
            if (!q) return true;
            return (
                ev.name.toLowerCase().includes(q) ||
                (ev.location ?? '').toLowerCase().includes(q) ||
                ev.id.toLowerCase().includes(q)
            );
        });
    }, [events, statusFilter, eventSearch]);

    const pendingRegs = useMemo(() => {
        return registrations.filter((r) => !attendees.some((a) => registrantMatchesCheckIn(r, a)));
    }, [registrations, attendees]);

    const filteredAttendees = useMemo(() => {
        return attendees.filter((a) => matchesRosterSearch(a, rosterSearch));
    }, [attendees, rosterSearch]);

    const filteredPendingRegs = useMemo(() => {
        const price = selectedEvent?.ticketPriceUsdc ?? 0;
        return pendingRegs.filter((r) => {
            if (!matchesRosterSearch(r, rosterSearch)) return false;
            if (rosterFilter === 'pending') return true;
            if (rosterFilter === 'verified') return false;
            if (rosterFilter === 'paid') return isPaidRegistration(r.paymentStatus);
            if (rosterFilter === 'unpaid') return isUnpaidRegistration(r.paymentStatus, price);
            return true;
        });
    }, [pendingRegs, rosterSearch, rosterFilter, selectedEvent?.ticketPriceUsdc]);

    const showVerifiedColumn =
        rosterFilter === 'all' || rosterFilter === 'verified' || rosterFilter === 'paid';
    const showPendingColumn =
        rosterFilter === 'all' ||
        rosterFilter === 'pending' ||
        rosterFilter === 'paid' ||
        rosterFilter === 'unpaid';

    const selectedInsights = useMemo(() => {
        if (!selectedEvent) return null;
        const reg = getRegisteredCount(selectedEvent);
        const verified = selectedEvent.attendeeCount ?? 0;
        const price = selectedEvent.ticketPriceUsdc ?? 0;
        return {
            reg,
            verified,
            pending: Math.max(0, reg - verified),
            paid: selectedEvent.paidRegistrationCount ?? 0,
            unpaid: selectedEvent.unpaidRegistrationCount ?? 0,
            revenue: estimatedUsdcRevenue(price, selectedEvent.paidRegistrationCount ?? 0),
            capacity: capacityPercent(selectedEvent),
            remaining: getRemainingSeats(selectedEvent),
            checkInPct: checkInRatePercent(reg, verified),
        };
    }, [selectedEvent]);

    const totals = useMemo(() => {
        let registrations = 0;
        let verified = 0;
        let paid = 0;
        let unpaid = 0;
        for (const ev of events) {
            registrations += ev.registrationCount ?? 0;
            verified += ev.attendeeCount ?? 0;
            paid += ev.paidRegistrationCount ?? 0;
            unpaid += ev.unpaidRegistrationCount ?? 0;
        }
        return {
            events: events.length,
            registrations,
            verified,
            paid,
            unpaid,
            revenue: sumPortfolioRevenue(events),
        };
    }, [events]);

    const statusBadge = (ev: OrganizerEvent) => {
        const s = getEventStatus(ev.date, ev.endDate);
        const cls =
            s === 'upcoming'
                ? 'text-green-400/90 border-green-500/30'
                : s === 'ongoing'
                  ? 'text-amber-400/90 border-amber-500/30'
                  : 'text-white/35 border-white/15';
        return (
            <span className={`text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 border ${cls}`}>
                {s}
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-background text-foreground grid-bg flex flex-col">
            <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-4 sm:px-8 border-b border-white/5 bg-black/80 backdrop-blur-xl">
                <Link href="/" className="text-[10px] font-black tracking-[0.25em] uppercase text-white/80 hover:text-white">
                    Gate Protocol
                </Link>
                <nav className="flex items-center gap-4 sm:gap-6">
                    <Link href="/#events" className="text-[8px] tracking-[0.2em] uppercase text-white/40 hover:text-white font-bold">
                        Events
                    </Link>
                    <span className="text-[8px] tracking-[0.2em] uppercase text-blue-300/90 font-bold">Host dashboard</span>
                </nav>
                <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
            </header>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="fixed top-20 right-4 z-[210] max-w-xs px-4 py-3 border border-white/15 bg-black/95 text-[11px] text-white/90 shadow-xl"
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="flex-1 pt-24 pb-16 px-4 sm:px-8 max-w-6xl mx-auto w-full">
                <div className="space-y-8">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                        <div>
                            <p className="text-[9px] tracking-[0.4em] uppercase text-blue-400/90 font-black">Organizer</p>
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Event dashboard</h1>
                            <p className="text-sm text-white/45 mt-1 max-w-xl">
                                Tickets, buyers, check-ins, and QR codes — all in one place.
                            </p>
                        </div>
                        {signedIn && (
                            <Link
                                href="/?create=1"
                                className="shrink-0 px-4 py-2.5 bg-white text-black text-[9px] font-black uppercase tracking-widest hover:bg-neutral-200 text-center"
                            >
                                Create event
                            </Link>
                        )}
                    </div>

                    {!signedIn ? (
                        <div className="border border-white/10 bg-white/[0.02] p-6 sm:p-8 space-y-4 max-w-lg">
                            <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Sign in as host</p>
                            <p className="text-[11px] text-white/55 leading-relaxed">
                                Connect the wallet you used to create events, or sign in with your organizer email.
                            </p>
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!commitEmailSession(signInDraft)) showToast('Enter a valid email.');
                                }}
                                className="flex flex-col sm:flex-row gap-2"
                            >
                                <input
                                    type="email"
                                    value={signInDraft}
                                    onChange={(e) => setSignInDraft(e.target.value)}
                                    placeholder="organizer@email.com"
                                    className="flex-1 bg-white/[0.04] border border-white/10 px-3 py-2.5 text-white text-sm font-mono"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2.5 bg-white text-black text-[9px] font-black uppercase tracking-widest"
                                >
                                    Email sign-in
                                </button>
                            </form>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 text-[9px] font-mono text-white/40">
                                <span>
                                    {isConnected && address
                                        ? `Wallet ${address.slice(0, 6)}…${address.slice(-4)}`
                                        : `Email ${organizerSessionEmail}`}
                                </span>
                                {organizerSessionEmail ? (
                                    <button
                                        type="button"
                                        onClick={clearEmailSession}
                                        className="text-[8px] uppercase tracking-widest border border-white/15 px-2 py-1 hover:text-white"
                                    >
                                        Sign out email
                                    </button>
                                ) : null}
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                {[
                                    { label: 'Events', value: totals.events },
                                    { label: 'Registrations', value: totals.registrations },
                                    { label: 'Verified', value: totals.verified },
                                    {
                                        label: 'Paid tickets',
                                        value: totals.paid,
                                        sub: totals.unpaid > 0 ? `${totals.unpaid} unpaid` : undefined,
                                    },
                                    {
                                        label: 'Est. USDC',
                                        value: totals.revenue > 0 ? totals.revenue : '—',
                                        sub: totals.revenue > 0 ? 'paid × ticket price' : 'free events',
                                    },
                                ].map((s) => (
                                    <div key={s.label} className="border border-white/10 bg-white/[0.02] p-4">
                                        <p className="text-[8px] uppercase tracking-widest text-white/30 font-bold">{s.label}</p>
                                        <p className="text-xl font-black text-white mt-1">{s.value}</p>
                                        {'sub' in s && s.sub ? (
                                            <p className="text-[8px] text-amber-400/80 mt-0.5">{s.sub}</p>
                                        ) : null}
                                    </div>
                                ))}
                            </div>

                            {error ? <p className="text-[10px] text-red-400 font-mono">{error}</p> : null}

                            <div className="flex flex-wrap gap-2">
                                {(['all', 'upcoming', 'ongoing', 'past'] as const).map((f) => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setStatusFilter(f)}
                                        className={`px-3 py-1.5 text-[8px] font-black uppercase tracking-widest border ${
                                            statusFilter === f
                                                ? 'bg-white text-black border-white'
                                                : 'border-white/15 text-white/45 hover:text-white'
                                        }`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>

                            <div className="grid lg:grid-cols-[minmax(0,340px)_1fr] gap-6 items-start">
                                <div className="space-y-2">
                                    <input
                                        type="search"
                                        value={eventSearch}
                                        onChange={(e) => setEventSearch(e.target.value)}
                                        placeholder="Search events…"
                                        className="w-full bg-white/[0.04] border border-white/10 px-3 py-2 text-white text-[11px] font-mono placeholder:text-white/25 focus:outline-none focus:border-white/25"
                                    />
                                <div className="border border-white/10 divide-y divide-white/[0.06] max-h-[65vh] overflow-y-auto">
                                    {loading && events.length === 0 ? (
                                        <p className="p-10 text-center text-[10px] uppercase text-white/25 animate-pulse">
                                            Loading…
                                        </p>
                                    ) : filteredEvents.length === 0 ? (
                                        <div className="p-10 text-center space-y-3">
                                            <p className="text-[10px] uppercase text-white/25">No events in this filter</p>
                                            <Link href="/?create=1" className="text-[9px] uppercase text-white/50 hover:text-white">
                                                Create event
                                            </Link>
                                        </div>
                                    ) : (
                                        filteredEvents.map((ev) => (
                                            <button
                                                key={ev.id}
                                                type="button"
                                                onClick={() => selectEvent(ev.id)}
                                                className={`w-full p-4 text-left transition-colors ${
                                                    selectedId?.toLowerCase() === ev.id.toLowerCase()
                                                        ? 'bg-blue-500/10 border-l-2 border-l-blue-400'
                                                        : 'hover:bg-white/[0.03]'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-sm font-bold truncate">{ev.name}</p>
                                                    {statusBadge(ev)}
                                                </div>
                                                <p className="text-[9px] font-mono text-white/35 mt-1">
                                                    {formatEventDateTime(ev.date)}
                                                </p>
                                                <p className="text-[8px] text-white/40 mt-1">{formatEventTicketSummary(ev)}</p>
                                                <p className="text-[8px] font-mono text-white/30 mt-2">
                                                    {ev.registrationCount ?? 0} reg · {ev.attendeeCount} in
                                                    {(ev.ticketPriceUsdc ?? 0) > 0
                                                        ? ` · ${ev.paidRegistrationCount ?? 0} paid`
                                                        : ''}
                                                </p>
                                            </button>
                                        ))
                                    )}
                                </div>
                                </div>

                                <div className="min-h-[320px] border border-white/10 bg-white/[0.01]">
                                    {!selectedEvent ? (
                                        <div className="p-12 text-center text-[10px] uppercase tracking-widest text-white/25">
                                            Select an event to manage tickets & buyers
                                        </div>
                                    ) : (
                                        <div className="p-5 sm:p-6 space-y-6">
                                            {selectedEvent.bannerUrl ? (
                                                <div className="relative border border-white/10 overflow-hidden h-28 sm:h-36">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={selectedEvent.bannerUrl}
                                                        alt=""
                                                        className="w-full h-full object-cover opacity-90"
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                                                    <h2 className="absolute bottom-3 left-4 text-lg font-bold tracking-tight">
                                                        {selectedEvent.name}
                                                    </h2>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <h2 className="text-lg font-bold tracking-tight">{selectedEvent.name}</h2>
                                                        <p className="text-[9px] font-mono text-white/40 mt-1">
                                                            {formatEventDateTime(selectedEvent.date)}
                                                            {selectedEvent.location ? ` · ${selectedEvent.location}` : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <p className="text-[9px] text-cyan-400/85">
                                                    {formatEventTicketSummary(selectedEvent)}
                                                    {selectedEvent.isBlockchain === false ? (
                                                        <span className="text-white/40"> · Email signup</span>
                                                    ) : (
                                                        <span className="text-white/40"> · Wallet signup</span>
                                                    )}
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {isPast(selectedEvent.date, selectedEvent.endDate) ? (
                                                        <span className="px-3 py-1.5 border border-white/10 text-[8px] font-bold uppercase tracking-wider text-white/35">
                                                            Past — read only
                                                        </span>
                                                    ) : (
                                                        <ActionBtn onClick={() => setShowManage(true)}>
                                                            Edit event
                                                        </ActionBtn>
                                                    )}
                                                    <Link
                                                        href={getPublicRegistrationLink(selectedEvent.id)}
                                                        target="_blank"
                                                        className="px-3 py-1.5 border border-white/15 text-[8px] font-bold uppercase tracking-wider text-white/70 hover:text-white"
                                                    >
                                                        Public page
                                                    </Link>
                                                </div>
                                            </div>

                                            {selectedInsights ? (
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                    <InsightChip label="Registered" value={String(selectedInsights.reg)} />
                                                    <InsightChip
                                                        label="Check-in rate"
                                                        value={
                                                            selectedInsights.checkInPct != null
                                                                ? `${selectedInsights.checkInPct}%`
                                                                : '—'
                                                        }
                                                    />
                                                    {(selectedEvent.ticketPriceUsdc ?? 0) > 0 ? (
                                                        <>
                                                            <InsightChip
                                                                label="Paid"
                                                                value={String(selectedInsights.paid)}
                                                                accent="emerald"
                                                            />
                                                            <InsightChip
                                                                label="Est. USDC"
                                                                value={String(selectedInsights.revenue)}
                                                                accent="cyan"
                                                            />
                                                        </>
                                                    ) : (
                                                        <InsightChip label="Verified" value={String(selectedInsights.verified)} />
                                                    )}
                                                    {selectedInsights.capacity != null ? (
                                                        <div className="col-span-2 sm:col-span-4 space-y-1">
                                                            <div className="flex justify-between text-[8px] font-mono text-white/40">
                                                                <span>Capacity</span>
                                                                <span>
                                                                    {selectedInsights.reg} / {selectedEvent.maxAttendees}
                                                                    {selectedInsights.remaining != null
                                                                        ? ` · ${selectedInsights.remaining} left`
                                                                        : ''}
                                                                </span>
                                                            </div>
                                                            <div className="h-1 bg-white/10 overflow-hidden">
                                                                <div
                                                                    className="h-full bg-blue-400/80 transition-all"
                                                                    style={{ width: `${selectedInsights.capacity}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}

                                            {(selectedEvent.ticketPriceUsdc ?? 0) > 0 &&
                                            selectedEvent.mobileMoneyInstructions?.trim() ? (
                                                <div className="p-3 border border-emerald-500/20 bg-emerald-500/[0.04] space-y-2">
                                                    <p className="text-[8px] uppercase tracking-widest text-emerald-400/90 font-black">
                                                        Mobile money instructions (shown to buyers)
                                                    </p>
                                                    <p className="text-[11px] text-white/75 whitespace-pre-wrap leading-relaxed">
                                                        {selectedEvent.mobileMoneyInstructions}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(
                                                                selectedEvent.mobileMoneyInstructions ?? ''
                                                            );
                                                            showToast('Instructions copied');
                                                        }}
                                                        className="text-[8px] uppercase tracking-widest text-white/45 hover:text-white"
                                                    >
                                                        Copy instructions
                                                    </button>
                                                </div>
                                            ) : null}

                                            {(selectedEvent.ticketPriceUsdc ?? 0) > 0 ? (
                                                <p className="text-[8px] font-mono text-white/30">
                                                    Accepts:{' '}
                                                    {eventAcceptsUsdc(selectedEvent) ? 'USDC ' : ''}
                                                    {eventAcceptsMobileMoney(selectedEvent) ? 'Mobile money' : ''}
                                                    {selectedInsights && selectedInsights.unpaid > 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setRosterFilter('unpaid')}
                                                            className="ml-2 text-amber-400/90 underline hover:text-amber-300"
                                                        >
                                                            {selectedInsights.unpaid} unpaid — view
                                                        </button>
                                                    ) : null}
                                                </p>
                                            ) : null}

                                            <div className="flex flex-col sm:flex-row gap-6 p-4 border border-white/[0.08] bg-white/[0.02]">
                                                <div className="bg-white p-2 shrink-0 mx-auto sm:mx-0">
                                                    <QRCodeCanvas
                                                        id={`dash-qr-${selectedEvent.id}`}
                                                        value={selectedEvent.verificationCode}
                                                        size={100}
                                                        level="H"
                                                    />
                                                </div>
                                                <div className="flex-1 space-y-3 min-w-0">
                                                    <div>
                                                        <p className="text-[8px] uppercase tracking-widest text-white/35">Check-in code</p>
                                                        <code className="text-lg font-mono tracking-[0.2em] text-white">
                                                            {selectedEvent.verificationCode}
                                                        </code>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <ActionBtn
                                                            onClick={() =>
                                                                downloadEventQrImage(
                                                                    selectedEvent,
                                                                    `dash-qr-${selectedEvent.id}`
                                                                )
                                                            }
                                                        >
                                                            Download QR
                                                        </ActionBtn>
                                                        <ActionBtn
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(selectedEvent.verificationCode);
                                                                showToast('Code copied');
                                                            }}
                                                        >
                                                            Copy code
                                                        </ActionBtn>
                                                        <ActionBtn
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(
                                                                    getPublicRegistrationLink(selectedEvent.id)
                                                                );
                                                                showToast('Registration link copied');
                                                            }}
                                                        >
                                                            Copy signup link
                                                        </ActionBtn>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">
                                                        {isPast(selectedEvent.date, selectedEvent.endDate)
                                                            ? 'Final roster'
                                                            : 'Buyers & check-ins'}
                                                    </p>
                                                    <div className="flex gap-2">
                                                        <ActionBtn
                                                            onClick={() => {
                                                                const ok = exportOrganizerRosterCsv(
                                                                    selectedEvent.name,
                                                                    selectedEvent.ticketPriceUsdc ?? 0,
                                                                    attendees,
                                                                    registrations
                                                                );
                                                                if (!ok) showToast('Nothing to export yet.');
                                                            }}
                                                        >
                                                            Export CSV
                                                        </ActionBtn>
                                                        <ActionBtn onClick={fetchRoster} disabled={rosterLoading}>
                                                            {rosterLoading ? '…' : 'Refresh'}
                                                        </ActionBtn>
                                                    </div>
                                                </div>
                                                <input
                                                    type="search"
                                                    value={rosterSearch}
                                                    onChange={(e) => setRosterSearch(e.target.value)}
                                                    placeholder="Search buyers by name, email, wallet…"
                                                    className="w-full bg-white/[0.04] border border-white/10 px-3 py-2 text-white text-[11px] font-mono placeholder:text-white/25"
                                                />
                                                <div className="flex flex-wrap gap-1.5">
                                                    {(
                                                        [
                                                            'all',
                                                            'pending',
                                                            'verified',
                                                            'paid',
                                                            'unpaid',
                                                        ] as const
                                                    ).map((f) => (
                                                        <button
                                                            key={f}
                                                            type="button"
                                                            onClick={() => setRosterFilter(f)}
                                                            className={`px-2 py-1 text-[7px] font-black uppercase tracking-widest border ${
                                                                rosterFilter === f
                                                                    ? f === 'unpaid'
                                                                        ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                                                                        : 'bg-white text-black border-white'
                                                                    : 'border-white/10 text-white/40 hover:text-white'
                                                            }`}
                                                        >
                                                            {f}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div
                                                className={`grid gap-4 ${
                                                    showVerifiedColumn && showPendingColumn
                                                        ? 'sm:grid-cols-2'
                                                        : 'grid-cols-1'
                                                }`}
                                            >
                                                {showVerifiedColumn ? (
                                                    <RosterColumn
                                                        title="Verified check-ins"
                                                        count={filteredAttendees.length}
                                                        loading={rosterLoading}
                                                        empty={
                                                            rosterSearch
                                                                ? 'No matches'
                                                                : 'No check-ins yet'
                                                        }
                                                    >
                                                        {filteredAttendees.map((a, i) => (
                                                            <li
                                                                key={i}
                                                                className="p-2.5 text-[10px] font-mono border-b border-white/[0.04]"
                                                            >
                                                                <p className="text-white/75 truncate">
                                                                    {a.wallet
                                                                        ? `${a.wallet.slice(0, 10)}…${a.wallet.slice(-6)}`
                                                                        : a.email || '—'}
                                                                </p>
                                                                {a.code ? (
                                                                    <p className="text-blue-400/70 text-[8px]">
                                                                        {a.code}
                                                                    </p>
                                                                ) : null}
                                                                <p className="text-[8px] text-white/25">
                                                                    {new Date(a.checkedInAt).toLocaleString('en-GB', {
                                                                        day: '2-digit',
                                                                        month: 'short',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit',
                                                                    })}
                                                                </p>
                                                            </li>
                                                        ))}
                                                    </RosterColumn>
                                                ) : null}
                                                {showPendingColumn ? (
                                                    <RosterColumn
                                                        title="Registered — not checked in"
                                                        count={filteredPendingRegs.length}
                                                        loading={rosterLoading}
                                                        empty={
                                                            rosterSearch || rosterFilter !== 'all'
                                                                ? 'No matches'
                                                                : 'All checked in or none registered'
                                                        }
                                                    >
                                                        {filteredPendingRegs.map((r, i) => {
                                                            const detail = registrationPaymentDetail(r);
                                                            const unpaid = isUnpaidRegistration(
                                                                r.paymentStatus,
                                                                selectedEvent.ticketPriceUsdc ?? 0
                                                            );
                                                            return (
                                                                <li
                                                                    key={i}
                                                                    className="p-2.5 text-[10px] border-b border-white/[0.04] space-y-1"
                                                                >
                                                                    <div className="flex justify-between gap-2">
                                                                        <div className="min-w-0">
                                                                            <p className="text-white/75 truncate font-medium">
                                                                                {r.name ||
                                                                                    r.email ||
                                                                                    r.wallet ||
                                                                                    '—'}
                                                                            </p>
                                                                            {r.email && r.name ? (
                                                                                <p className="text-[8px] text-white/35 truncate">
                                                                                    {r.email}
                                                                                </p>
                                                                            ) : null}
                                                                        </div>
                                                                        <span
                                                                            className={`text-[8px] shrink-0 font-bold uppercase ${
                                                                                unpaid
                                                                                    ? 'text-amber-400/80'
                                                                                    : 'text-emerald-400/70'
                                                                            }`}
                                                                        >
                                                                            {registrationPayLabel(
                                                                                r,
                                                                                selectedEvent.ticketPriceUsdc ?? 0
                                                                            )}
                                                                        </span>
                                                                    </div>
                                                                    {detail ? (
                                                                        <div className="flex items-center gap-2">
                                                                            <p
                                                                                className="text-[8px] font-mono text-white/30 truncate flex-1"
                                                                                title={detail}
                                                                            >
                                                                                {detail}
                                                                            </p>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    navigator.clipboard.writeText(detail);
                                                                                    showToast('Copied');
                                                                                }}
                                                                                className="text-[7px] uppercase text-white/40 hover:text-white shrink-0"
                                                                            >
                                                                                Copy
                                                                            </button>
                                                                        </div>
                                                                    ) : null}
                                                                    <p className="text-[8px] text-white/20">
                                                                        Registered{' '}
                                                                        {new Date(r.registeredAt).toLocaleDateString(
                                                                            'en-GB',
                                                                            { day: '2-digit', month: 'short' }
                                                                        )}
                                                                    </p>
                                                                </li>
                                                            );
                                                        })}
                                                    </RosterColumn>
                                                ) : null}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => fetchManaged()}
                                disabled={loading}
                                className="w-full py-3 border border-white/15 text-[9px] font-black uppercase text-white/45 hover:text-white disabled:opacity-40"
                            >
                                {loading ? 'Refreshing…' : 'Refresh all events'}
                            </button>
                        </>
                    )}
                </div>
            </main>

            {selectedEvent && !isPast(selectedEvent.date, selectedEvent.endDate) && (
                <OrganizerManageModal
                    event={selectedEvent}
                    open={showManage}
                    onClose={() => setShowManage(false)}
                    onSaved={(updated) => {
                        setEvents((prev) =>
                            prev.map((e) => (e.id.toLowerCase() === updated.id.toLowerCase() ? { ...e, ...updated } : e))
                        );
                        fetchRoster();
                        fetchManaged();
                    }}
                    walletAddress={address}
                    organizerEmail={organizerSessionEmail}
                    onToast={showToast}
                />
            )}

            <PageFooter />
        </div>
    );
}

function InsightChip({
    label,
    value,
    accent,
}: {
    label: string;
    value: string;
    accent?: 'emerald' | 'cyan';
}) {
    const valueCls =
        accent === 'emerald'
            ? 'text-emerald-400/90'
            : accent === 'cyan'
              ? 'text-cyan-400/90'
              : 'text-white';
    return (
        <div className="border border-white/[0.08] bg-white/[0.02] px-3 py-2">
            <p className="text-[7px] uppercase tracking-widest text-white/30 font-bold">{label}</p>
            <p className={`text-sm font-black mt-0.5 ${valueCls}`}>{value}</p>
        </div>
    );
}

function ActionBtn({
    children,
    onClick,
    disabled,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="px-3 py-1.5 bg-white/10 border border-white/15 text-[8px] font-bold uppercase tracking-wider text-white/80 hover:bg-white/15 disabled:opacity-40"
        >
            {children}
        </button>
    );
}

function RosterColumn({
    title,
    count,
    loading,
    empty,
    children,
}: {
    title: string;
    count: number;
    loading: boolean;
    empty: string;
    children: React.ReactNode;
}) {
    return (
        <div className="border border-white/[0.06] bg-white/[0.02] rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-white/[0.06] flex justify-between">
                <p className="text-[9px] uppercase tracking-widest font-bold text-white/50">{title}</p>
                <span className="text-[9px] font-mono text-white/35">{count}</span>
            </div>
            <ul className="max-h-[220px] overflow-y-auto">
                {loading ? (
                    <li className="p-4 text-center text-[9px] text-white/20 animate-pulse">Loading…</li>
                ) : count === 0 ? (
                    <li className="p-4 text-center text-[9px] text-white/25">{empty}</li>
                ) : (
                    children
                )}
            </ul>
        </div>
    );
}

export function OrganizerDashboard() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center text-[10px] uppercase tracking-widest text-white/30">
                    Loading dashboard…
                </div>
            }
        >
            <OrganizerDashboardInner />
        </Suspense>
    );
}
