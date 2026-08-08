'use client';
import Link from 'next/link';

const LINKS = [
    { label: 'About', href: '/about' },
    { label: 'Host', href: '/organizer' },
    { label: 'Leaderboard', href: '/leaderboard' },
    { label: 'Developer', href: '/developer' },
    { label: 'Terms', href: '/terms' },
    { label: 'Privacy', href: '/privacy' },
] as const;

export function PageFooter() {
    return (
        <footer className="relative z-10 border-t border-white/5 bg-[#050505] mt-auto w-full max-w-[100vw] overflow-x-clip">
            <div className="max-w-4xl mx-auto w-full px-5 sm:px-6 lg:px-12 py-6">
                <nav
                    aria-label="Footer"
                    className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2.5 sm:gap-x-0 sm:gap-y-2"
                >
                    {LINKS.map((link, i) => (
                        <span key={link.label} className="inline-flex items-center">
                            <Link
                                href={link.href}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[9px] tracking-[0.18em] sm:tracking-[0.28em] uppercase text-white/40 hover:text-white transition-colors font-bold whitespace-nowrap"
                            >
                                {link.label}
                            </Link>
                            {i < LINKS.length - 1 ? (
                                <span
                                    className="hidden sm:inline text-white/15 text-[10px] mx-3.5 select-none"
                                    aria-hidden
                                >
                                    |
                                </span>
                            ) : null}
                        </span>
                    ))}
                </nav>
            </div>

            <div className="border-t border-white/[0.03] px-5 py-3 text-center">
                <span className="block text-[7px] font-mono tracking-[0.16em] sm:tracking-[0.28em] text-white/20 uppercase leading-relaxed">
                    © 2026 GATE PROTOCOL. Built on Stellar.
                </span>
            </div>
        </footer>
    );
}
