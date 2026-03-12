'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { PageFooter } from '@/components/PageFooter';

export default function About() {
    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-white selection:text-black flex flex-col">
            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-5 lg:px-12 bg-black/80 backdrop-blur-xl border-b border-white/5">
                <Link href="/" className="flex items-center gap-3 cursor-pointer">
                    <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
                        <defs>
                            <filter id="about-glow" x="-40%" y="-40%" width="180%" height="180%">
                                <feGaussianBlur stdDeviation="1.2" result="blur" />
                                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                        </defs>
                        <g filter="url(#about-glow)">
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

            <main className="pt-32 pb-24 px-6 lg:px-12 max-w-3xl mx-auto">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>

                    {/* Tag */}
                    <div className="inline-block py-1.5 border-b border-white/20 mb-10">
                        <span className="text-[9px] font-bold tracking-[0.4em] uppercase text-white/40">About the Protocol</span>
                    </div>

                    <h1 className="text-5xl lg:text-7xl font-black tracking-tighter leading-none mb-8 text-white">
                        What is<br />
                        <span className="text-white/90">GATE?</span>
                    </h1>

                    <div className="space-y-10 text-white/60 font-light leading-relaxed text-base lg:text-lg">
                        <p>
                            GATE PROTOCOL is a decentralised attendance verification system built on the <span className="text-white/90 font-medium">Base blockchain</span>. It enables event organisers to issue tamper-proof, on-chain proof-of-attendance records to participants — permanently and without intermediaries.
                        </p>
                        <p>
                            Unlike traditional ticketing systems that rely on centralised databases, GATE PROTOCOL uses cryptographic QR codes and smart contracts to ensure every check-in is verifiable, immutable, and owned by the attendee — not the platform.
                        </p>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-16 border-y border-white/5 py-10">
                        {[
                            { label: 'Network', value: 'Base' },
                            { label: 'Standard', value: 'ERC-721' },
                            { label: 'Status', value: 'Live' },
                            { label: 'Available', value: 'Mini App · Web' },
                        ].map(s => (
                            <div key={s.label} className="space-y-2">
                                <p className="text-[9px] tracking-[0.35em] uppercase text-white/30 font-bold">{s.label}</p>
                                <p className="text-xl lg:text-2xl font-black tracking-tight text-white">{s.value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-10 text-white/60 font-light leading-relaxed text-base lg:text-lg">
                        <div>
                            <h2 className="text-lg font-black tracking-tight text-white mb-3 uppercase">How it works</h2>
                            <ol className="space-y-3 list-none">
                                {[
                                    'An organiser creates an event and receives a unique QR verification code.',
                                    'Attendees connect their wallet and scan the QR code at the event.',
                                    'The protocol verifies the code on-chain and mints a non-transferable POAP-style token.',
                                    'The token lives in the attendee\'s wallet as permanent proof of presence.',
                                ].map((step, i) => (
                                    <li key={i} className="flex gap-4 items-start">
                                        <span className="text-[9px] font-mono text-accent/60 mt-1 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                                        <span>{step}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>

                        <div>
                            <h2 className="text-lg font-black tracking-tight text-white mb-3 uppercase">Why Base?</h2>
                            <p>Base offers near-zero transaction costs, Ethereum-level security, and EVM compatibility — making it the ideal layer for high-volume attendance verification without burdening users with gas fees.</p>
                        </div>
                    </div>


                </motion.div>
            </main>

            <PageFooter />
        </div>
    );
}
