'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EventLocationField } from '@/components/EventLocationField';
import { formatEventTicketSummary } from '@/lib/event-payment';

export type CreateEventFormState = {
    name: string;
    description: string;
    date: string;
    endDate: string;
    location: string;
    maxAttendees: string;
    isVip: boolean;
    vipTokenAddress: string;
    vipMinBalance: string;
    bannerUrl: string;
    isBlockchain: boolean;
    organizerEmail: string;
    organizerDisplayName: string;
    ticketPriceUsdc: string;
    mobileMoneyInstructions: string;
    ticketAcceptUsdc: boolean;
    ticketAcceptMobileMoney: boolean;
    ticketAcceptStellar?: boolean;
};

type StepId = 'host' | 'basics' | 'place' | 'tickets' | 'finish';

type StepDef = {
    id: StepId;
    label: string;
    title: string;
    hint: string;
};

const inputCls =
    'w-full bg-white/[0.04] border border-white/10 px-4 py-3.5 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/[0.06] transition-all rounded-sm';

function PreviewChip({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1 min-w-0">
            <p className="text-[7px] uppercase tracking-[0.2em] text-white/30 font-bold">{label}</p>
            <p className="text-[10px] font-mono text-white/70 truncate" title={value}>
                {value}
            </p>
        </div>
    );
}

type Props = {
    form: CreateEventFormState;
    setForm: React.Dispatch<React.SetStateAction<any>>;
    address?: string | null;
    organizerSessionEmail?: string | null;
    creating: boolean;
    createError: string;
    uploadingBanner: boolean;
    setUploadingBanner: (v: boolean) => void;
    minStartDatetimeLocal: string;
    onSubmit: (e: React.FormEvent) => void;
    onCancel: () => void;
    showToast: (msg: string) => void;
    /** Optional: persist organizer email session on host step. */
    onCommitOrganizerEmail?: (email: string) => void;
};

