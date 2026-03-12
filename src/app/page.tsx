'use client';

import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit';
import { motion, AnimatePresence } from 'framer-motion';
import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { QRCodeCanvas } from 'qrcode.react';
import { Scanner } from '@/components/Scanner';

// USDC on Base Mainnet
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
// Treasury wallet that receives the 10 USDC — set in env or hardcode for hackathon
const TREASURY_ADDRESS = (process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? '0x0000000000000000000000000000000000000001') as `0x${string}`;
const USDC_AMOUNT = parseUnits('10', 6); // 10 USDC

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

interface Event {
  id: string;
  name: string;
  description: string;
  date: string;
  endDate?: string;
  location: string;
  organizer: string;
  verificationCode: string;
  createdAt: string;
  attendeeCount: number;
  maxAttendees?: number;
  registrationCount?: number; // number of people who registered (for remaining seats)
  isVip?: boolean;
  vipTokenAddress?: string;
  vipMinBalance?: string;
  bannerUrl?: string;
}

function HomeContent() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();


  const [showScanner, setShowScanner] = useState(false);
  const [minted, setMinted] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [createdEvent, setCreatedEvent] = useState<Event | null>(null); // shown after creation

  // VIP Imprint
  const [showVIP, setShowVIP] = useState(false);
  const [vipStep, setVipStep] = useState<'confirm' | 'paying' | 'minting' | 'done'>('confirm');
  const [vipCode, setVipCode] = useState<string | null>(null);
  const [vipError, setVipError] = useState('');

  // Registration
  const [isUserRegistered, setIsUserRegistered] = useState(false);
  const [isUserVerified, setIsUserVerified] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [attendees, setAttendees] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<{ wallet: string; registeredAt: string }[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  const { writeContract, data: txHash, isPending: isTxPending, error: txError } = useWriteContract();
  const { isSuccess: isTxConfirmed, isLoading: isTxConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const refetchOrganizerLists = () => {
    if (!selectedEvent || !address || selectedEvent.organizer.toLowerCase() !== address.toLowerCase()) return;
    setLoadingAttendees(true);
    Promise.all([
      fetch(`/api/events/attendees?eventId=${selectedEvent.id}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/events/registrations?eventId=${selectedEvent.id}`, { cache: 'no-store' }).then(r => r.json()),
    ])
      .then(([attendeesData, regsData]) => {
        setAttendees(Array.isArray(attendeesData) ? attendeesData : []);
        setRegistrations(Array.isArray(regsData) ? regsData : []);
      })
      .finally(() => setLoadingAttendees(false));
  };

  // Auto-update event status (Upcoming → Ongoing → Past) as time passes
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000); // refresh every 15s so status auto-updates when event goes live
    return () => clearInterval(id);
  }, []);

  // Check registration, verification status, and fetch attendees when event selected
  useEffect(() => {
    if (selectedEvent && address) {
      // 1. Check registration
      fetch(`/api/register?eventId=${selectedEvent.id}&wallet=${address}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(data => setIsUserRegistered(!!data.registered))
        .catch(() => setIsUserRegistered(false));

      // 2. Check if user has already verified for this event
      fetch(`/api/events/verified?eventId=${selectedEvent.id}&wallet=${address}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(data => setIsUserVerified(!!data.verified))
        .catch(() => setIsUserVerified(false));

      // 3. Fetch attendees and registrations if owner (no cache so list is up to date)
      if (selectedEvent.organizer.toLowerCase() === address.toLowerCase()) {
        setLoadingAttendees(true);
        Promise.all([
          fetch(`/api/events/attendees?eventId=${selectedEvent.id}`, { cache: 'no-store' }).then(r => r.json()),
          fetch(`/api/events/registrations?eventId=${selectedEvent.id}`, { cache: 'no-store' }).then(r => r.json()),
        ])
          .then(([attendeesData, regsData]) => {
            setAttendees(Array.isArray(attendeesData) ? attendeesData : []);
            setRegistrations(Array.isArray(regsData) ? regsData : []);
          })
          .finally(() => setLoadingAttendees(false));
      } else {
        setAttendees([]);
        setRegistrations([]);
      }
    } else {
      setIsUserRegistered(false);
      setIsUserVerified(false);
      setAttendees([]);
      setRegistrations([]);
    }
  }, [selectedEvent, address]);

  // Watch for confirmed payment → call vip-imprint API
  useEffect(() => {
    if (isTxConfirmed && txHash && vipStep === 'paying') {
      setVipStep('minting');
      fetch('/api/vip-imprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, txHash }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.code) {
            setVipCode(data.code);
            setVipStep('done');
          } else {
            setVipError(data.error ?? 'Failed to generate imprint');
            setVipStep('confirm');
          }
        })
        .catch(() => {
          setVipError('Network error');
          setVipStep('confirm');
        });
    }
  }, [isTxConfirmed, txHash, vipStep, address]);

  const handleVIPPayment = () => {
    setVipError('');
    setVipStep('paying');

    if (DEV_MODE) {
      // Skip wallet — call API directly with a fake hash
      const fakeHash = `0xDEV${Date.now().toString(16)}` as `0x${string}`;
      setVipStep('minting');
      fetch('/api/vip-imprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address ?? '0xDEV', txHash: fakeHash }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.code) { setVipCode(data.code); setVipStep('done'); }
          else { setVipError(data.error ?? 'Failed'); setVipStep('confirm'); }
        })
        .catch(() => { setVipError('Network error'); setVipStep('confirm'); });
      return;
    }

    // Production: trigger real USDC transfer
    writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [TREASURY_ADDRESS, USDC_AMOUNT],
    });
  };

  // Create event form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    date: '',
    endDate: '',
    location: '',
    maxAttendees: '' as string,
    isVip: false,
    vipTokenAddress: '',
    vipMinBalance: '1',
    bannerUrl: '' as string,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const searchParams = useSearchParams();

  useEffect(() => {
    fetchEvents();
  }, [address]);

  // Auto-select event from URL ?event=ID (for registration links)
  useEffect(() => {
    const eventId = searchParams.get('event');
    if (eventId && events.length > 0) {
      const ev = events.find(e => e.id.toLowerCase() === eventId.toLowerCase());
      if (ev) setSelectedEvent(ev);
    }
  }, [searchParams, events]);

  const fetchEvents = async (): Promise<Event[]> => {
    try {
      const res = await fetch('/api/events', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) {
        setEvents(data);
        return data;
      }
      return [];
    } catch (e) {
      console.error(e);
      return [];
    }
  };

  // ── In-app wallet toast (never triggers RainbowKit modal) ──────────────
  const [walletToast, setWalletToast] = useState<string | null>(null);
  const showWalletToast = (msg: string) => {
    setWalletToast(msg);
    setTimeout(() => setWalletToast(null), 4000);
  };

  const handleScan = async (data: string) => {
    if (!address) {
      setShowScanner(false);
      showWalletToast('Connect your wallet to verify attendance — use the button in the top right.');
      return;
    }
    setScanning(true);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: data, wallet: address }),
      });
      const result = await res.json();
      if (result.success) {
        setIsUserVerified(true);
        if (result.alreadyVerified) {
          showWalletToast(result.message || 'You have already verified attendance for this event.');
        } else {
          setMinted(true);
        }
        setShowScanner(false);
      } else {
        showWalletToast(result.message || 'Verification failed. Check your code and try again.');
      }
    } catch {
      showWalletToast('Network error during verification. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    setCreating(true);
    setCreateError('');
    try {
      // datetime-local returns YYYY-MM-DDTHH:mm (no timezone). Convert to ISO so the user's
      // local time is stored correctly; otherwise Postgres treats it as server (UTC) time.
      const dateIso = form.date ? new Date(form.date).toISOString() : form.date;
      const endDateIso = form.endDate ? new Date(form.endDate).toISOString() : form.endDate;
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          date: dateIso,
          endDate: endDateIso || undefined,
          organizer: address,
          bannerUrl: form.bannerUrl || undefined,
          maxAttendees: form.maxAttendees ? parseInt(form.maxAttendees, 10) : undefined,
        }),
      });
      if (res.ok) {
        const newEvent: Event = await res.json();
        setForm({
          name: '',
          description: '',
          date: '',
          endDate: '',
          location: '',
          maxAttendees: '',
          isVip: false,
          vipTokenAddress: '',
          vipMinBalance: '1',
          bannerUrl: '',
        });
        setShowCreateEvent(false);
        setCreatedEvent(newEvent); // show QR download modal
        await fetchEvents();
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error || 'Failed to create event';
        setCreateError(msg);
        console.error('Create event failed:', msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setCreateError(msg.includes('fetch') ? 'Cannot reach server. Is the dev server running?' : `Network error: ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  const getRegistrationLink = (ev: Event) =>
    (typeof window !== 'undefined' ? window.location.origin : '') + '/?event=' + ev.id;

  const handleDownloadQR = (ev: Event, canvasId: string) => {
    const qrCanvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!qrCanvas) return;
    const regLink = getRegistrationLink(ev);
    const dateStr = formatDateTime(ev.date);
    const locStr = ev.location || 'TBA';

    // Composite canvas: event details + QR + manual code
    const pad = 32;
    const qrSize = 200;
    const w = 400;
    const h = 580;
    const composite = document.createElement('canvas');
    composite.width = w;
    composite.height = h;
    const ctx = composite.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ev.name.toUpperCase(), w / 2, pad + 24);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(dateStr + (locStr !== 'TBA' ? ' · ' + locStr : ''), w / 2, pad + 50);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((w - qrSize - 24) / 2, pad + 70, qrSize + 24, qrSize + 24);
    ctx.drawImage(qrCanvas, (w - qrSize) / 2, pad + 82, qrSize, qrSize);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('Verification Code', w / 2, pad + qrSize + 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(ev.verificationCode, w / 2, pad + qrSize + 132);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('Register: ' + regLink, w / 2, h - pad - 36);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('GATE PROTOCOL · Scan or enter code to verify attendance', w / 2, h - pad);

    const url = composite.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ev.name.replace(/\s+/g, '-').toLowerCase()}-gatefy-qr.png`;
    a.click();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const hasTime = /T\d{1,2}:\d{2}/.test(String(iso).trim()) || iso.includes(':');
    if (hasTime) {
      return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  type EventStatus = 'upcoming' | 'ongoing' | 'past';

  const getEventStatus = (date: string, endDate?: string): EventStatus => {
    if (!date) return 'upcoming';
    const now = new Date();
    const isoTrim = String(date).trim();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    if (/^\d{4}-\d{2}-\d{2}$/.test(isoTrim)) {
      const [y, m, d] = isoTrim.split('-').map(Number);
      const eventDayStart = new Date(y, m - 1, d).getTime();
      const eventDayEnd = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      if (now.getTime() < eventDayStart) return 'upcoming';
      if (now.getTime() <= eventDayEnd) return 'ongoing';
      return 'past';
    }

    const start = new Date(date);
    if (Number.isNaN(start.getTime())) return 'upcoming';

    if (endDate) {
      const end = new Date(endDate);
      if (now < start) return 'upcoming';
      if (now <= end) return 'ongoing';
      return 'past';
    }

    const startDayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
    if (now < start) return 'upcoming';
    if (now <= startDayEnd) return 'ongoing';
    return 'past';
  };

  const isUpcoming = (iso: string, endDate?: string) => getEventStatus(iso, endDate) === 'upcoming';
  const isOngoing = (iso: string, endDate?: string) => getEventStatus(iso, endDate) === 'ongoing';
  const isPast = (iso: string, endDate?: string) => getEventStatus(iso, endDate) === 'past';
  const hasEventStarted = (iso: string) => getEventStatus(iso) !== 'upcoming';

  // Remaining seats = capacity minus registrations (so it updates after someone registers)
  const getRegisteredCount = (ev: Event) => ev.registrationCount ?? ev.attendeeCount;
  const getRemainingSeats = (ev: Event) =>
    ev.maxAttendees != null && ev.maxAttendees > 0
      ? Math.max(0, ev.maxAttendees - getRegisteredCount(ev))
      : null;

  const handleRegister = async () => {
    if (!selectedEvent) return;
    if (!address) {
      showWalletToast('Connect your wallet to register — use the button in the top right.');
      return;
    }
    setRegistering(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedEvent.id, wallet: address }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsUserRegistered(true);
        const list = await fetchEvents();
        const updated = list.find((e) => e.id === selectedEvent.id);
        if (updated) setSelectedEvent(updated);
      } else if (data.error === 'Already registered') {
        setIsUserRegistered(true);
      } else {
        showWalletToast(data.error || 'Registration failed. Please try again.');
      }
    } catch {
      showWalletToast('Network error during registration. Please try again.');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground grid-bg selection:bg-white selection:text-black overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 lg:px-12 lg:py-8 pointer-events-none bg-gradient-to-b from-black to-transparent">
        <div className="flex items-center gap-3 pointer-events-auto cursor-default">
          <svg width="36" height="36" viewBox="0 0 28 28" fill="none" className="shrink-0">
            <defs>
              <filter id="nav-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="1.2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <g filter="url(#nav-glow)">
              <rect x="1" y="1" width="26" height="26" rx="1.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
              <path d="M1 7 L1 1 L7 1" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 1 L27 1 L27 7" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1 21 L1 27 L7 27" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 27 L27 27 L27 21" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="14" cy="14" r="3" fill="rgba(255,255,255,1)" />
            </g>
          </svg>
          {/* Wordmark */}
          <div className="flex flex-col leading-none gap-[3px]">
            <span className="text-base lg:text-lg font-black tracking-[0.3em] uppercase text-white">GATE</span>
            <span className="text-[8px] lg:text-[9px] font-bold tracking-[0.45em] uppercase text-white/70">Protocol</span>
          </div>
        </div>


        <div className="pointer-events-auto scale-75 sm:scale-90 lg:scale-100 origin-right">
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
        </div>
      </nav>

      {/* Wallet toast — never triggers connect modal */}
      <AnimatePresence>
        {walletToast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-20 lg:top-24 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 border border-accent/30 bg-black/90 backdrop-blur-xl flex items-center gap-3 shadow-[0_0_30px_rgba(59,130,246,0.15)]"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
            <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-white/80 whitespace-nowrap">{walletToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <main className="relative pt-32 lg:pt-48 pb-20 lg:pb-32 px-6 lg:px-12 max-w-[1400px] mx-auto min-h-screen flex flex-col justify-center">
        <div className="grid lg:grid-cols-[1fr_400px] gap-12 lg:gap-24 items-start">
          {/* Left: Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center lg:items-start text-center lg:text-left"
          >
            <div className="inline-block py-2 border-b border-white/20 mb-8 lg:mb-12">
              <span className="text-[9px] lg:text-[10px] font-bold tracking-[0.3em] lg:tracking-[0.4em] uppercase text-secondary/80">
                Autonomous Verification Protocol
              </span>
              <span className="block mt-2 text-[8px] lg:text-[9px] font-mono tracking-[0.2em] uppercase text-white/30">
                Base Mini App · Web
              </span>
            </div>

            <h1 className="text-[18vw] sm:text-[12vw] lg:text-[10rem] font-medium leading-[0.8] tracking-tighter mb-6 lg:mb-16 text-gradient">
              THE<br />
              PRESENT<br />
              IS PROOF
            </h1>

            <div className="max-w-xl space-y-8 lg:space-y-12">
              <p className="text-lg lg:text-2xl text-secondary/80 font-light leading-relaxed">
                A digital imprint of your physical journey. Immutable, elegant, and verified on the Base architecture.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 lg:gap-6">
                <button
                  onClick={() => setShowScanner(true)}
                  className="btn-premium flex items-center justify-center gap-4 py-5 lg:py-4"
                >
                  <span className="tracking-[0.2em] uppercase text-sm font-bold">Initiate Scan</span>
                </button>

                {isConnected && (
                  <button
                    onClick={() => setShowCreateEvent(true)}
                    className="px-8 py-5 lg:py-4 border border-white/20 text-white font-medium hover:bg-white/5 transition-all flex items-center justify-center"
                  >
                    <span className="tracking-[0.2em] uppercase text-sm font-bold">Create Event</span>
                  </button>
                )}

                {!isConnected && (
                  <div className="px-8 py-5 lg:py-4 border border-white/5 flex items-center justify-center opacity-40 cursor-not-allowed">
                    <span className="tracking-[0.2em] uppercase text-sm font-bold">Connect to Create Event</span>
                  </div>
                )}
              </div>

            </div>
          </motion.div>

          {/* Right: Events Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-8 pb-12 lg:sticky lg:top-32"
          >
            {/* Live Events */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white">Live Events</p>
                <span className="text-[9px] font-mono text-white/70 tracking-widest">
                  {events.filter(ev => !isPast(ev.date, ev.endDate)).length} Active
                </span>
              </div>

              <div className="border border-white/5 bg-white/[0.01] backdrop-blur-3xl overflow-hidden">
                {events.filter(ev => !isPast(ev.date, ev.endDate)).length === 0 ? (
                  <div className="p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[160px]">
                    <p className="text-[10px] text-center tracking-[0.3em] uppercase opacity-30">No active events</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.05]">
                    {events.filter(ev => !isPast(ev.date, ev.endDate)).map((ev, i) => (
                      <motion.button
                        key={ev.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => setSelectedEvent(ev)}
                        className="w-full text-left hover:bg-white/[0.03] transition-colors group overflow-hidden"
                      >
                        {ev.bannerUrl && (
                          <div className="w-full h-28 bg-white/5 relative overflow-hidden">
                            <img
                              src={ev.bannerUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                            />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-4 p-5">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="w-1 h-1 bg-green-500 rounded-full shadow-[0_0_4px_rgba(34,197,94,0.6)] shrink-0" />
                              {ev.isVip && (
                                <span className="text-[7px] bg-yellow-500/10 text-yellow-500 px-1 border border-yellow-500/20 font-black tracking-widest uppercase shrink-0">VIP</span>
                              )}
                              <p className="text-sm font-bold tracking-tight truncate uppercase">{ev.name}</p>
                            </div>
                            {ev.location ? (
                              <p className="text-[9px] tracking-[0.2em] uppercase text-secondary/40 font-bold truncate pl-3">{ev.location} // {ev.organizer.slice(0, 6)}...{ev.organizer.slice(-4)}</p>
                            ) : (
                              <p className="text-[9px] tracking-[0.2em] uppercase text-secondary/40 font-bold truncate pl-3">ORG: {ev.organizer.slice(0, 6)}...{ev.organizer.slice(-4)}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[9px] font-mono text-secondary/50">{formatDate(ev.date)}</p>
                            <p className="text-[8px] tracking-widest text-secondary/30 mt-0.5">
                              {ev.maxAttendees != null && ev.maxAttendees > 0
                                ? `${getRegisteredCount(ev)} / ${ev.maxAttendees} · ${getRemainingSeats(ev) ?? 0} left`
                                : `${ev.attendeeCount} Verified`}
                            </p>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* User Uploads (Managed Events) — filtered by connected wallet so each wallet sees only its own events */}
            {isConnected && address && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white">Your Uploads</p>
                    <p className="text-[8px] font-mono text-white/40 tracking-wider">
                      This wallet: {address.slice(0, 6)}...{address.slice(-4)}
                    </p>
                  </div>
                  <span className="text-[9px] font-mono text-white/70 tracking-widest">
                    {events.filter(ev => ev.organizer?.toLowerCase() === address.toLowerCase()).length} Total
                  </span>
                </div>

                <div className="border border-white/5 bg-white/[0.01] backdrop-blur-3xl overflow-hidden">
                  {events.filter(ev => ev.organizer?.toLowerCase() === address.toLowerCase()).length === 0 ? (
                    <div className="p-8 flex flex-col items-center justify-center text-center gap-4">
                      <p className="text-[10px] text-center tracking-[0.3em] uppercase opacity-30">No uploads found</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.05]">
                      {events
                        .filter(ev => ev.organizer?.toLowerCase() === address.toLowerCase())
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Show newest uploads first
                        .map((ev, i) => (
                          <motion.button
                            key={`upload-${ev.id}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.04 }}
                            onClick={() => setSelectedEvent(ev)}
                            className="w-full p-4 text-left hover:bg-white/[0.03] transition-colors group"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {isUpcoming(ev.date, ev.endDate) ? (
                                    <div className="w-1 h-1 bg-green-500 rounded-full shrink-0" title="Upcoming" />
                                  ) : isOngoing(ev.date, ev.endDate) ? (
                                    <div className="w-1 h-1 bg-amber-500 rounded-full shrink-0 animate-pulse" title="Ongoing" />
                                  ) : (
                                    <div className="w-1 h-1 bg-white/20 rounded-full shrink-0" title="Past" />
                                  )}
                                  <p className="text-[11px] font-bold tracking-tight truncate opacity-70">{ev.name}</p>
                                </div>
                                <p className="text-[8px] tracking-[0.2em] uppercase text-secondary/20 font-bold truncate pl-3">Managed Asset // {ev.organizer.slice(0, 6)}...{ev.organizer.slice(-4)}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[8px] font-mono text-secondary/40">{formatDateTime(ev.date)}</p>
                                <p className="text-[8px] tracking-widest text-accent mt-0.5">
                                  {ev.maxAttendees != null && ev.maxAttendees > 0
                                    ? `${getRegisteredCount(ev)} / ${ev.maxAttendees} · ${getRemainingSeats(ev) ?? 0} left`
                                    : `${ev.attendeeCount} checkins`}
                                </p>
                              </div>
                            </div>
                          </motion.button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Protocol info */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white">Protocol Info</p>
              <div className="text-xs font-mono tracking-widest leading-loose text-secondary">
                v1.2.0_MINT_AUTH<br />
                SHA_256_VERIFIED<br />
                NON_TRANSFERABLE_ASSET
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Scanner */}
      <AnimatePresence>
        {showScanner && (
          <Scanner onScan={handleScan} onClose={() => setShowScanner(false)} />
        )}
      </AnimatePresence>

      {/* Create Event Modal */}
      <AnimatePresence>
        {showCreateEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 lg:p-8"
            onClick={(e) => e.target === e.currentTarget && setShowCreateEvent(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              className="w-full max-w-lg border border-white/10 bg-black max-h-[90vh] lg:max-h-[92vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header with Cancel */}
              <div className="p-6 lg:p-8 flex items-center justify-between border-b border-white/5 shrink-0">
                <div>
                  <p className="text-[9px] tracking-[0.4em] uppercase text-secondary/40 font-bold mb-1">Wallet Connected</p>
                  <span className="text-[10px] font-mono text-secondary/60 tracking-widest">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateEvent(false)}
                  className="px-4 py-2 border border-white/20 text-[10px] font-bold tracking-[0.25em] uppercase text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleCreateEvent} className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <div className="p-6 lg:p-8 pt-6 space-y-6 overflow-y-auto flex-1 min-h-0">
                <div>
                  <h2 className="text-2xl font-bold tracking-tighter mb-1">New Event</h2>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-secondary/30 font-bold">Protocol registration</p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">Event Name *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. GATE Launch Party"
                      className="w-full bg-white/[0.04] border border-white/10 px-4 py-3.5 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/[0.06] transition-all rounded-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">Start Date & Time *</label>
                      <input
                        type="datetime-local"
                        required
                        value={form.date}
                        onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                        className="w-full bg-white/[0.04] border border-white/10 px-4 py-3.5 text-white text-sm font-mono focus:outline-none focus:border-white/25 focus:bg-white/[0.06] transition-all rounded-sm [color-scheme:dark]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">End Date & Time</label>
                      <input
                        type="datetime-local"
                        value={form.endDate}
                        onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                        className="w-full bg-white/[0.04] border border-white/10 px-4 py-3.5 text-white text-sm font-mono focus:outline-none focus:border-white/25 focus:bg-white/[0.06] transition-all rounded-sm [color-scheme:dark]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">Location</label>
                    <input
                      type="text"
                      value={form.location}
                      onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                      placeholder="e.g. Dubai, UAE"
                      className="w-full bg-white/[0.04] border border-white/10 px-4 py-3.5 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/[0.06] transition-all rounded-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">Max capacity</label>
                    <input
                      type="number"
                      min={1}
                      value={form.maxAttendees}
                      onChange={e => setForm(f => ({ ...f, maxAttendees: e.target.value }))}
                      placeholder="Leave empty for unlimited"
                      className="w-full bg-white/[0.04] border border-white/10 px-4 py-3.5 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/[0.06] transition-all rounded-sm [color-scheme:dark]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">Description</label>
                    <textarea
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Brief event description..."
                      rows={3}
                      className="w-full bg-white/[0.04] border border-white/10 px-4 py-3.5 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/[0.06] transition-all rounded-sm resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block">Banner image</label>
                    {form.bannerUrl ? (
                      <div className="relative bg-white/5 min-h-32 rounded border border-white/10 overflow-hidden">
                        <img
                          src={form.bannerUrl}
                          alt="Banner preview"
                          referrerPolicy="no-referrer"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          className="w-full h-32 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, bannerUrl: '' }))}
                          className="absolute top-2 right-2 text-[9px] uppercase tracking-wider font-bold bg-black/80 px-2 py-1 border border-white/20 hover:bg-white/10"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label className="block w-full bg-white/[0.04] border border-white/10 px-4 py-6 text-center text-white/40 text-sm font-mono cursor-pointer hover:border-white/20 hover:bg-white/[0.06] transition-all rounded-sm">
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
                              const res = await fetch('/api/events/upload-banner', { method: 'POST', body: fd });
                              const data = await res.json();
                              if (data.url) setForm(f => ({ ...f, bannerUrl: data.url }));
                              else alert(data.error || 'Upload failed');
                            } catch {
                              alert('Upload failed');
                            } finally {
                              setUploadingBanner(false);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>

                  <div className="pt-4 border-t border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <label className="text-[9px] tracking-[0.3em] uppercase text-white font-bold block">VIP Access Gate</label>
                        <p className="text-[8px] text-white/30 uppercase tracking-widest font-mono">Require token ownership to verify</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, isVip: !f.isVip }))}
                        className={`w-10 h-5 relative transition-colors duration-300 ${form.isVip ? 'bg-yellow-500' : 'bg-white/10'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 bg-black transition-all duration-300 ${form.isVip ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>

                    {form.isVip && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 pt-2"
                      >
                        <div className="space-y-2">
                          <label className="text-[9px] tracking-[0.3em] uppercase text-yellow-500/60 font-bold block">Token Address (ERC20/NFT) *</label>
                          <input
                            type="text"
                            required={form.isVip}
                            value={form.vipTokenAddress}
                            onChange={e => setForm(f => ({ ...f, vipTokenAddress: e.target.value }))}
                            placeholder="0x..."
                            className="w-full bg-yellow-500/[0.03] border border-yellow-500/20 px-4 py-3 text-white text-sm font-mono placeholder:text-white/15 focus:outline-none focus:border-yellow-500/40 transition-colors"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] tracking-[0.3em] uppercase text-yellow-500/60 font-bold block">Minimum Balance *</label>
                          <input
                            type="number"
                            required={form.isVip}
                            value={form.vipMinBalance}
                            onChange={e => setForm(f => ({ ...f, vipMinBalance: e.target.value }))}
                            placeholder="1"
                            className="w-full bg-yellow-500/[0.03] border border-yellow-500/20 px-4 py-3 text-white text-sm font-mono placeholder:text-white/15 focus:outline-none focus:border-yellow-500/40 transition-colors"
                          />
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {createError && (
                  <p className="text-[9px] tracking-[0.2em] uppercase text-red-400 font-bold">{createError}</p>
                )}

                </div>

                {/* Bottom actions — always visible */}
                <div className="p-6 lg:p-8 pt-4 pb-6 border-t border-white/5 bg-black shrink-0 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateEvent(false)}
                    className="order-2 sm:order-1 px-6 py-3 border border-white/20 text-[10px] font-bold tracking-[0.25em] uppercase text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all"
                  >
                    Save for later
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="btn-premium flex-1 py-4 disabled:opacity-50 order-1 sm:order-2"
                  >
                    <span className="tracking-[0.2em] uppercase text-sm font-bold">
                      {creating ? 'Registering...' : 'Register Event'}
                    </span>
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event Detail Modal */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xl flex items-start justify-center overflow-y-auto p-4 lg:p-8 pt-8 lg:pt-12"
            onClick={(e) => e.target === e.currentTarget && setSelectedEvent(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              className="w-full max-w-lg border border-white/10 bg-black overflow-y-auto max-h-[85vh] no-scrollbar flex flex-col shrink-0"
            >
              {/* Sticky header: Back + status + Close (always visible) */}
              <div className="sticky top-0 z-10 shrink-0 p-4 lg:p-6 flex items-center gap-4 border-b border-white/10 bg-black backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="shrink-0 flex items-center gap-2 px-3 py-2 rounded border border-white/30 bg-white/10 hover:bg-white/20 text-white text-sm font-bold tracking-wide"
                  aria-label="Back"
                >
                  Back
                </button>
                <div className="flex items-center gap-3 min-w-0">
                  {isUpcoming(selectedEvent.date, selectedEvent.endDate) ? (
                    <>
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0" />
                      <span className="text-[9px] tracking-[0.3em] uppercase text-green-400 font-bold truncate">Upcoming</span>
                    </>
                  ) : isOngoing(selectedEvent.date, selectedEvent.endDate) ? (
                    <>
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0 animate-pulse" />
                      <span className="text-[9px] tracking-[0.3em] uppercase text-amber-400 font-bold truncate">Ongoing</span>
                    </>
                  ) : (
                    <>
                      <div className="w-1.5 h-1.5 bg-white/20 rounded-full shrink-0" />
                      <span className="text-[9px] tracking-[0.3em] uppercase text-white/30 font-bold truncate">Past Event</span>
                    </>
                  )}
                </div>
                {selectedEvent.isVip && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                    <span className="text-[9px] tracking-[0.3em] uppercase text-yellow-500 font-bold">VIP</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-2 rounded border border-white/30 bg-white/10 hover:bg-white/20 text-white text-sm font-bold"
                  aria-label="Close"
                >
                  <span aria-hidden className="text-lg leading-none">×</span>
                  <span>Close</span>
                </button>
              </div>

              <div className="p-6 lg:p-8 space-y-8">
                {selectedEvent.bannerUrl && (
                  <div className="w-full -mx-6 lg:-mx-8 -mt-6 lg:-mt-8 mb-2 bg-white/5 min-h-[13rem] lg:min-h-[18rem]">
                    <img
                      src={selectedEvent.bannerUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      className="w-full h-52 lg:h-72 object-cover"
                    />
                  </div>
                )}
                <div>
                  <h2 className="text-3xl font-bold tracking-tighter mb-2">{selectedEvent.name}</h2>
                  {selectedEvent.description && (
                    <p className="text-secondary/60 text-sm font-light leading-relaxed">{selectedEvent.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold">Start</p>
                    <p className="text-sm font-mono text-white/70">{formatDateTime(selectedEvent.date)}</p>
                  </div>
                  {selectedEvent.endDate ? (
                    <div className="space-y-1">
                      <p className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold">End</p>
                      <p className="text-sm font-mono text-white/70">{formatDateTime(selectedEvent.endDate)}</p>
                    </div>
                  ) : null}
                  {selectedEvent.location && (
                    <div className="space-y-1">
                      <p className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold">Location</p>
                      <p className="text-sm font-mono text-white/70">{selectedEvent.location}</p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold">Organizer</p>
                    <p className="text-xs font-mono text-white/50">
                      {selectedEvent.organizer.slice(0, 8)}...{selectedEvent.organizer.slice(-4)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold">Attendees</p>
                    <p className="text-sm font-mono text-white/70">
                      {selectedEvent.maxAttendees != null && selectedEvent.maxAttendees > 0
                        ? `${getRegisteredCount(selectedEvent)} / ${selectedEvent.maxAttendees} (${selectedEvent.attendeeCount} verified)`
                        : selectedEvent.attendeeCount}
                    </p>
                  </div>
                  {selectedEvent.maxAttendees != null && selectedEvent.maxAttendees > 0 && (
                    <>
                      <div className="space-y-1">
                        <p className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold">Capacity</p>
                        <p className="text-sm font-mono text-white/70">{selectedEvent.maxAttendees} people</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold">Remaining</p>
                        <p className="text-sm font-mono text-white/70">
                          {getRemainingSeats(selectedEvent) ?? 0} spots left
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {!isConnected ? (
                  <button
                    type="button"
                    onClick={() => openConnectModal?.()}
                    className="w-full p-4 border border-white/20 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/30 text-center transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-bold">Connect wallet to interact</p>
                  </button>
                ) : (
                  <div className="space-y-6">
                    {/* Access Code for Organizer */}
                    {address?.toLowerCase() === selectedEvent.organizer.toLowerCase() && (
                      <div className="space-y-6 p-6 border border-white/[0.08] bg-white/[0.02]">
                        <div className="flex flex-col md:flex-row items-center gap-8">
                          <div className="bg-white p-3 border border-white/20 shrink-0">
                            <QRCodeCanvas
                              id={`organizer-qr-${selectedEvent.id}`}
                              value={selectedEvent.verificationCode}
                              size={120}
                              level="H"
                              imageSettings={{
                                src: "/logo-black.png",
                                x: undefined,
                                y: undefined,
                                height: 24,
                                width: 24,
                                excavate: true,
                              }}
                            />
                          </div>

                          <div className="flex-1 space-y-4 text-center md:text-left">
                            <div className="space-y-1">
                              <p className="text-[9px] tracking-[0.4em] uppercase text-white/40 font-black">Protocol Access Code</p>
                              <code className="text-2xl font-mono text-accent tracking-[0.2em] block">{selectedEvent.verificationCode}</code>
                            </div>

                            <div className="flex flex-wrap justify-center md:justify-start gap-4">
                              <button
                                onClick={() => handleDownloadQR(selectedEvent, `organizer-qr-${selectedEvent.id}`)}
                                className="px-4 py-2 bg-white text-black hover:bg-neutral-200 transition-all text-[9px] tracking-[0.2em] uppercase font-bold"
                              >
                                Download QR
                              </button>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(selectedEvent.verificationCode);
                                }}
                                className="px-4 py-2 border border-white/10 hover:bg-white/5 transition-all text-[9px] tracking-[0.2em] uppercase font-bold text-white/40 hover:text-white"
                              >
                                Copy Code
                              </button>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(getRegistrationLink(selectedEvent));
                                  showWalletToast('Registration link copied to clipboard.');
                                }}
                                className="px-4 py-2 bg-white/10 border border-white/20 hover:bg-white/20 transition-all text-[9px] tracking-[0.2em] uppercase font-bold text-white"
                              >
                                Copy Registration Link
                              </button>
                            </div>
                          </div>
                        </div>
                        <p className="text-[8px] tracking-[0.1em] uppercase text-white/10 font-medium text-center md:text-left">Share the registration link for sign-ups. Download the QR (includes event details) for check-in at the event.</p>
                      </div>
                    )}

                    {/* Attendee / Visitor lists for Organizer */}
                    {address?.toLowerCase() === selectedEvent.organizer.toLowerCase() && (
                      <div className="space-y-6">
                        {isPast(selectedEvent.date, selectedEvent.endDate) ? (
                          <>
                            <div className="flex items-center justify-between gap-4">
                              <p className="text-[9px] tracking-[0.35em] uppercase text-white/40 font-bold">Past event — visitor summary</p>
                              <button
                                type="button"
                                onClick={refetchOrganizerLists}
                                disabled={loadingAttendees}
                                className="text-[9px] font-bold tracking-[0.2em] uppercase text-white/50 hover:text-white disabled:opacity-50"
                              >
                                {loadingAttendees ? 'Refreshing…' : 'Refresh list'}
                              </button>
                            </div>
                            <div className="grid gap-6 sm:grid-cols-2">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                  <p className="text-[10px] uppercase tracking-[0.25em] font-black text-white">Verified visitors</p>
                                  <span className="text-[9px] font-mono text-green-500/80">{attendees.length}</span>
                                </div>
                                <div className="max-h-[220px] overflow-y-auto border border-white/[0.06] bg-white/[0.02] rounded">
                                  {loadingAttendees ? (
                                    <div className="p-4 text-center">
                                      <span className="text-[10px] uppercase tracking-widest text-white/20 animate-pulse">Loading...</span>
                                    </div>
                                  ) : attendees.length > 0 ? (
                                    <div className="divide-y divide-white/[0.04]">
                                      {attendees.map((a, i) => (
                                        <div key={i} className="p-3 flex items-center justify-between group hover:bg-white/[0.02]">
                                          <div className="space-y-0.5 min-w-0">
                                            <p className="text-[10px] font-mono text-white/70 truncate">
                                              {a.wallet.slice(0, 10)}...{a.wallet.slice(-8)}
                                            </p>
                                            <p className="text-[8px] font-mono text-white/25">
                                              {new Date(a.checkedInAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                          </div>
                                          <span className="text-[8px] uppercase tracking-widest text-green-500/60 font-bold shrink-0 ml-2">Verified</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="p-6 text-center">
                                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/25">No verified check-ins</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                  <p className="text-[10px] uppercase tracking-[0.25em] font-black text-white">Unverified (registered only)</p>
                                  <span className="text-[9px] font-mono text-white/40">
                                    {registrations.filter(r => !attendees.some(a => a.wallet?.toLowerCase() === r.wallet?.toLowerCase())).length}
                                  </span>
                                </div>
                                <div className="max-h-[220px] overflow-y-auto border border-white/[0.06] bg-white/[0.02] rounded">
                                  {loadingAttendees ? (
                                    <div className="p-4 text-center">
                                      <span className="text-[10px] uppercase tracking-widest text-white/20 animate-pulse">Loading...</span>
                                    </div>
                                  ) : (() => {
                                    const unverified = registrations.filter(r => !attendees.some(a => a.wallet?.toLowerCase() === r.wallet?.toLowerCase()));
                                    return unverified.length > 0 ? (
                                      <div className="divide-y divide-white/[0.04]">
                                        {unverified.map((r, i) => (
                                          <div key={i} className="p-3 flex items-center justify-between group hover:bg-white/[0.02]">
                                            <div className="space-y-0.5 min-w-0">
                                              <p className="text-[10px] font-mono text-white/50 truncate">
                                                {r.wallet.slice(0, 10)}...{r.wallet.slice(-8)}
                                              </p>
                                              <p className="text-[8px] font-mono text-white/20">
                                                Registered {new Date(r.registeredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                              </p>
                                            </div>
                                            <span className="text-[8px] uppercase tracking-widest text-white/20 font-bold shrink-0 ml-2">No check-in</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="p-6 text-center">
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/25">Everyone who registered checked in</p>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-between border-b border-white/10 pb-2 flex-wrap gap-2">
                              <div className="flex items-center gap-3">
                                <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white">Attendee Manifest</p>
                                <span className="text-[9px] font-mono text-white/40">{attendees.length} Verified</span>
                              </div>
                              <button
                                type="button"
                                onClick={refetchOrganizerLists}
                                disabled={loadingAttendees}
                                className="text-[9px] font-bold tracking-[0.2em] uppercase text-white/50 hover:text-white disabled:opacity-50"
                              >
                                {loadingAttendees ? 'Refreshing…' : 'Refresh list'}
                              </button>
                            </div>
                            <div className="max-h-[200px] overflow-y-auto border border-white/[0.04] bg-white/[0.01]">
                              {loadingAttendees ? (
                                <div className="p-4 text-center">
                                  <span className="text-[10px] uppercase tracking-widest text-white/20 animate-pulse">Syncing...</span>
                                </div>
                              ) : attendees.length > 0 ? (
                                <div className="divide-y divide-white/[0.04]">
                                  {attendees.map((a, i) => (
                                    <div key={i} className="p-3 flex items-center justify-between group hover:bg-white/[0.02] transition-colors">
                                      <div className="space-y-0.5">
                                        <p className="text-[10px] font-mono text-white/70 group-hover:text-white transition-colors">
                                          {a.wallet.slice(0, 10)}...{a.wallet.slice(-8)}
                                        </p>
                                        <p className="text-[8px] font-mono text-white/20">
                                          {new Date(a.checkedInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                      </div>
                                      <span className="text-[8px] uppercase tracking-widest text-white/10 group-hover:text-green-400/40 transition-colors font-bold">Auth_Pass</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-8 text-center">
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/20 italic">No verifications yet</p>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Action Button: Register first, then Verify only when event has started and is not past */}
                    {!isUserRegistered ? (
                      isPast(selectedEvent.date, selectedEvent.endDate) ? (
                        <div className="p-4 border border-white/10 bg-white/[0.02] text-center">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Event ended</p>
                          <p className="text-[9px] text-white/25 mt-1">Registration is closed for this event.</p>
                        </div>
                      ) : (
                        <button
                          disabled={registering}
                          onClick={handleRegister}
                          className="w-full py-4 bg-white text-black hover:bg-neutral-200 transition-all group flex items-center justify-center gap-3"
                        >
                          <span className="tracking-[0.2em] uppercase text-sm font-bold">
                            {registering ? 'Processing...' : 'Register for Event'}
                          </span>
                        </button>
                      )
                    ) : isPast(selectedEvent.date, selectedEvent.endDate) ? (
                      <div className="p-4 border border-white/10 bg-white/[0.02] text-center">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Event ended</p>
                        <p className="text-[9px] text-white/25 mt-1">Verification is closed for past events.</p>
                      </div>
                    ) : isOngoing(selectedEvent.date, selectedEvent.endDate) ? (
                      isUserVerified ? (
                        <div className="p-4 border border-white/10 bg-white/[0.02] text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                            <p className="text-[10px] uppercase tracking-[0.2em] text-green-400/80 font-bold">Attendance verified</p>
                          </div>
                          <p className="text-[9px] text-white/25 mt-1">You have already checked in for this event.</p>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setSelectedEvent(null); setShowScanner(true); }}
                          className="btn-premium w-full py-4 group"
                        >
                          <div className="flex items-center justify-center gap-3">
                            <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                            <span className="tracking-[0.2em] uppercase text-sm font-bold">Verify Attendance</span>
                          </div>
                        </button>
                      )
                    ) : (
                      <div className="p-4 border border-white/10 bg-white/[0.02] text-center">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold">Verify when event starts</p>
                        <p className="text-[9px] text-white/30 mt-1">Event starts {formatDateTime(selectedEvent.date)}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event Created — QR Download Modal */}
      <AnimatePresence>
        {createdEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8"
          >
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 32 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-lg border border-white/10 bg-black overflow-y-auto max-h-[90vh] lg:max-h-none no-scrollbar"
            >
              {/* Header */}
              <div className="p-6 lg:p-8 border-b border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-[9px] tracking-[0.4em] uppercase text-green-400 font-bold mb-1">Event Registered</p>
                  <p className="text-[10px] font-mono text-white/40 tracking-widest">{createdEvent.id}</p>
                </div>
                <button
                  onClick={() => {
                    setCreatedEvent(null);
                    setSelectedEvent(null);
                    fetchEvents();
                  }}
                  className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-40 hover:opacity-100 transition-opacity"
                >
                  Done
                </button>
              </div>

              <div className="p-6 lg:p-8 space-y-8">
                {createdEvent.bannerUrl && (
                  <div className="w-full -mx-6 lg:-mx-8 -mt-6 lg:-mt-8 mb-2 bg-white/5 min-h-[12rem] lg:min-h-[14rem]">
                    <img
                      src={createdEvent.bannerUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      className="w-full h-48 lg:h-56 object-cover rounded-t"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold tracking-tighter">{createdEvent.name}</h2>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold">
                    {formatDateTime(createdEvent.date)}{createdEvent.location ? ` · ${createdEvent.location}` : ''}
                  </p>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center gap-6">
                  <div className="p-5 bg-white">
                    <QRCodeCanvas
                      id="event-qr-canvas"
                      value={createdEvent.verificationCode}
                      size={220}
                      level="H"
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                  </div>

                  <div className="text-center space-y-2">
                    <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-bold">Verification Code</p>
                    <p className="font-mono text-2xl tracking-[0.35em] text-white">{createdEvent.verificationCode}</p>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4 border border-white/[0.06] bg-white/[0.02] space-y-1">
                  <p className="text-[8px] uppercase tracking-[0.25em] text-white/40 font-bold">How it works</p>
                  <p className="text-xs text-white/40 font-light leading-relaxed">
                    Download the QR (includes event details) or copy the registration link to share. Attendees register first, then scan the code at the event to verify and mint their proof-of-presence.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleDownloadQR(createdEvent, 'event-qr-canvas')}
                      className="btn-premium flex-1 py-4 flex items-center justify-center gap-3"
                    >
                      <span className="tracking-[0.2em] uppercase text-sm font-bold">Download QR</span>
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdEvent.verificationCode);
                      }}
                      className="flex-1 py-4 border border-white/10 hover:bg-white/5 transition-colors flex items-center justify-center"
                    >
                      <span className="tracking-[0.2em] uppercase text-sm font-bold opacity-60">Copy Code</span>
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getRegistrationLink(createdEvent));
                      showWalletToast('Registration link copied to clipboard.');
                    }}
                    className="w-full py-4 border border-white/10 hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="tracking-[0.2em] uppercase text-sm font-bold opacity-60">Copy Registration Link</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minting Success */}
      <AnimatePresence>
        {minted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex items-center justify-center p-8"
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl w-full text-center"
            >
              <div className="mb-12">
                <span className="text-[10px] font-bold tracking-[0.5em] uppercase text-accent">Registration Complete</span>
              </div>
              <h2 className="text-5xl md:text-8xl font-medium tracking-tighter mb-8 italic">VERIFIED.</h2>
              <p className="text-lg md:text-xl text-secondary font-light mb-16 max-w-sm mx-auto">Your presence has been etched into the ledger. Welcome to the collective.</p>
              <div className="flex flex-col gap-6 items-center">
                <button onClick={() => setMinted(false)} className="btn-premium w-full max-w-xs py-5">
                  <span className="tracking-widest uppercase text-xs font-bold">Return</span>
                </button>
                <a href="https://basescan.org" target="_blank" className="text-[10px] tracking-[0.3em] hover:opacity-100 opacity-40 uppercase transition-opacity">
                  View Block Detail
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VIP Imprint Modal */}
      <AnimatePresence>
        {showVIP && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8"
            onClick={(e) => e.target === e.currentTarget && vipStep !== 'paying' && vipStep !== 'minting' && setShowVIP(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md border border-yellow-500/20 bg-[#0a0a0a] overflow-y-auto max-h-[90vh] lg:max-h-none no-scrollbar"
            >
              {/* Header */}
              <div className="p-6 lg:p-8 border-b border-yellow-500/10 flex items-center justify-between">
                <div>
                  <p className="text-[9px] tracking-[0.4em] uppercase text-yellow-500/80 font-black mb-1">VIP Imprint</p>
                  <p className="text-[10px] font-mono text-white/20 tracking-widest">Single-use exclusive access token</p>
                </div>
                {(vipStep === 'confirm' || vipStep === 'done') && (
                  <button
                    onClick={() => { setShowVIP(false); setVipStep('confirm'); setVipCode(null); }}
                    className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-30 hover:opacity-100 transition-opacity"
                  >
                    Close
                  </button>
                )}
              </div>

              <div className="p-6 lg:p-8 space-y-8">
                {/* STEP: Confirm */}
                {vipStep === 'confirm' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-4 border-b border-white/[0.06]">
                        <span className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-bold">VIP Access Token</span>
                        <span className="font-mono text-white font-bold">1×</span>
                      </div>
                      <div className="flex justify-between items-center py-4 border-b border-white/[0.06]">
                        <span className="text-[10px] uppercase tracking-[0.25em] text-white/40 font-bold">Price</span>
                        <span className="font-mono text-yellow-400 font-black text-lg">10 USDC</span>
                      </div>
                    </div>

                    <p className="text-[9px] leading-relaxed text-white/25 font-mono">
                      Payment is sent to the GATE PROTOCOL treasury via USDC on Base. After confirmation your exclusive QR imprint is generated instantly.
                    </p>

                    {vipError && (
                      <p className="text-[9px] text-red-400 tracking-wider font-mono">{vipError}</p>
                    )}
                    {txError && (
                      <p className="text-[9px] text-red-400 tracking-wider font-mono">{txError.message.split('\n')[0]}</p>
                    )}

                    <button
                      onClick={handleVIPPayment}
                      className="w-full bg-yellow-500 hover:bg-yellow-400 text-black py-4 text-[9px] tracking-[0.25em] uppercase font-black transition-colors"
                    >
                      Pay 10 USDC &amp; Mint Imprint
                    </button>
                  </motion.div>
                )}

                {/* STEP: Paying (waiting for wallet) */}
                {(vipStep === 'paying' && !isTxConfirmed) && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-6 py-8">
                    <div className="w-12 h-12 border border-yellow-500/40 border-t-yellow-400 rounded-full animate-spin" />
                    <div className="text-center space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-yellow-400/80 font-black">
                        {isTxPending ? 'Waiting for Wallet' : isTxConfirming ? 'Confirming on Base' : 'Processing'}
                      </p>
                      <p className="text-[9px] font-mono text-white/20">
                        {isTxPending ? 'Approve the transaction in your wallet' : 'Transaction broadcast — awaiting block confirmation'}
                      </p>
                    </div>
                    {txHash && (
                      <a
                        href={`https://basescan.org/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[8px] font-mono text-white/20 hover:text-white/50 transition-colors tracking-widest"
                      >
                        {txHash.slice(0, 10)}...{txHash.slice(-8)} ↗
                      </a>
                    )}
                  </motion.div>
                )}

                {/* STEP: Minting (API generating code) */}
                {vipStep === 'minting' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-6 py-8">
                    <div className="w-12 h-12 border border-yellow-500/40 border-t-yellow-400 rounded-full animate-spin" />
                    <p className="text-[10px] uppercase tracking-[0.3em] text-yellow-400/80 font-black">Minting Imprint</p>
                    <p className="text-[9px] font-mono text-white/20">Payment confirmed — generating your exclusive QR</p>
                  </motion.div>
                )}

                {/* STEP: Done */}
                {vipStep === 'done' && vipCode && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                    <div className="text-center space-y-1">
                      <p className="text-[9px] uppercase tracking-[0.4em] text-yellow-400/80 font-black">Imprint Minted</p>
                      <p className="text-[9px] font-mono text-white/20">Your VIP access token is ready</p>
                    </div>

                    <div className="flex flex-col items-center gap-6">
                      <div className="p-5 bg-white ring-2 ring-yellow-400/40">
                        <QRCodeCanvas
                          id="vip-qr-canvas"
                          value={vipCode}
                          size={200}
                          level="H"
                          bgColor="#ffffff"
                          fgColor="#000000"
                        />
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-[9px] uppercase tracking-[0.3em] text-yellow-500/50 font-bold">VIP Code</p>
                        <p className="font-mono text-2xl tracking-[0.35em] text-yellow-300">{vipCode}</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => {
                          const canvas = document.getElementById('vip-qr-canvas') as HTMLCanvasElement;
                          if (!canvas) return;
                          const url = canvas.toDataURL('image/png');
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `gatefy-vip-imprint-${vipCode}.png`;
                          a.click();
                        }}
                        className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black py-4 text-[9px] tracking-[0.25em] uppercase font-black transition-colors"
                      >
                        Download QR
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(vipCode)}
                        className="flex-1 py-4 border border-yellow-500/20 hover:bg-yellow-500/[0.05] transition-colors text-[9px] tracking-[0.25em] uppercase font-bold text-yellow-500/50 hover:text-yellow-400"
                      >
                        Copy Code
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="border-t border-white/5 bg-[#050505]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Links */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {[
              { label: 'About', href: '/about' },
              { label: 'Developer', href: '/developer' },
              { label: 'Terms', href: '/terms' },
              { label: 'Privacy', href: '/privacy' },

            ].map((link, i, arr) => (
              <span key={link.label} className="flex items-center gap-6">
                <a
                  href={link.href}
                  className="text-[9px] tracking-[0.3em] uppercase text-white/40 hover:text-white transition-colors font-bold"
                >
                  {link.label}
                </a>
                {i < arr.length - 1 && (
                  <span className="text-white/10 text-[10px]">|</span>
                )}
              </span>
            ))}
          </div>

          {/* Right: socials */}
          <div className="flex items-center gap-4 shrink-0">
            {/* X / Twitter */}
            <a href="https://x.com/gatefyprotocol" target="_blank" rel="noopener noreferrer" className="w-7 h-7 border border-white/10 flex items-center justify-center hover:border-white/30 hover:bg-white/5 transition-all">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-white/40">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.262 5.637L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
              </svg>
            </a>
          </div>

        </div>
        <div className="border-t border-white/[0.03] py-2 text-center">
          <span className="text-[7px] font-mono tracking-[0.3em] text-white/15 uppercase">© 2026 GATE PROTOCOL — Built on Base</span>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <HomeContent />
    </Suspense>
  );
}
