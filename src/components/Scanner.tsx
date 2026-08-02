'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';

interface ScannerProps {
    onScan: (data: string) => void | Promise<void>;
    onClose: () => void;
    /** Parent is calling /api/verify */
    busy?: boolean;
    /** Inline status / error shown above the actions */
    status?: string | null;
}

export const Scanner: React.FC<ScannerProps> = ({ onScan, onClose, busy = false, status = null }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [manualMode, setManualMode] = useState(true);
    const [manualCode, setManualCode] = useState('');
    const submittingRef = useRef(false);

    useEffect(() => {
        if (manualMode || busy) return;
        const codeReader = new BrowserMultiFormatReader();

        if (videoRef.current) {
            codeReader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
                if (result && !submittingRef.current) {
                    submittingRef.current = true;
                    void Promise.resolve(onScan(result.getText().trim().toUpperCase())).finally(() => {
                        submittingRef.current = false;
                    });
                    codeReader.reset();
                }
                if (err && !(err.name === 'NotFoundException')) {
                    console.error(err);
                }
            });
        }

        return () => {
            codeReader.reset();
        };
    }, [onScan, manualMode, busy]);

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || submittingRef.current) return;
        const code = manualCode.trim().toUpperCase();
        if (!code) return;
        submittingRef.current = true;
        void Promise.resolve(onScan(code)).finally(() => {
            submittingRef.current = false;
        });
    };

    return (
        <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4 lg:p-8">
            <div className="relative w-full max-w-xl border border-white/10 bg-black overflow-hidden">
                <div className="p-6 lg:p-8 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-4">
                        <span className="text-[10px] font-bold tracking-[0.3em] uppercase">
                            {busy ? 'Verifying…' : 'Auth_Session_Active'}
                        </span>
                        <div
                            className={`w-1.5 h-1.5 rounded-full animate-pulse ${busy ? 'bg-amber-400' : 'bg-accent'}`}
                        />
                    </div>
                </div>

                <div className="relative aspect-video bg-neutral-950 overflow-hidden flex items-center justify-center">
                    {!manualMode ? (
                        <>
                            <video ref={videoRef} className="w-full h-full object-cover opacity-60 grayscale" />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-48 h-48 border border-white/20">
                                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white -translate-x-px -translate-y-px" />
                                    <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white translate-x-px -translate-y-px" />
                                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white -translate-x-px translate-y-px" />
                                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white translate-x-px translate-y-px" />
                                </div>
                            </div>
                        </>
                    ) : (
                        <form onSubmit={handleManualSubmit} className="w-full px-6 lg:px-12 space-y-6">
                            <div className="space-y-3">
                                <label className="text-[10px] uppercase tracking-[0.4em] text-white/50 font-bold block text-center">
                                    Enter Verification Code
                                </label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={manualCode}
                                    disabled={busy}
                                    onChange={(e) => setManualCode(e.target.value)}
                                    placeholder="E.G. XJ39K2L"
                                    className="w-full bg-white/[0.03] border border-white/10 px-6 py-4 text-center text-xl lg:text-2xl font-mono text-white placeholder:text-white/10 focus:outline-none focus:border-white/30 transition-all tracking-[0.3em] uppercase disabled:opacity-50"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={busy || !manualCode.trim()}
                                className="w-full py-4 border border-white/20 hover:bg-white hover:text-black transition-all text-[10px] font-bold tracking-[0.3em] uppercase disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit"
                            >
                                {busy ? 'Verifying attendance…' : 'Authenticate Manual Input'}
                            </button>
                        </form>
                    )}

                    <div className="absolute bottom-6 left-8">
                        <div className="flex items-center gap-2">
                            {!manualMode && !busy && <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
                            <span className="text-[10px] uppercase tracking-[0.2em] font-mono opacity-80">
                                {busy ? 'Verify.in_progress' : manualMode ? 'Input.buffer' : 'Capture.raw'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="p-6 md:p-10 flex flex-col items-center gap-6">
                    {status ? (
                        <p
                            className={`text-[10px] uppercase tracking-[0.14em] font-semibold text-center leading-relaxed px-2 ${
                                /fail|denied|invalid|register|connect|closed|error|network/i.test(status)
                                    ? 'text-amber-300/90'
                                    : 'text-white/70'
                            }`}
                        >
                            {status}
                        </p>
                    ) : (
                        <p className="text-secondary text-[10px] uppercase tracking-[0.2em] font-light text-center opacity-80">
                            {busy
                                ? 'Hang tight — check-in can take a few seconds (mint may follow).'
                                : manualMode
                                  ? 'Verification codes are 8-character alphanumeric strings issued by event organizers.'
                                  : 'Position the verification code within the optical focus frame to authenticate.'}
                        </p>
                    )}

                    <div className="w-full flex flex-col items-center gap-4">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setManualMode(!manualMode)}
                            className="text-[10px] font-bold tracking-[0.3em] uppercase border-b border-white/20 pb-1 hover:border-white transition-all opacity-40 hover:opacity-100 disabled:opacity-20"
                        >
                            {manualMode ? 'Switch to Optical Scan' : 'Enter Code Manually'}
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className="w-full py-4 border border-white/5 hover:bg-white/5 transition-all mt-4 disabled:opacity-40"
                        >
                            <span className="text-[10px] tracking-[0.4em] uppercase font-bold text-white/40">
                                Cancel Session
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
