'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { PageFooter } from '@/components/PageFooter';

const sections = [
    {
        title: '1. What We Collect',
        body: 'We collect data needed to run event hosting and check-in: public wallet addresses when connected or verified, host email addresses when you request a sign-in code, attendee names and emails you submit at registration, event details you create as a host (including banners and payment instructions), registration and payment status records, and attendance / check-in records. We do not sell personal data.',
    },
    {
        title: '2. On-chain data',
        body: 'Some activity (for example verified crypto ticket payments or on-chain attendance proofs) is recorded on public blockchains. That data is public and may be permanent. By paying or verifying on-chain, you acknowledge that wallet addresses and transaction details can be visible to anyone.',
    },
    {
        title: '3. Off-chain storage',
        body: 'Event metadata, registrations, host session verification state, and related operational data are stored in secure off-chain databases and application infrastructure. Host sign-in uses short-lived codes and signed session cookies so we can confirm you control an email or wallet without storing passwords.',
    },
    {
        title: '4. Cookies and local storage',
        body: 'We use essential cookies for verified host sessions and may use local or session storage for UI state. We do not use advertising pixels or third-party ad analytics as part of the core Protocol product.',
    },
    {
        title: '5. Third-party services',
        body: 'The Protocol may use wallet providers, email delivery services, and cloud infrastructure. Those providers process data under their own terms. On-chain transfers are settled by the relevant networks, not by GATE PROTOCOL as a payment intermediary.',
    },
    {
        title: '6. Data retention',
        body: 'On-chain records generally cannot be deleted. Off-chain event and registration data is retained to operate the product and for host history. You may request deletion of off-chain personal data that is not required to keep the service honest (for example payment uniqueness) by contacting the team via the Developer page.',
    },
    {
        title: '7. Your rights',
        body: 'Depending on your jurisdiction, you may have rights to access, correct, or request deletion of personal data we hold off-chain. Our ability to change or erase public blockchain data is limited or nonexistent.',
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
                    <p className="text-white/30 text-sm font-mono tracking-widest mb-16">Effective: August 1, 2026</p>

                    <div className="space-y-10">
                        {sections.map((s, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: Math.min(i * 0.04, 0.4) }}
                                className="border-b border-white/5 pb-10 last:border-0"
                            >
                                <h2 className="text-sm font-black tracking-tight text-white mb-3 uppercase">{s.title}</h2>
                                <p className="text-white/50 font-light leading-relaxed text-sm lg:text-base">{s.body}</p>
                            </motion.div>
                        ))}
                    </div>

                    <div className="mt-12 pt-8 border-t border-white/5">
                        <p className="text-[10px] font-mono tracking-widest text-white/20 uppercase">© 2026 GATE PROTOCOL. Built on blockchain.</p>
                    </div>

                </motion.div>
            </main>

            <PageFooter />
        </div>
    );
}
