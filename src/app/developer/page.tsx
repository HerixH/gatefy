'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { PageFooter } from '@/components/PageFooter';

const platforms = [
    {
        name: 'Gatefy Protocol',
        tag: 'Live',
        desc: 'Decentralised attendance verification — QR-based proof-of-presence powered by on-chain NFTs. Built for events, conferences, and any gathering that deserves a permanent record.',
        stack: ['Next.js', 'Solidity', 'Wagmi', 'Base'],
        status: 'live',
    },
];



const skills = [
    { category: 'Smart Contracts', items: ['Solidity', 'ERC-721', 'ERC-20', 'Hardhat', 'Foundry'] },
    { category: 'Frontend Web3', items: ['Next.js', 'Wagmi v2', 'RainbowKit', 'Viem', 'TypeScript'] },
    { category: 'Infrastructure', items: ['Base', 'Ethereum', 'IPFS', 'Supabase', 'The Graph'] },
    { category: 'Design & UX', items: ['Tailwind CSS', 'Framer Motion', 'Figma', 'Web3 UX'] },
];

const statusColor: Record<string, string> = {
    live: 'rgba(34,197,94,0.8)',
    dev: 'rgba(59,130,246,0.8)',
    research: 'rgba(168,85,247,0.7)',
};

const truncateAddress = (addr: string) => {
    if (!addr || addr.length < 14) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
};

