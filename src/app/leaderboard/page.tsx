'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageFooter } from '@/components/PageFooter';

type Tab = 'attendees' | 'organizers';

interface LeaderboardAttendee {
    rank: number;
    displayLabel: string;
    basescanAddress: string | null;
    eventCount: number;
}

interface LeaderboardOrganizer {
    rank: number;
    displayLabel: string;
    basescanAddress: string | null;
    eventCount: number;
    totalAttendees: number;
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
            {/* Nav */}
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

            <main className="pt-32 pb-24 px-6 lg:px-12 max-w-2xl mx-auto w-full">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <div className="inline-block py-1.5 border-b border-white/20 mb-8">
                        <span className="text-[9px] font-bold tracking-[0.4em] uppercase text-white/40">Protocol Rankings</span>
                    </div>

                    <h1 className="text-4xl lg:text-6xl font-black tracking-tighter leading-none mb-2 text-white">
                        Leaderboard
                    </h1>
                    <p className="text-white/50 text-sm mb-10">
                        Top attendees and organisers on GATE PROTOCOL
                    </p>

                    {/* Tabs */}
                    <div className="flex gap-1 border-b border-white/10 mb-8">
                        {(['attendees', 'organizers'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-6 py-3 text-[10px] font-bold tracking-[0.25em] uppercase transition-colors ${
                                    tab === t
                                        ? 'text-white border-b-2 border-white -mb-[1px]'
                                        : 'text-white/40 hover:text-white/70'
                                }`}
                            >
                                {t === 'attendees' ? 'Top Attendees' : 'Top Organisers'}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="py-20 text-center">
                            <div className="inline-block w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 mt-4">Loading rankings…</p>
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            {tab === 'attendees' ? (
                                <motion.div
                                    key="attendees"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="space-y-2"
                                >
                                    {attendees.length === 0 ? (
                                        <p className="text-white/40 text-sm py-12 text-center">No attendance records yet. Be the first to verify at an event.</p>
                                    ) : (
                                        attendees.map((a, i) => {
                                            const rowClass =
                                                'flex items-center justify-between py-4 px-4 border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/10 transition-colors block';
                                            const inner = (
                                                <>
                                                    <div className="flex items-center gap-4 min-w-0">
                                                        <span className={`text-lg font-black w-8 shrink-0 ${i < 3 ? 'text-white' : 'text-white/50'}`}>
                                                            #{a.rank}
                                                        </span>
                                                        <span
                                                            className={`text-sm text-white/90 truncate ${a.basescanAddress ? 'font-mono' : 'font-sans font-medium'}`}
                                                        >
                                                            {a.displayLabel}
                                                        </span>
                                                    </div>
                                                    <span className="text-sm font-bold text-white/70 shrink-0">{a.eventCount} events</span>
                                                </>
                                            );
                                            return a.basescanAddress ? (
                                                <a
                                                    key={`${a.rank}-${a.basescanAddress}`}
                                                    href={`https://basescan.org/address/${a.basescanAddress}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`${rowClass} cursor-pointer`}
                                                >
                                                    {inner}
                                                </a>
                                            ) : (
                                                <div
                                                    key={`${a.rank}-${a.displayLabel}`}
                                                    className={`${rowClass} cursor-default`}
                                                >
                                                    {inner}
                                                </div>
                                            );
                                        })
                                    )}
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="organizers"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="space-y-2"
                                >
                                    {organizers.length === 0 ? (
                                        <p className="text-white/40 text-sm py-12 text-center">No organisers yet. Create your first event to get on the board.</p>
                                    ) : (
                                        organizers.map((o, i) => {
                                            const rowClass =
                                                'flex items-center justify-between py-4 px-4 border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/10 transition-colors block';
                                            const inner = (
                                                <>
                                                    <div className="flex items-center gap-4 min-w-0">
                                                        <span className={`text-lg font-black w-8 shrink-0 ${i < 3 ? 'text-white' : 'text-white/50'}`}>
                                                            #{o.rank}
                                                        </span>
                                                        <span
                                                            className={`text-sm text-white/90 truncate ${o.basescanAddress ? 'font-mono' : 'font-sans font-medium'}`}
                                                        >
                                                            {o.displayLabel}
                                                        </span>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className="text-sm font-bold text-white/70 block">{o.totalAttendees} attendees</span>
                                                        <span className="text-[10px] text-white/40">{o.eventCount} events</span>
                                                    </div>
                                                </>
                                            );
                                            return o.basescanAddress ? (
                                                <a
                                                    key={`${o.rank}-${o.basescanAddress}`}
                                                    href={`https://basescan.org/address/${o.basescanAddress}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`${rowClass} cursor-pointer`}
                                                >
                                                    {inner}
                                                </a>
                                            ) : (
                                                <div
                                                    key={`${o.rank}-${o.displayLabel}`}
                                                    className={`${rowClass} cursor-default`}
                                                >
                                                    {inner}
                                                </div>
                                            );
                                        })
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
