'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';

interface ScannerProps {
    onScan: (data: string) => void;
    onClose: () => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onScan, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [manualMode, setManualMode] = useState(false);
    const [manualCode, setManualCode] = useState('');

    useEffect(() => {
        if (manualMode) return;
        const codeReader = new BrowserMultiFormatReader();

        if (videoRef.current) {
            codeReader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
                if (result) {
                    onScan(result.getText());
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
    }, [onScan, manualMode]);

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (manualCode.trim()) {
            onScan(manualCode.trim().toUpperCase());
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4 lg:p-8">
            <div className="relative w-full max-w-xl border border-white/10 bg-black overflow-hidden">
                <div className="p-6 lg:p-8 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-4">
                        <span className="text-[10px] font-bold tracking-[0.3em] uppercase">Auth_Session_Active</span>
                        <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
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
                                <label className="text-[10px] uppercase tracking-[0.4em] text-white/50 font-bold block text-center">Enter Verification Code</label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={manualCode}
                                    onChange={e => setManualCode(e.target.value)}
                                    placeholder="E.G. XJ39K2L"
                                    className="w-full bg-white/[0.03] border border-white/10 px-6 py-4 text-center text-xl lg:text-2xl font-mono text-white placeholder:text-white/10 focus:outline-none focus:border-white/30 transition-all tracking-[0.3em] uppercase"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-4 border border-white/20 hover:bg-white hover:text-black transition-all text-[10px] font-bold tracking-[0.3em] uppercase"
                            >
                                Authenticate Manual Input
                            </button>
                        </form>
                    )}

                    <div className="absolute bottom-6 left-8">
                        <div className="flex items-center gap-2">
                            {!manualMode && <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
                            <span className="text-[10px] uppercase tracking-[0.2em] font-mono opacity-80">
                                {manualMode ? 'Input.buffer' : 'Capture.raw'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="p-6 md:p-10 flex flex-col items-center gap-6">
                    <p className="text-secondary text-[10px] uppercase tracking-[0.2em] font-light text-center opacity-80">
                        {manualMode
                            ? 'Verification codes are 8-character alphanumeric strings issued by event organizers.'
                            : 'Position the verification code within the optical focus frame to authenticate.'}
                    </p>

                    <div className="w-full flex flex-col items-center gap-4">
                        <button
                            onClick={() => setManualMode(!manualMode)}
                            className="text-[10px] font-bold tracking-[0.3em] uppercase border-b border-white/20 pb-1 hover:border-white transition-all opacity-40 hover:opacity-100"
                        >
                            {manualMode ? 'Switch to Optical Scan' : 'Enter Code Manually'}
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full py-4 border border-white/5 hover:bg-white/5 transition-all mt-4"
                        >
                            <span className="text-[10px] tracking-[0.4em] uppercase font-bold text-white/40">Cancel Session</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
