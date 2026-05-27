'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { validateEventPaymentConfig } from '@/lib/event-payment';
import { isPast } from '@/lib/event-status';
import type { OrganizerEvent } from '@/lib/organizer-event';
import { toDatetimeLocalValue } from '@/lib/organizer-event';

export type ManageFormState = {
    name: string;
    description: string;
    date: string;
    endDate: string;
    location: string;
    maxAttendees: string;
    ticketPriceUsdc: string;
    mobileMoneyInstructions: string;
    ticketAcceptUsdc: boolean;
    ticketAcceptMobileMoney: boolean;
    bannerUrl: string;
};

type Props = {
    event: OrganizerEvent;
    open: boolean;
    onClose: () => void;
    onSaved: (updated: OrganizerEvent) => void;
    walletAddress?: string;
    organizerEmail?: string | null;
    onToast: (msg: string) => void;
};

export function OrganizerManageModal({
    event,
    open,
    onClose,
    onSaved,
    walletAddress,
    organizerEmail,
    onToast,
}: Props) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [bannerUploading, setBannerUploading] = useState(false);
    const [form, setForm] = useState<ManageFormState>(() => buildFormFromEvent(event));

    useEffect(() => {
        if (open) setForm(buildFormFromEvent(event));
    }, [open, event.id]);

    function buildFormFromEvent(ev: OrganizerEvent): ManageFormState {
        return {
            name: ev.name,
            description: ev.description || '',
            date: toDatetimeLocalValue(ev.date),
            endDate: ev.endDate ? toDatetimeLocalValue(ev.endDate) : '',
            location: ev.location || '',
            maxAttendees: ev.maxAttendees != null && ev.maxAttendees > 0 ? String(ev.maxAttendees) : '',
            ticketPriceUsdc: ev.ticketPriceUsdc != null && ev.ticketPriceUsdc > 0 ? String(ev.ticketPriceUsdc) : '',
            mobileMoneyInstructions: ev.mobileMoneyInstructions || '',
            ticketAcceptUsdc: ev.ticketAcceptUsdc !== false,
            ticketAcceptMobileMoney: ev.ticketAcceptMobileMoney !== false,
            bannerUrl: ev.bannerUrl || '',
        };
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isPast(event.date, event.endDate)) {
            setError('Past events cannot be edited.');
            return;
        }
        if (!walletAddress && !organizerEmail) {
            onToast('Sign in as organizer first.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const dateIso = form.date ? new Date(form.date).toISOString() : event.date;
            const endIso = form.endDate.trim() ? new Date(form.endDate).toISOString() : null;

            let ticketAmount: number | null = null;
            const tp = form.ticketPriceUsdc.trim();
            if (tp) {
                const n = parseFloat(tp);
                if (Number.isFinite(n) && n > 0) ticketAmount = n;
            }

            let maxPatch: number | null = null;
            const mx = form.maxAttendees.trim();
            if (mx) {
                const n = parseInt(mx, 10);
                if (Number.isFinite(n) && n > 0) maxPatch = n;
            }

            const payCheck = validateEventPaymentConfig({
                isBlockchain: event.isBlockchain !== false,
                ticketPriceUsdc: ticketAmount ?? undefined,
                ticketAcceptUsdc: form.ticketAcceptUsdc,
                ticketAcceptMobileMoney: form.ticketAcceptMobileMoney,
            });
            if (!payCheck.ok) {
                setError(payCheck.error);
                setSaving(false);
                return;
            }

            const res = await fetch('/api/events', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventId: event.id,
                    ...(walletAddress ? { organizerWallet: walletAddress } : {}),
                    ...(organizerEmail ? { organizerEmail } : {}),
                    name: form.name.trim(),
                    description: form.description.trim(),
                    date: dateIso,
                    endDate: endIso,
                    location: form.location.trim(),
                    maxAttendees: maxPatch,
                    ticketPriceUsdc: ticketAmount,
                    mobileMoneyInstructions: form.mobileMoneyInstructions.trim() || null,
                    ticketAcceptUsdc: form.ticketAcceptUsdc,
                    ticketAcceptMobileMoney: form.ticketAcceptMobileMoney,
                    bannerUrl: form.bannerUrl.trim() || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(typeof data?.error === 'string' ? data.error : 'Update failed');
                return;
            }
            onSaved(data as OrganizerEvent);
            onClose();
            onToast('Event updated.');
        } catch {
            setError('Network error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4"
                    onClick={(e) => e.target === e.currentTarget && onClose()}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 16 }}
                        className="w-full max-w-lg border border-white/10 bg-black max-h-[90vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-5 border-b border-white/10 flex justify-between shrink-0">
                            <div>
                                <p className="text-[9px] tracking-[0.35em] uppercase text-blue-400/90 font-black">Organizer</p>
                                <h2 className="text-lg font-bold">Manage event & tickets</h2>
                            </div>
                            <button type="button" onClick={onClose} className="text-[10px] uppercase text-white/40 hover:text-white">
                                Close
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
                            <div className="p-5 space-y-4 overflow-y-auto flex-1">
                                {error ? <p className="text-[10px] text-red-400 font-mono">{error}</p> : null}
                                <Field label="Name">
                                    <input
                                        value={form.name}
                                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                        required
                                        className={inputCls}
                                    />
                                </Field>
                                <Field label="Description">
                                    <textarea
                                        value={form.description}
                                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                        rows={2}
                                        className={`${inputCls} resize-none`}
                                    />
                                </Field>
                                <Field label="Banner">
                                    {form.bannerUrl ? (
                                        <div className="relative border border-white/10">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={form.bannerUrl} alt="" className="w-full h-28 object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => setForm((f) => ({ ...f, bannerUrl: '' }))}
                                                className="absolute top-2 right-2 text-[8px] uppercase bg-black/80 border border-white/20 px-2 py-1"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="block w-full border border-white/10 px-3 py-4 text-center text-[10px] text-white/40 cursor-pointer hover:border-white/20">
                                            {bannerUploading ? 'Uploading…' : 'Choose image'}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                disabled={bannerUploading}
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    setBannerUploading(true);
                                                    try {
                                                        const fd = new FormData();
                                                        fd.set('file', file);
                                                        fd.set('eventId', event.id);
                                                        if (walletAddress) fd.set('organizerWallet', walletAddress);
                                                        if (organizerEmail) fd.set('organizerEmail', organizerEmail);
                                                        const res = await fetch('/api/events/upload-banner', {
                                                            method: 'POST',
                                                            body: fd,
                                                        });
                                                        const data = await res.json();
                                                        if (data.url) setForm((f) => ({ ...f, bannerUrl: data.url }));
                                                        else onToast(data.error || 'Upload failed');
                                                    } catch {
                                                        onToast('Upload failed');
                                                    } finally {
                                                        setBannerUploading(false);
                                                        e.target.value = '';
                                                    }
                                                }}
                                            />
                                        </label>
                                    )}
                                </Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Start">
                                        <input
                                            type="datetime-local"
                                            value={form.date}
                                            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                                            required
                                            className={`${inputCls} text-[11px] [color-scheme:dark]`}
                                        />
                                    </Field>
                                    <Field label="End">
                                        <input
                                            type="datetime-local"
                                            value={form.endDate}
                                            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                                            className={`${inputCls} text-[11px] [color-scheme:dark]`}
                                        />
                                    </Field>
                                </div>
                                <Field label="Location">
                                    <input
                                        value={form.location}
                                        onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                                        className={inputCls}
                                    />
                                </Field>
                                <Field label="Max capacity">
                                    <input
                                        type="number"
                                        min={1}
                                        value={form.maxAttendees}
                                        onChange={(e) => setForm((f) => ({ ...f, maxAttendees: e.target.value }))}
                                        placeholder="Unlimited"
                                        className={`${inputCls} [color-scheme:dark]`}
                                    />
                                </Field>
                                <div className="p-3 border border-white/10 space-y-2">
                                    <label className="text-[9px] uppercase tracking-widest text-white/35 font-bold">
                                        Ticket (USDC) — blank = free
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={form.ticketPriceUsdc}
                                        onChange={(e) => setForm((f) => ({ ...f, ticketPriceUsdc: e.target.value }))}
                                        className={`${inputCls} [color-scheme:dark]`}
                                    />
                                </div>
                                <Field label="Mobile money instructions">
                                    <textarea
                                        value={form.mobileMoneyInstructions}
                                        onChange={(e) => setForm((f) => ({ ...f, mobileMoneyInstructions: e.target.value }))}
                                        rows={3}
                                        className={`${inputCls} resize-none`}
                                    />
                                </Field>
                                {(() => {
                                    const tp = parseFloat(form.ticketPriceUsdc.trim());
                                    const paid = Number.isFinite(tp) && tp > 0;
                                    if (!paid) return null;
                                    return (
                                        <div className="space-y-3 p-3 border border-cyan-500/25 bg-cyan-500/[0.04]">
                                            <p className="text-[9px] uppercase tracking-widest text-cyan-400 font-black">
                                                Payment modes
                                            </p>
                                            {event.isBlockchain !== false ? (
                                                <label className="flex gap-2 cursor-pointer text-[10px] text-white/70">
                                                    <input
                                                        type="checkbox"
                                                        checked={form.ticketAcceptUsdc}
                                                        onChange={(e) =>
                                                            setForm((f) => ({ ...f, ticketAcceptUsdc: e.target.checked }))
                                                        }
                                                    />
                                                    Accept USDC on Base (wallet signup)
                                                </label>
                                            ) : (
                                                <p className="text-[9px] text-white/40">Email signup — mobile money when enabled below.</p>
                                            )}
                                            <label className="flex gap-2 cursor-pointer text-[10px] text-white/70">
                                                <input
                                                    type="checkbox"
                                                    checked={form.ticketAcceptMobileMoney}
                                                    onChange={(e) =>
                                                        setForm((f) => ({
                                                            ...f,
                                                            ticketAcceptMobileMoney: e.target.checked,
                                                        }))
                                                    }
                                                    className="accent-emerald-500"
                                                />
                                                Accept mobile-money references
                                            </label>
                                        </div>
                                    );
                                })()}
                            </div>
                            <div className="p-5 border-t border-white/10 flex gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-3 border border-white/20 text-[10px] font-bold uppercase text-white/60"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 py-3 bg-white text-black text-[10px] font-black uppercase disabled:opacity-50"
                                >
                                    {saving ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

const inputCls =
    'w-full bg-white/[0.04] border border-white/10 px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/25';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className="text-[9px] uppercase tracking-widest text-white/35 font-bold">{label}</label>
            {children}
        </div>
    );
}
