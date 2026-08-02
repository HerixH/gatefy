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
            <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-12 py-5">
                {/* Mobile: even 2-col grid. Desktop: inline row with separators. */}
                <nav
                    aria-label="Footer"
                    className="grid grid-cols-2 gap-x-3 gap-y-3 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-0 sm:gap-y-2"
                >
                    {LINKS.map((link, i) => (
                        <span
                            key={link.label}
                            className="flex items-center justify-center sm:justify-start min-w-0"
                        >
                            <Link
                                href={link.href}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[8px] sm:text-[9px] tracking-[0.14em] sm:tracking-[0.3em] uppercase text-white/35 hover:text-white transition-colors font-bold text-center sm:text-left truncate max-w-full px-1"
                            >
                                {link.label}
                            </Link>
                            {i < LINKS.length - 1 ? (
                                <span
                                    className="hidden sm:inline text-white/10 text-[10px] mx-4 select-none"
                                    aria-hidden
                                >
                                    |
                                </span>
                            ) : null}
                        </span>
                    ))}
                </nav>
            </div>

            <div className="border-t border-white/[0.03] px-4 py-3 text-center">
                <span className="block text-[7px] font-mono tracking-[0.12em] sm:tracking-[0.3em] text-white/15 uppercase leading-relaxed">
                    © 2026 GATE PROTOCOL. Built on blockchain.
                </span>
            </div>
        </footer>
    );
}
