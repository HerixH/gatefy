'use client';
import Link from 'next/link';

export function PageFooter() {
    return (
        <footer className="border-t border-white/5 bg-[#050505] mt-auto">
            <div className="max-w-4xl mx-auto px-6 lg:px-12 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">

                {/* Links */}
                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                    {[
                        { label: 'About', href: '/about' },
                        { label: 'Developer', href: '/developer' },
                        { label: 'Terms', href: '/terms' },
                        { label: 'Privacy', href: '/privacy' },
                    ].map((link, i, arr) => (
                        <span key={link.label} className="flex items-center gap-5">
                            <Link href={link.href} className="text-[9px] tracking-[0.3em] uppercase text-white/35 hover:text-white transition-colors font-bold">
                                {link.label}
                            </Link>
                            {i < arr.length - 1 && <span className="text-white/10 text-[10px]">|</span>}
                        </span>
                    ))}
                </div>
            </div>

            <div className="border-t border-white/[0.03] py-2 text-center">
                <span className="text-[7px] font-mono tracking-[0.3em] text-white/15 uppercase">© 2026 GATE PROTOCOL — Built on Base · Base Mini App & Web</span>
            </div>
        </footer>
    );
}