export default function Developer() {
    const [copied, setCopied] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const WALLET = process.env.NEXT_PUBLIC_TIP_WALLET || '0xYOUR_WALLET_ADDRESS_HERE';
    const displayAddress = revealed ? WALLET : truncateAddress(WALLET);

    const copyWallet = () => {
        navigator.clipboard.writeText(WALLET);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="min-h-screen bg-background text-foreground grid-bg selection:bg-white selection:text-black flex flex-col overflow-x-hidden">
            {/* Nav — match About / main app */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-5 lg:px-12 bg-black/80 backdrop-blur-xl border-b border-white/5">
                <Link href="/" className="flex items-center gap-3 cursor-pointer">
                    <svg width="36" height="36" viewBox="0 0 28 28" fill="none" className="shrink-0">
                        <defs>
                            <filter id="dev-nav-glow" x="-40%" y="-40%" width="180%" height="180%">
                                <feGaussianBlur stdDeviation="1.2" result="blur" />
                                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                        </defs>
                        <g filter="url(#dev-nav-glow)">
                            <rect x="1" y="1" width="26" height="26" rx="1.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                            <path d="M1 7 L1 1 L7 1" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M21 1 L27 1 L27 7" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M1 21 L1 27 L7 27" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M21 27 L27 27 L27 21" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="14" cy="14" r="3" fill="rgba(255,255,255,1)" />
                        </g>
                    </svg>
                    <div className="flex flex-col leading-none gap-[3px]">
                        <span className="text-base font-black tracking-[0.3em] uppercase text-white">Gatefy</span>
                        <span className="text-[8px] font-bold tracking-[0.45em] uppercase text-white/70">Protocol</span>
                    </div>
                </Link>
                <Link href="/" className="text-[9px] tracking-[0.3em] uppercase text-white/40 hover:text-white transition-colors font-bold">Back</Link>
            </nav>

            <main className="flex-1 pt-32 pb-24 px-6 lg:px-12 max-w-4xl mx-auto w-full">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>

                    {/* Developer header */}
                    <div className="mb-16 relative">
                        <div className="absolute inset-0 bg-white/5 blur-3xl rounded-full -z-10" />
                        <div className="flex items-center justify-between border-b border-white/10 pb-4">
                            <div>
                                <h1 className="text-3xl font-black tracking-tighter text-white">THE DEVELOPER</h1>
                                <p className="text-[10px] tracking-[0.4em] uppercase text-white/60 font-bold">Protocol Architect</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] tracking-[0.4em] uppercase text-white/30 font-bold">Version</p>
                                <p className="text-xs font-mono text-white/50 tracking-wider">1.0.2_STABLE</p>
                            </div>
                        </div>
                    </div>

                    {/* Bio */}
                    <div className="mb-16">
                        <p className="text-white/50 text-base lg:text-lg font-light leading-relaxed max-w-2xl">
                            I&apos;m <span className="text-white/80 font-medium">Herix</span> — a Web3 platform developer specialising in decentralised infrastructure, on-chain identity systems, and blockchain-native user experiences. I build products that don&apos;t ask you to trust a database.
                        </p>
                    </div>

                    {/* Philosophy */}
                    <div className="border border-white/5 bg-white/[0.01] p-8 mb-6 relative overflow-hidden group">
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 blur-3xl group-hover:bg-white/10 transition-colors" />
                        <p className="text-[9px] tracking-[0.4em] uppercase text-white/30 font-bold mb-5">Philosophy</p>
                        <blockquote className="text-white/70 text-lg lg:text-xl font-light leading-relaxed italic border-l-2 border-white/30 pl-6">
                            &ldquo;The best Web3 products feel like magic to the user and read like philosophy to the auditor. I build at both ends of that spectrum.&rdquo;
                        </blockquote>
                    </div>

                    {/* Support */}
                    <div className="border border-white/10 bg-white/[0.02] p-8 relative">
                        <p className="text-[9px] tracking-[0.4em] uppercase font-bold mb-2 text-white/50">Support My Journey</p>
                        <p className="text-white/40 text-sm font-light leading-relaxed mb-7">
                            If my work has brought value to you, consider supporting the build. Every contribution — big or small — helps push the onchain world forward.
                        </p>

                        {/* Wallet tip */}
                        <div className="mb-6">
                            <p className="text-[9px] tracking-[0.3em] uppercase text-white/20 font-bold mb-3">Tip in Crypto · Base / ETH</p>
                            <button
                                onClick={copyWallet}
                                onMouseEnter={() => setRevealed(true)}
                                onMouseLeave={() => setRevealed(false)}
                                onFocus={() => setRevealed(true)}
                                onBlur={() => setRevealed(false)}
                                className="w-full flex items-center gap-3 border border-white/10 bg-white/[0.02] px-4 py-3 hover:border-white/20 hover:bg-white/[0.04] transition-all text-left group select-none"
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-white/60 shrink-0" />
                                <span className="text-[11px] font-mono text-white/50 tracking-wider break-all group-hover:text-white/70 transition-colors flex-1">{displayAddress}</span>
                                <AnimatePresence mode="wait">
                                    {copied ? (
                                        <motion.span key="copied" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-[8px] font-bold tracking-[0.3em] uppercase shrink-0 text-green-400">Copied!</motion.span>
                                    ) : (
                                        <motion.span key="copy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[8px] font-bold tracking-[0.3em] uppercase text-white/20 shrink-0 group-hover:text-white/50">Copy</motion.span>
                                    )}
                                </AnimatePresence>
                            </button>
                            <p className="text-[8px] font-mono tracking-widest text-white/15 uppercase mt-2">Hover to reveal · Click to copy full address</p>
                        </div>

                        {/* Social row */}
                        <div className="flex flex-wrap gap-3">
                            {[
                                { label: 'X / Twitter', href: 'https://x.com/gatefyprotocol' },
                                { label: 'GitHub', href: 'https://github.com/HerixH' },
                                { label: 'Farcaster', href: 'https://farcaster.xyz/herixhangandu' },
                            ].map(s => (
                                <a
                                    key={s.label}
                                    href={s.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[9px] font-bold tracking-[0.3em] uppercase border border-white/10 px-4 py-2.5 text-white/40 hover:text-white hover:border-white/30 transition-all"
                                >
                                    {s.label}
                                </a>
                            ))}
                        </div>
                    </div>

                </motion.div>
            </main>

            <PageFooter />
        </div>


    );
}
