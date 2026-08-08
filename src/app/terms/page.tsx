'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { PageFooter } from '@/components/PageFooter';

const sections = [
    {
        title: '1. Acceptance of Terms',
        body: 'By accessing or using GATE PROTOCOL (the "Protocol", "we", "us"), including the website and any related app surfaces, you agree to these Terms of Service. If you do not agree, do not use the Protocol. These terms apply to organisers (hosts), attendees, and any other visitor who creates events, registers, pays for tickets, checks in, or otherwise uses the service.',
    },
    {
        title: '2. The Service',
        body: 'GATE PROTOCOL is an event hosting and attendance verification product. Hosts can create events, set capacity, issue check-in codes, manage rosters, and optionally sell tickets. Attendees can register, pay where required, and receive verified proof of presence. Features may include free or paid tickets, Stellar and Stepay checkout, QR check-in, and host dashboards. The Protocol is provided for lawful event and community use only.',
    },
    {
        title: '3. Host accounts and verification',
        body: 'To create or manage events as a host, you must verify control of a wallet (by signing a challenge message) and/or an email address (by entering a one-time code we send). Knowing or typing an email alone is not enough. You are responsible for keeping access to that wallet or inbox secure. Anyone who completes verification for your host identity may manage events tied to it.',
    },
    {
        title: '4. Tickets and payments',
        body: 'Hosts may offer free events or paid tickets. For paid tickets, hosts enable Stellar and/or Stepay checkout. On-chain payments are verified against the configured treasury and network rules. Crypto transfers that are confirmed on-chain are final and irreversible. GATE PROTOCOL is not a bank, remittance provider, or escrow agent for host payouts unless expressly stated for a specific product feature.',
    },
    {
        title: '5. Organiser responsibilities',
        body: 'Hosts are responsible for accurate event details, lawful ticketing, clear payment options (Stellar and/or Stepay), capacity limits, cancelling only upcoming events when appropriate, and handling disputes with their attendees. Soft-cancelled events stop new signups; historical roster data may be retained. Hosts must not use the Protocol for fraud, scams, unlicensed lottery activity, or other illegal events.',
    },
    {
        title: '6. Attendee registration and check-in',
        body: 'Attendees must provide accurate registration details. Registration may be refused when an event is sold out, cancelled, or misconfigured. Check-in uses the event verification flow (for example a QR or code). Proof-of-attendance records, where issued, are designed as non-transferable presence records and do not by themselves grant ownership, equity, or refund rights.',
    },
    {
        title: '7. Wallets and keys',
        body: 'If you use a cryptocurrency wallet with the Protocol, you alone control your private keys. We cannot reverse on-chain transfers, recover lost keys, or undo a signed transaction. You are responsible for network fees, correct destination addresses, and confirming you are on the intended network before paying.',
    },
    {
        title: '8. VIP and optional paid features',
        body: 'Optional paid features (such as VIP imprint flows) may require on-chain payment confirmation. Payments that settle on-chain are final. We are not responsible for failed payments caused by insufficient funds, wrong network, congestion, or user error.',
    },
    {
        title: '9. Acceptable use',
        body: 'You may not abuse the Protocol, attempt to bypass host verification, reuse payment proofs fraudulently, scrape or attack our systems, impersonate another host or attendee, or interfere with other users. We may suspend access to off-chain interfaces where we reasonably believe these terms are violated.',
    },
    {
        title: '10. Disclaimer',
        body: 'The Protocol is provided "as is" without warranties of any kind, express or implied. We do not guarantee uninterrupted uptime, perfect data accuracy, delivery of every email, or permanence of records beyond what the underlying networks and our infrastructure reasonably allow.',
    },
    {
        title: '11. Limitation of liability',
        body: 'To the fullest extent permitted by law, GATE PROTOCOL and its contributors are not liable for indirect, incidental, special, or consequential damages, lost profits, lost tickets, failed check-ins, or losses arising from blockchain network behaviour, third-party wallets, or host-attendee disputes. Your sole remedy for dissatisfaction with the service is to stop using it.',
    },
    {
        title: '12. Changes',
        body: 'We may update these terms from time to time. The effective date at the top of this page will change when we do. Continued use of the Protocol after an update means you accept the revised terms.',
    },
    {
        title: '13. Contact',
        body: 'Questions about these terms can be directed through the channels listed on the Developer page of the Protocol website.',
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

                </motion.div>
            </main>

            <PageFooter />
        </div>
    );
}
