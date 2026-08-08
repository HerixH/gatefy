'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { PageFooter } from '@/components/PageFooter';

export default function Developer() {
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
                        <span className="text-base font-black tracking-[0.3em] uppercase text-white">GATE</span>
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

                        {/* Social row */}
                        <div className="flex flex-wrap gap-3">
                            {[
                                { label: 'X / Twitter', href: 'https://x.com/gatefyprotocol' },
                                { label: 'GitHub', href: 'https://github.com/HerixH' },
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
