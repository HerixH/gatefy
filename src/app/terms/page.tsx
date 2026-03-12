'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { PageFooter } from '@/components/PageFooter';

const sections = [
    {
        title: '1. Acceptance of Terms',
        body: 'By accessing or using the GATE PROTOCOL ("Protocol"), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Protocol. These terms apply to all users, organisers, and attendees interacting with any GATE PROTOCOL smart contract or interface.',
    },
    {
        title: '2. Protocol Use',
        body: 'GATE PROTOCOL is a decentralised attendance verification tool. You may use it to create events, verify attendance, and receive on-chain proof-of-presence tokens. You are solely responsible for ensuring that your use complies with applicable laws in your jurisdiction.',
    },
    {
        title: '3. Wallet Responsibility',
        body: 'You are fully responsible for the security of your cryptocurrency wallet. GATE PROTOCOL does not have access to your private keys and cannot recover lost assets. Any transactions made on-chain are final and irreversible.',
    },
    {
        title: '4. Non-Transferable Tokens',
        body: 'Proof-of-attendance tokens issued by the Protocol are non-transferable by design. They exist solely as a record of verified presence and carry no monetary value, rights, or ownership claims.',
    },
    {
        title: '5. VIP Imprint',
        body: 'VIP Imprint codes are issued after successful USDC payment confirmation on-chain. Payments are final. GATE PROTOCOL takes no responsibility for failed transactions due to insufficient funds, network congestion, or user error.',
    },
    {
        title: '6. Disclaimer',
        body: 'The Protocol is provided "as is" without warranties of any kind. We do not guarantee uptime, data accuracy, or the permanence of any on-chain record beyond what the Base network itself provides.',
    },
    {
        title: '7. Changes',
        body: 'We reserve the right to update these terms at any time. Continued use of the Protocol following any update constitutes acceptance of the revised terms.',
    },
];

export default function Terms() {
    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-white selection:text-black flex flex-col">
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-5 lg:px-12 bg-black/80 backdrop-blur-xl border-b border-white/5">
                <Link href="/" className="flex items-center gap-3 cursor-pointer">
                    <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
                        <defs>
                            <filter id="terms-glow" x="-40%" y="-40%" width="180%" height="180%">
                                <feGaussianBlur stdDeviation="1.2" result="blur" />
                                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                        </defs>
                        <g filter="url(#terms-glow)">
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
                        Terms of<br />Service
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

                </motion.div>
            </main>

            <PageFooter />
        </div>
    );
}
