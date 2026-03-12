'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { PageFooter } from '@/components/PageFooter';

const sections = [
    {
        title: '1. What We Collect',
        body: 'GATE PROTOCOL collects only the minimum data necessary to operate: your public wallet address (when connected), event metadata you submit as an organiser, and attendance records associated with your wallet. We do not collect names, emails, or any personally identifiable off-chain information unless voluntarily provided.',
    },
    {
        title: '2. On-Chain Data',
        body: 'All attendance records and token issuances are stored on the Base blockchain. This data is public, permanent, and immutable by design. By using the Protocol, you acknowledge that your wallet address and associated records are visible on-chain to anyone.',
    },
    {
        title: '3. Off-Chain Storage',
        body: 'Event metadata (name, description, date, location, and banner image) is stored in a secure off-chain database. This data is retained solely to serve the Protocol interface and may be deleted upon request for records not yet tied to verified on-chain activity.',
    },
    {
        title: '4. Cookies & Analytics',
        body: 'We do not use tracking cookies, advertising pixels, or third-party analytics. Any local storage used is strictly for UI state and wallet session continuity.',
    },
    {
        title: '5. Third-Party Services',
        body: 'The Protocol integrates with third-party wallet connectivity providers. These services operate independently and may have their own privacy policies. USDC transfers for VIP Imprints are processed entirely on-chain with no intermediary.',
    },
    {
        title: '6. Data Retention',
        body: 'On-chain records cannot be deleted. Off-chain event data is retained for the lifetime of the Protocol. You may request deletion of off-chain data not tied to verified on-chain events by contacting the development team.',
    },
    {
        title: '7. Your Rights',
        body: 'Depending on your jurisdiction, you may have the right to access, correct, or request deletion of your personal data. As a decentralised protocol, our ability to act on these rights is limited to off-chain data only.',
    },
];

export default function Privacy() {
    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-white selection:text-black flex flex-col">
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-5 lg:px-12 bg-black/80 backdrop-blur-xl border-b border-white/5">
                <Link href="/" className="flex items-center gap-3 cursor-pointer">
                    <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
                        <defs>
                            <filter id="privacy-glow" x="-40%" y="-40%" width="180%" height="180%">
                                <feGaussianBlur stdDeviation="1.2" result="blur" />
                                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                        </defs>
                        <g filter="url(#privacy-glow)">
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

                    <div className="inline-block py-1.5 border-b border-white/20 mb-10">
                        <span className="text-[9px] font-bold tracking-[0.4em] uppercase text-white/40">Legal</span>
                    </div>

                    <h1 className="text-5xl lg:text-6xl font-black tracking-tighter leading-none mb-4 text-white">
                        Privacy<br />Policy
                    </h1>
                    <p className="text-white/30 text-sm font-mono tracking-widest mb-16">Effective: February 2026</p>

                    <div className="space-y-10">
                        {sections.map((s, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.06 }}
                                className="border-b border-white/5 pb-10 last:border-0"
                            >
                                <h2 className="text-sm font-black tracking-tight text-white mb-3 uppercase">{s.title}</h2>
                                <p className="text-white/50 font-light leading-relaxed text-sm lg:text-base">{s.body}</p>
                            </motion.div>
                        ))}
                    </div>

                    <div className="mt-12 pt-8 border-t border-white/5">
                        <p className="text-[10px] font-mono tracking-widest text-white/20 uppercase">© 2026 GATE PROTOCOL — Built on Base. Data minimised by design.</p>
                    </div>

                </motion.div>
            </main>

            <PageFooter />
        </div>
    );
}