export function CreateEventWizard({
    form,
    setForm,
    address,
    organizerSessionEmail,
    creating,
    createError,
    uploadingBanner,
    setUploadingBanner,
    minStartDatetimeLocal,
    onSubmit,
    onCancel,
    showToast,
    onCommitOrganizerEmail,
}: Props) {
    const steps = useMemo<StepDef[]>(() => {
        const list: StepDef[] = [];
        if (!address) {
            list.push({
                id: 'host',
                label: 'Host',
                title: 'Who is hosting',
                hint: 'Your email is your host identity for this event.',
            });
        }
        list.push(
            {
                id: 'basics',
                label: 'Basics',
                title: 'Name & schedule',
                hint: 'Clear title and when it starts.',
            },
            {
                id: 'place',
                label: 'Place',
                title: 'Where it happens',
                hint: 'Country, search, or pin on the map.',
            },
            {
                id: 'tickets',
                label: 'Tickets',
                title: 'Price & payments',
                hint: 'Free or paid — choose checkout rails.',
            },
            {
                id: 'finish',
                label: 'Publish',
                title: 'Details & publish',
                hint: 'Banner, signup mode, then register.',
            }
        );
        return list;
    }, [address]);

    const [stepIndex, setStepIndex] = useState(0);
    const [stepError, setStepError] = useState('');

    useEffect(() => {
        setStepIndex(0);
        setStepError('');
    }, [address]);

    useEffect(() => {
        if (stepIndex >= steps.length) setStepIndex(Math.max(0, steps.length - 1));
    }, [steps.length, stepIndex]);

    const step = steps[stepIndex] ?? steps[0];
    const isLast = stepIndex >= steps.length - 1;
    const progress = ((stepIndex + 1) / steps.length) * 100;

    const paidTicket = (() => {
        const tp = parseFloat(form.ticketPriceUsdc.trim());
        return Number.isFinite(tp) && tp > 0 ? tp : 0;
    })();

    const preview = useMemo(() => {
        const paid = paidTicket > 0;
        return {
            ticketLabel: paid ? `Ticket ${paidTicket}` : 'Free',
            registration: form.isBlockchain ? 'Wallet signup' : 'Email signup',
            payments: paid
                ? formatEventTicketSummary({
                      isBlockchain: form.isBlockchain,
                      ticketPriceUsdc: paidTicket,
                      ticketAcceptUsdc: form.ticketAcceptUsdc,
                      ticketAcceptMobileMoney: form.ticketAcceptMobileMoney,
                      ticketAcceptStellar: form.ticketAcceptStellar === true,
                  })
                : 'No payment',
            capacity: form.maxAttendees.trim() ? `${form.maxAttendees} max` : 'Unlimited',
        };
    }, [form, paidTicket]);

    const validateStep = (id: StepId): string | null => {
        if (id === 'host') {
            if (!form.organizerEmail.trim() || !form.organizerDisplayName.trim()) {
                return 'Enter your email and name or company.';
            }
            return null;
        }
        if (id === 'basics') {
            if (!form.name.trim()) return 'Event name is required.';
            if (!form.date.trim()) return 'Start date & time is required.';
            const start = new Date(form.date);
            if (Number.isNaN(start.getTime())) return 'Invalid start date.';
            if (start.getTime() < Date.now() - 60_000) return 'Start must be in the future.';
            if (form.endDate.trim()) {
                const end = new Date(form.endDate);
                if (Number.isNaN(end.getTime())) return 'Invalid end date.';
                if (end.getTime() <= start.getTime()) return 'End must be after the start.';
            }
            return null;
        }
        if (id === 'place') {
            if (!form.location.trim()) return 'Add a location (search or pin on the map).';
            return null;
        }
        if (id === 'tickets') {
            if (paidTicket > 0 && form.ticketAcceptMobileMoney && !form.mobileMoneyInstructions.trim()) {
                return 'Add mobile money instructions for paid mobile checkout.';
            }
            if (
                paidTicket > 0 &&
                form.isBlockchain &&
                !form.ticketAcceptUsdc &&
                !form.ticketAcceptMobileMoney &&
                form.ticketAcceptStellar !== true
            ) {
                return 'Enable at least one payment rail for a paid ticket.';
            }
            if (
                paidTicket > 0 &&
                !form.isBlockchain &&
                !form.ticketAcceptMobileMoney &&
                form.ticketAcceptStellar !== true
            ) {
                return 'Enable mobile money (and/or Stellar) for email signup paid tickets.';
            }
            return null;
        }
        if (id === 'finish' && form.isVip && !form.vipTokenAddress.trim()) {
            return 'VIP events require a token contract address.';
        }
        return null;
    };

    const goNext = () => {
        const err = validateStep(step.id);
        if (err) {
            setStepError(err);
            return;
        }
        if (step.id === 'host' && onCommitOrganizerEmail) {
            onCommitOrganizerEmail(form.organizerEmail.trim());
        }
        setStepError('');
        if (!isLast) setStepIndex((i) => Math.min(i + 1, steps.length - 1));
    };

    const goBack = () => {
        setStepError('');
        setStepIndex((i) => Math.max(0, i - 1));
    };

    return (
        <form
            onSubmit={(e) => {
                if (!isLast) {
                    e.preventDefault();
                    goNext();
                    return;
                }
                onSubmit(e);
            }}
            className="flex flex-col min-h-0 flex-1 overflow-hidden"
        >
            <div className="p-5 lg:p-7 flex items-start justify-between border-b border-white/5 shrink-0 gap-4 relative overflow-hidden">
                <div
                    className="pointer-events-none absolute inset-0 opacity-[0.08]"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle at 12% 0%, #34d399 0%, transparent 42%), radial-gradient(circle at 95% 10%, #3b82f6 0%, transparent 38%)',
                    }}
                />
                <div className="min-w-0 relative z-[1]">
                    <p className="text-[9px] tracking-[0.4em] uppercase text-white/45 font-bold mb-1">
                        {address ? 'Wallet host' : 'Email host'}
                    </p>
                    <h2 className="text-xl font-bold tracking-tighter">New event</h2>
                    <p className="text-[10px] text-white/40 mt-1 max-w-xs">
                        {address
                            ? `${address.slice(0, 6)}…${address.slice(-4)}`
                            : 'Step through host → place → tickets → publish.'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onCancel}
                    className="relative z-[1] px-4 py-2 border border-white/20 text-[10px] font-bold tracking-[0.25em] uppercase text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all"
                >
                    Cancel
                </button>
            </div>

            <div className="px-5 lg:px-7 pt-5 shrink-0 space-y-3">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <p className="text-[8px] uppercase tracking-[0.35em] text-white/35 font-black">
                            Step {stepIndex + 1} / {steps.length} · {step.label}
                        </p>
                        <h3 className="text-2xl font-bold tracking-tighter mt-1">{step.title}</h3>
                        <p className="text-[10px] text-white/40 mt-1">{step.hint}</p>
                    </div>
                    <p className="text-4xl font-black text-white/[0.07] leading-none tabular-nums select-none">
                        {String(stepIndex + 1).padStart(2, '0')}
                    </p>
                </div>
                <div className="h-[2px] bg-white/[0.06] overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500"
                        initial={false}
                        animate={{ width: `${progress}%` }}
                        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                    />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {steps.map((s, i) => {
                        const active = i === stepIndex;
                        const done = i < stepIndex;
                        return (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                    if (i <= stepIndex) {
                                        setStepError('');
                                        setStepIndex(i);
                                    }
                                }}
                                className={`shrink-0 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest border transition-colors ${
                                    active
                                        ? 'border-white/40 text-white bg-white/[0.06]'
                                        : done
                                          ? 'border-emerald-500/30 text-emerald-300/80 hover:bg-emerald-500/10'
                                          : 'border-white/10 text-white/30'
                                }`}
                            >
                                {s.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="p-5 lg:p-7 pt-4 overflow-y-auto flex-1 min-h-0">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step.id}
                        initial={{ opacity: 0, x: 18 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.22 }}
                        className="space-y-5"
                    >
                        {step.id === 'host' && (
                            <div className="space-y-4 p-4 border border-emerald-500/25 bg-emerald-500/[0.05]">
                                <p className="text-[9px] tracking-[0.25em] uppercase text-emerald-400/90 font-bold">
                                    Organizer (no wallet)
                                </p>
                                <div className="space-y-2">
                                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">
                                        Your email *
                                    </label>
                                    <input
                                        type="email"
                                        value={form.organizerEmail}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, organizerEmail: e.target.value }))
                                        }
                                        placeholder="you@company.com"
                                        className={inputCls}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">
                                        Your name or company *
                                    </label>
                                    <input
                                        type="text"
                                        value={form.organizerDisplayName}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, organizerDisplayName: e.target.value }))
                                        }
                                        placeholder="Jane Doe or Acme Inc."
                                        className={inputCls}
                                    />
                                </div>
                                {organizerSessionEmail &&
                                organizerSessionEmail === form.organizerEmail.trim().toLowerCase() ? (
                                    <p className="text-[8px] text-emerald-400/90 font-bold uppercase tracking-widest">
                                        Host session active for this email
                                    </p>
                                ) : (
                                    <p className="text-[8px] text-white/40 leading-relaxed">
                                        Continue saves this email as your host session on this device.
                                    </p>
                                )}
                            </div>
                        )}

                        {step.id === 'basics' && (
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">
                                        Event name *
                                    </label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                        placeholder="e.g. GATE Launch Party"
                                        className={inputCls}
                                        autoFocus
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">
                                            Start *
                                        </label>
                                        <input
                                            type="datetime-local"
                                            min={minStartDatetimeLocal}
                                            value={form.date}
                                            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                                            className={`${inputCls} [color-scheme:dark]`}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">
                                            End
                                        </label>
                                        <input
                                            type="datetime-local"
                                            min={form.date || minStartDatetimeLocal}
                                            value={form.endDate}
                                            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                                            className={`${inputCls} [color-scheme:dark]`}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {step.id === 'place' && (
                            <div className="space-y-5">
                                <EventLocationField
                                    id="create-event-location"
                                    variant="create"
                                    value={form.location}
                                    onChange={(location) => setForm((f) => ({ ...f, location }))}
                                />
                                <div className="space-y-2">
                                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">
                                        Max capacity
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={form.maxAttendees}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, maxAttendees: e.target.value }))
                                        }
                                        placeholder="Leave empty for unlimited"
                                        className={`${inputCls} [color-scheme:dark]`}
                                    />
                                </div>
                            </div>
                        )}

                        {step.id === 'tickets' && (
                            <div className="space-y-5">
                                <div className="space-y-2 p-4 border border-white/10 bg-white/[0.02]">
                                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">
                                        Ticket price (optional)
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={form.ticketPriceUsdc}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, ticketPriceUsdc: e.target.value }))
                                        }
                                        placeholder="0 = free"
                                        className={`${inputCls} [color-scheme:dark]`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">
                                        Mobile money instructions
                                        {paidTicket > 0 && form.ticketAcceptMobileMoney ? ' *' : ' (optional)'}
                                    </label>
                                    <textarea
                                        value={form.mobileMoneyInstructions}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                mobileMoneyInstructions: e.target.value,
                                            }))
                                        }
                                        placeholder="MTN / Airtel MoMo: number, amount, what reference to paste…"
                                        rows={4}
                                        className={`${inputCls} resize-none`}
                                    />
                                </div>
                                {paidTicket > 0 ? (
                                    <div className="space-y-3 p-4 border border-cyan-500/20 bg-cyan-500/[0.05]">
                                        <p className="text-[9px] tracking-[0.25em] uppercase text-cyan-400/95 font-black">
                                            Checkout rails
                                        </p>
                                        {form.isBlockchain ? (
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={form.ticketAcceptUsdc}
                                                    onChange={(e) =>
                                                        setForm((f) => ({
                                                            ...f,
                                                            ticketAcceptUsdc: e.target.checked,
                                                        }))
                                                    }
                                                    className="mt-1 accent-white"
                                                />
                                                <span className="text-[10px] text-white/70">
                                                    <span className="text-white font-bold">Base</span> — crypto for
                                                    wallet signup
                                                </span>
                                            </label>
                                        ) : null}
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={form.ticketAcceptStellar === true}
                                                onChange={(e) =>
                                                    setForm((f) => ({
                                                        ...f,
                                                        ticketAcceptStellar: e.target.checked,
                                                    }))
                                                }
                                                className="mt-1 accent-violet-400"
                                            />
                                            <span className="text-[10px] text-white/70">
                                                <span className="text-violet-300 font-bold">Stellar</span> — crypto
                                                on Stellar
                                            </span>
                                        </label>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={form.ticketAcceptMobileMoney}
                                                onChange={(e) =>
                                                    setForm((f) => ({
                                                        ...f,
                                                        ticketAcceptMobileMoney: e.target.checked,
                                                    }))
                                                }
                                                className="mt-1 accent-emerald-500"
                                            />
                                            <span className="text-[10px] text-white/70">
                                                <span className="text-emerald-400 font-bold">Mobile money</span> —
                                                local pay + reference
                                            </span>
                                        </label>
                                    </div>
                                ) : null}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border border-white/10 bg-white/[0.02]">
                                    <p className="col-span-full text-[8px] uppercase tracking-widest text-white/30 font-bold">
                                        Preview
                                    </p>
                                    <PreviewChip label="Ticket" value={preview.ticketLabel} />
                                    <PreviewChip label="Signup" value={preview.registration} />
                                    <PreviewChip label="Payments" value={preview.payments} />
                                    <PreviewChip label="Capacity" value={preview.capacity} />
                                </div>
                            </div>
                        )}

                        {step.id === 'finish' && (
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">
                                        Description
                                    </label>
                                    <textarea
                                        value={form.description}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, description: e.target.value }))
                                        }
                                        placeholder="Brief event description..."
                                        rows={3}
                                        className={`${inputCls} resize-none`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">
                                        Banner image
                                    </label>
                                    {form.bannerUrl ? (
                                        <div className="relative bg-white/5 min-h-32 border border-white/10 overflow-hidden">
                                            <img
                                                src={form.bannerUrl}
                                                alt="Banner preview"
                                                referrerPolicy="no-referrer"
                                                className="w-full h-32 object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setForm((f) => ({ ...f, bannerUrl: '' }))}
                                                className="absolute top-2 right-2 text-[9px] uppercase tracking-wider font-bold bg-black/80 px-2 py-1 border border-white/20"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="block w-full bg-white/[0.04] border border-white/10 px-4 py-6 text-center text-white/40 text-sm font-mono cursor-pointer hover:border-white/20">
                                            {uploadingBanner ? 'Uploading…' : 'Choose image (optional)'}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                disabled={uploadingBanner}
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    setUploadingBanner(true);
                                                    try {
                                                        const fd = new FormData();
                                                        fd.set('file', file);
                                                        const res = await fetch('/api/events/upload-banner', {
                                                            method: 'POST',
                                                            body: fd,
                                                        });
                                                        const data = await res.json();
                                                        if (data.url) setForm((f) => ({ ...f, bannerUrl: data.url }));
                                                        else showToast(data.error || 'Banner upload failed.');
                                                    } catch {
                                                        showToast('Banner upload failed.');
                                                    } finally {
                                                        setUploadingBanner(false);
                                                        e.target.value = '';
                                                    }
                                                }}
                                            />
                                        </label>
                                    )}
                                </div>

                                <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/5">
                                    <div>
                                        <p className="text-[9px] tracking-[0.3em] uppercase text-white font-bold">
                                            {form.isBlockchain ? 'Registration: wallet' : 'Registration: email'}
                                        </p>
                                        <p className="text-[8px] text-white/30 mt-1">
                                            {form.isBlockchain
                                                ? 'Attendees connect a wallet'
                                                : 'Attendees sign up with email'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={!address}
                                        onClick={() =>
                                            setForm((f) => ({ ...f, isBlockchain: !f.isBlockchain }))
                                        }
                                        className={`w-10 h-5 relative ${
                                            form.isBlockchain ? 'bg-accent' : 'bg-emerald-600/80'
                                        } ${!address ? 'opacity-40' : ''}`}
                                    >
                                        <div
                                            className={`absolute top-1 w-3 h-3 bg-black ${
                                                form.isBlockchain ? 'left-6' : 'left-1'
                                            }`}
                                        />
                                    </button>
                                </div>

                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-[9px] tracking-[0.3em] uppercase text-white font-bold">
                                            VIP access gate
                                        </p>
                                        <p className="text-[8px] text-white/30 mt-1">Require token to verify</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setForm((f) => ({ ...f, isVip: !f.isVip }))}
                                        className={`w-10 h-5 relative ${form.isVip ? 'bg-yellow-500' : 'bg-white/10'}`}
                                    >
                                        <div
                                            className={`absolute top-1 w-3 h-3 bg-black ${
                                                form.isVip ? 'left-6' : 'left-1'
                                            }`}
                                        />
                                    </button>
                                </div>

                                {form.isVip ? (
                                    <div className="space-y-3">
                                        <input
                                            type="text"
                                            value={form.vipTokenAddress}
                                            onChange={(e) =>
                                                setForm((f) => ({ ...f, vipTokenAddress: e.target.value }))
                                            }
                                            placeholder="Token address 0x…"
                                            className="w-full bg-yellow-500/[0.03] border border-yellow-500/20 px-4 py-3 text-white text-sm font-mono"
                                        />
                                        <input
                                            type="number"
                                            value={form.vipMinBalance}
                                            onChange={(e) =>
                                                setForm((f) => ({ ...f, vipMinBalance: e.target.value }))
                                            }
                                            placeholder="Min balance"
                                            className="w-full bg-yellow-500/[0.03] border border-yellow-500/20 px-4 py-3 text-white text-sm font-mono [color-scheme:dark]"
                                        />
                                    </div>
                                ) : null}

                                <div className="p-4 border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent space-y-2">
                                    <p className="text-[8px] uppercase tracking-[0.3em] text-white/35 font-black">
                                        Ready to publish
                                    </p>
                                    <p className="text-sm font-bold tracking-tight">{form.name || 'Untitled event'}</p>
                                    <p className="text-[10px] font-mono text-white/45 leading-relaxed">
                                        {form.location || 'No location'} ·{' '}
                                        {form.date
                                            ? new Date(form.date).toLocaleString('en-GB', {
                                                  day: '2-digit',
                                                  month: 'short',
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                              })
                                            : 'No start'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {(stepError || createError) && (
                    <p className="mt-4 text-[9px] tracking-[0.2em] uppercase text-red-400 font-bold">
                        {stepError || createError}
                    </p>
                )}
            </div>

            <div className="p-5 lg:p-7 pt-4 border-t border-white/5 bg-black shrink-0 flex gap-3">
                {stepIndex > 0 ? (
                    <button
                        type="button"
                        onClick={goBack}
                        className="px-5 py-3 border border-white/20 text-[10px] font-bold tracking-[0.25em] uppercase text-white/70 hover:text-white hover:bg-white/5"
                    >
                        Back
                    </button>
                ) : null}
                {isLast ? (
                    <button type="submit" disabled={creating} className="btn-premium flex-1 py-4 disabled:opacity-50">
                        <span className="tracking-[0.2em] uppercase text-sm font-bold">
                            {creating ? 'Registering…' : 'Register event'}
                        </span>
                    </button>
                ) : (
                    <button type="button" onClick={goNext} className="btn-premium flex-1 py-4">
                        <span className="tracking-[0.2em] uppercase text-sm font-bold">Continue</span>
                    </button>
                )}
            </div>
        </form>
    );
}
