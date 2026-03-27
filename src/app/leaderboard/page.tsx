'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageFooter } from '@/components/PageFooter';

type Tab = 'attendees' | 'organizers';

interface LeaderboardAttendee {
    rank: number;
    displayLabel: string;
    participantType: 'wallet' | 'email';
    eventCount: number;
}

interface LeaderboardOrganizer {
    rank: number;
    displayLabel: string;
    organizerType: 'wallet' | 'email';
    eventCount: number;
    totalAttendees: number;
    emailSignupEvents: number;
    walletSignupEvents: number;
}

export default function LeaderboardPage() {
    const [tab, setTab] = useState<Tab>('attendees');
    const [attendees, setAttendees] = useState<LeaderboardAttendee[]>([]);
    const [organizers, setOrganizers] = useState<LeaderboardOrganizer[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/leaderboard?type=${tab}`)
            .then((r) => r.json())
            .then((data) => {
                if (tab === 'attendees') setAttendees(data.attendees ?? []);
                else setOrganizers(data.organizers ?? []);
            })
            .catch(() => {
                if (tab === 'attendees') setAttendees([]);
                else setOrganizers([]);
            })
            .finally(() => setLoading(false));
    }, [tab]);

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-white selection:text-black flex flex-col">
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-5 lg:px-12 bg-black/80 backdrop-blur-xl border-b border-white/5">
                <Link href="/" className="flex items-center gap-3 cursor-pointer">
                    <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
                        <defs>
                            <filter id="lb-glow" x="-40%" y="-40%" width="180%" height="180%">
                                <feGaussianBlur stdDeviation="1.2" result="blur" />
                                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                        </defs>
                        <g filter="url(#lb-glow)">
                            <rect x="1" y="1" width="26" height="26" rx="1.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                            <path d="M1 7 L1 1 L7 1" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M21 1 L27 1 L27 7" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M1 21 L1 27 L7 27" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M21 27 L27 27 L27 21" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="14" cy="14" r="3" fill="rgba(255,255,255,1)" />
                        </g>
                    </svg>
                    <div className="flex flex-col leading-none gap-[3px]">
                        <span className="text-sm font-black tracking-[0.3em] uppercase text-white">GATE</span>
                        <span className="text-[7px] font-bold tracking-[0.45em] uppercase text-white/70">Protocol</span>
                    </div>
                </Link>
                <Link href="/" className="text-[9px] tracking-[0.3em] uppercase text-white/40 hover:text-white transition-colors font-bold">Back</Link>
            </nav>

            <main className="pt-28 pb-20 px-5 lg:px-10 max-w-lg mx-auto w-full">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}>
                    <div className="inline-block py-1 border-b border-white/15 mb-5">
                        <span className="text-[8px] font-bold tracking-[0.35em] uppercase text-white/35">Protocol Rankings</span>
                    </div>

                    <h1 className="text-3xl lg:text-4xl font-black tracking-tighter leading-none mb-1.5 text-white">
                        Leaderboard
                    </h1>
                    <p className="text-white/45 text-xs mb-6 max-w-sm leading-relaxed">
                        Stats only — no explorer links. Email and wallet ranked the same.
                    </p>

                    <div className="flex gap-0 border-b border-white/10 mb-4">
                        {(['attendees', 'organizers'] as const).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTab(t)}
                                className={`px-4 py-2.5 text-[9px] font-bold tracking-[0.2em] uppercase transition-all duration-300 ease-out ${
                                    tab === t
                                        ? 'text-white border-b-2 border-white -mb-px'
                                        : 'text-white/35 hover:text-white/65'
                                }`}
                            >
                                {t === 'attendees' ? 'Top Attendees' : 'Top Organisers'}
                            </button>
                        ))}
                    </div>

                    <p className="text-[9px] text-white/30 uppercase tracking-[0.18em] mb-4 leading-snug">
                        {tab === 'attendees'
                            ? 'Ranked by how many events you attended (verified check-ins).'
                            : 'Ranked by total verified attendees across your events.'}
                    </p>

                    {loading ? (
                        <div className="py-16 text-center">
                            <div className="inline-block w-6 h-6 border-2 border-white/15 border-t-white/80 rounded-full animate-spin" />
                            <p className="text-[9px] tracking-[0.25em] uppercase text-white/35 mt-3">Loading…</p>
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            {tab === 'attendees' ? (
                                <motion.div
                                    key="attendees"
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                                    className="space-y-2"
                                >
                                    {attendees.length === 0 ? (
                                        <p className="text-white/35 text-xs py-10 text-center">No attendance records yet.</p>
                                    ) : (
                                        attendees.map((a, i) => (
                                            <div
                                                key={`${a.rank}-${a.displayLabel}-${a.participantType}`}
                                                className="flex items-center justify-between gap-3 py-2.5 px-3 sm:px-3.5 border border-white/[0.07] bg-white/[0.02] rounded-2xl shadow-sm shadow-black/20 hover:border-white/12 hover:bg-white/[0.035] transition-all duration-300 ease-out"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                    <span
                                                        className={`text-sm font-black w-7 shrink-0 tabular-nums ${
                                                            i < 3 ? 'text-white' : 'text-white/45'
                                                        }`}
                                                    >
                                                        #{a.rank}
                                                    </span>
                                                    <div className="min-w-0 flex flex-col gap-0.5">
                                                        <span
                                                            className={`block text-[13px] text-white/90 truncate leading-tight ${
                                                                a.participantType === 'wallet' ? 'font-mono' : 'font-sans font-medium'
                                                            }`}
                                                        >
                                                            {a.displayLabel}
                                                        </span>
                                                        <span
                                                            className={`self-start inline-flex items-center px-1.5 py-[1px] text-[7px] font-bold tracking-[0.15em] uppercase rounded-md border ${
                                                                a.participantType === 'email'
                                                                    ? 'border-emerald-500/30 text-emerald-400/85 bg-emerald-500/[0.08]'
                                                                    : 'border-white/12 text-white/40 bg-white/[0.03]'
                                                            }`}
                                                        >
                                                            {a.participantType === 'email' ? 'Email' : 'Wallet'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className="text-lg font-black text-white tabular-nums leading-none block">
                                                        {a.eventCount}
                                                    </span>
                                                    <span className="text-[7px] text-white/35 uppercase tracking-[0.2em] font-medium">
                                                        events
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="organizers"
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                                    className="space-y-2"
                                >
                                    {organizers.length === 0 ? (
                                        <p className="text-white/35 text-xs py-10 text-center">No organisers yet.</p>
                                    ) : (
                                        organizers.map((o, i) => (
                                            <div
                                                key={`${o.rank}-${o.displayLabel}-${o.organizerType}`}
                                                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] shadow-sm shadow-black/20 overflow-hidden transition-all duration-300 ease-out hover:border-white/12 hover:bg-white/[0.035]"
                                            >
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 px-3 sm:px-3.5">
                                                    <span
                                                        className={`text-sm font-black w-7 shrink-0 tabular-nums ${
                                                            i < 3 ? 'text-white' : 'text-white/45'
                                                        }`}
                                                    >
                                                        #{o.rank}
                                                    </span>
                                                    <div className="min-w-0 flex-1 basis-[40%]">
                                                        <span
                                                            className={`block text-[13px] text-white/90 truncate leading-tight ${
                                                                o.organizerType === 'wallet' ? 'font-mono' : 'font-sans font-medium'
                                                            }`}
                                                        >
                                                            {o.displayLabel}
                                                        </span>
                                                        <span
                                                            className={`mt-0.5 inline-flex items-center px-1.5 py-[1px] text-[7px] font-bold tracking-[0.15em] uppercase rounded-md border ${
                                                                o.organizerType === 'email'
                                                                    ? 'border-emerald-500/30 text-emerald-400/85 bg-emerald-500/[0.08]'
                                                                    : 'border-white/12 text-white/40 bg-white/[0.03]'
                                                            }`}
                                                        >
                                                            {o.organizerType === 'email' ? 'Email organiser' : 'Wallet organiser'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-end gap-5 sm:gap-6 ml-auto shrink-0">
                                                        <div className="text-right">
                                                            <p className="text-lg font-black text-white tabular-nums leading-none">{o.totalAttendees}</p>
                                                            <p className="text-[7px] text-white/35 uppercase tracking-[0.18em] mt-0.5">attendees</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-lg font-black text-white/90 tabular-nums leading-none">{o.eventCount}</p>
                                                            <p className="text-[7px] text-white/35 uppercase tracking-[0.18em] mt-0.5">events</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                {(o.emailSignupEvents > 0 || o.walletSignupEvents > 0) && (
                                                    <p className="text-[7px] text-white/30 px-3 sm:px-3.5 pb-2 pl-10 sm:pl-11 leading-snug border-t border-white/[0.05] pt-1.5 bg-black/[0.12]">
                                                        <span className="text-white/25">Types · </span>
                                                        {o.emailSignupEvents > 0 && (
                                                            <span className="text-emerald-400/80">{o.emailSignupEvents} email</span>
                                                        )}
                                                        {o.emailSignupEvents > 0 && o.walletSignupEvents > 0 && (
                                                            <span className="text-white/20"> · </span>
                                                        )}
                                                        {o.walletSignupEvents > 0 && (
                                                            <span className="text-white/45">{o.walletSignupEvents} wallet</span>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    )}
                </motion.div>
            </main>

            <PageFooter />
        </div>
    );
}
