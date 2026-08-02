'use client';

import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit';
import { motion, AnimatePresence } from 'framer-motion';
import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useConfig } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { parseUnits } from 'viem';
import { QRCodeCanvas } from 'qrcode.react';
import { Scanner } from '@/components/Scanner';
import { ConnectStellarButton } from '@/components/ConnectStellarButton';
import { CreateEventWizard } from '@/components/CreateEventWizard';
import { EventLocationMapLazy } from '@/components/EventLocationMapLazy';
import { EventLocationField } from '@/components/EventLocationField';
import { readStellarAddress } from '@/lib/stellar-session';
import {
  isEventOrganizer,
  formatOrganizerShort,
  isEmailOrganizerId,
} from '@/lib/event-organizer';
import {
  eventAcceptsMobileMoney,
  eventAcceptsUsdc,
  formatEventTicketSummary,
  validateEventPaymentConfig,
} from '@/lib/event-payment';
import { matchesRosterSearch } from '@/lib/organizer-stats';

// USDC on Base Mainnet
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

/** Local hint only — real registration lives in Supabase `registrations`. */
function regCacheKey(eventId: string) {
  return `gatefy-reg-${eventId}`;
}

function readRegCache(eventId: string): { email?: string; name?: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      localStorage.getItem(regCacheKey(eventId)) ||
      sessionStorage.getItem(regCacheKey(eventId));
    if (!raw) return null;
    return JSON.parse(raw) as { email?: string; name?: string };
  } catch {
    return null;
  }
}

function writeRegCache(eventId: string, data: { email: string; name?: string | null }) {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify({
    email: data.email.trim().toLowerCase(),
    name: data.name ?? undefined,
  });
  try {
    localStorage.setItem(regCacheKey(eventId), payload);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(regCacheKey(eventId), payload);
  } catch {
    /* ignore */
  }
}
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

/** For <input type="datetime-local" /> — local wall time from ISO. */
function toDatetimeLocalValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Event {
  id: string;
  name: string;
  description: string;
  date: string;
  endDate?: string;
  location: string;
  organizer: string;
  organizerDisplayName?: string;
  verificationCode: string;
  createdAt: string;
  attendeeCount: number;
  maxAttendees?: number;
  registrationCount?: number; // number of people who registered (for remaining seats)
  /** Paid-ticket events: registrants with payment_status paid_crypto | paid_mobile */
  paidRegistrationCount?: number;
  /** Paid-ticket events: registered but payment_status still none */
  unpaidRegistrationCount?: number;
  isVip?: boolean;
  vipTokenAddress?: string;
  vipMinBalance?: string;
  bannerUrl?: string;
  isBlockchain?: boolean;
  ticketPriceUsdc?: number;
  mobileMoneyInstructions?: string;
  /** Paid wallet flow: accept USDC (default on). */
  ticketAcceptUsdc?: boolean;
  /** Paid flow: accept mobile-money reference (default on). */
  ticketAcceptMobileMoney?: boolean;
}

function HomeContent() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();


  const [showScanner, setShowScanner] = useState(false);
  const [minted, setMinted] = useState(false);
  const [mintReceipt, setMintReceipt] = useState<{
    ok: boolean;
    chain?: string;
    txHash?: string;
    tokenId?: string;
    explorerUrl?: string;
    status?: string;
    error?: string;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<string | null>(null);
  const verifyInFlightRef = useRef(false);
  const [events, setEvents] = useState<Event[]>([]);
  /** Organizer-scoped list from GET /api/events/managed (lighter than filtering the public catalog). */
  const [managedEvents, setManagedEvents] = useState<Event[]>([]);
  const [managedEventsLoading, setManagedEventsLoading] = useState(false);
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
  const [normalSignupEmail, setNormalSignupEmail] = useState('');
  const [normalSignupName, setNormalSignupName] = useState('');
  const [normalPayRef, setNormalPayRef] = useState('');
  /** Wallet (blockchain) registration: email + first name or org name */
  const [blockchainSignupEmail, setBlockchainSignupEmail] = useState('');
  const [blockchainSignupName, setBlockchainSignupName] = useState('');
  /** Wallet signup on paid events: USDC transfer vs mobile-money reference */
  const [blockchainPayMode, setBlockchainPayMode] = useState<'usdc' | 'mobile'>('usdc');
  const [blockchainPayRef, setBlockchainPayRef] = useState('');
  const [attendees, setAttendees] = useState<any[]>([]);
  type RegRow = {
    wallet?: string | null;
    email?: string | null;
    name?: string | null;
    registeredAt: string;
    paymentStatus?: string | null;
    paymentTxHash?: string | null;
    paymentReference?: string | null;
  };
  const [registrations, setRegistrations] = useState<RegRow[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  type RosterDetail =
    | {
        kind: 'verified';
        attendee: { wallet?: string | null; email?: string | null; checkedInAt: string; code?: string };
        registration: RegRow | null;
      }
    | { kind: 'pending'; registration: RegRow };
  const [rosterDetail, setRosterDetail] = useState<RosterDetail | null>(null);
  /** Server-backed registration row for the selected event (name / email / wallet). */
  const [eventRegProfile, setEventRegProfile] = useState<{
    email?: string | null;
    name?: string | null;
    wallet?: string | null;
  } | null>(null);
  const [databaseConfigured, setDatabaseConfigured] = useState<boolean | null>(null);
  /** Email used to create events without a wallet (session). */
  const [organizerSessionEmail, setOrganizerSessionEmail] = useState<string | null>(null);
  /** Draft for “Sign in as organizer” (email-hosted events — wallet parity). */
  const [organizerSignInDraft, setOrganizerSignInDraft] = useState('');

  const orgCtx = useMemo(
    () => ({ address: address ?? null, organizerSessionEmail }),
    [address, organizerSessionEmail]
  );

  /** Required on `/api/events/registrations` and `/api/events/attendees` (organizer-only). */
  const organizerListAuthSuffix = useMemo(() => {
    if (address) return `&organizerWallet=${encodeURIComponent(address)}`;
    if (organizerSessionEmail) return `&organizerEmail=${encodeURIComponent(organizerSessionEmail)}`;
    return '';
  }, [address, organizerSessionEmail]);

  /** Query string for GET /api/events/managed (no leading `?`). */
  const managedEventsQuerySuffix = useMemo(() => {
    if (address) return `organizerWallet=${encodeURIComponent(address)}`;
    if (organizerSessionEmail) return `organizerEmail=${encodeURIComponent(organizerSessionEmail)}`;
    return '';
  }, [address, organizerSessionEmail]);

  const { writeContract, writeContractAsync, data: txHash, isPending: isTxPending, error: txError } = useWriteContract();
  const { isSuccess: isTxConfirmed, isLoading: isTxConfirming } = useWaitForTransactionReceipt({ hash: txHash });
  const wagmiConfig = useConfig();

  const refetchOrganizerLists = () => {
    if (!selectedEvent || !isEventOrganizer(selectedEvent.organizer, orgCtx)) return;
    if (!organizerListAuthSuffix) {
      showWalletToast('Sign in with the same wallet or browser session you used to create this event.');
      return;
    }
    setLoadingAttendees(true);
    Promise.all([
      fetch(`/api/events/attendees?eventId=${selectedEvent.id}${organizerListAuthSuffix}`, { cache: 'no-store' }).then(r => r.json()),
      fetch(`/api/events/registrations?eventId=${selectedEvent.id}${organizerListAuthSuffix}`, { cache: 'no-store' }).then(r => r.json()),
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

  useEffect(() => {
    fetch('/api/app-config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setDatabaseConfigured(!!d.databaseConfigured))
      .catch(() => setDatabaseConfigured(false));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOrganizerSessionEmail(sessionStorage.getItem('gatefy-organizer-email'));
  }, []);

  useEffect(() => {
    setNormalPayRef('');
    setBlockchainSignupEmail('');
    setBlockchainSignupName('');
    setBlockchainPayRef('');
    if (!selectedEvent) {
      setBlockchainPayMode('usdc');
      return;
    }
    const price = selectedEvent.ticketPriceUsdc ?? 0;
    if (price > 0 && !eventAcceptsUsdc(selectedEvent) && eventAcceptsMobileMoney(selectedEvent)) {
      setBlockchainPayMode('mobile');
    } else {
      setBlockchainPayMode('usdc');
    }
  }, [selectedEvent?.id]);

  useEffect(() => {
    if (showCreateEvent && !address) {
      setForm(f => (f.isBlockchain ? { ...f, isBlockchain: false } : f));
    }
  }, [showCreateEvent, address]);

  // Check registration, verification status, and fetch attendees when event selected
  useEffect(() => {
    if (!selectedEvent) {
      setIsUserRegistered(false);
      setIsUserVerified(false);
      setAttendees([]);
      setRegistrations([]);
      setEventRegProfile(null);
      return;
    }

    const isOwner = isEventOrganizer(selectedEvent.organizer, orgCtx);

    if (address) {
      if (selectedEvent.isBlockchain !== false) {
        fetch(`/api/register?eventId=${selectedEvent.id}&wallet=${address}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((data) => {
            setIsUserRegistered(!!data.registered);
            if (data.registered) {
              setEventRegProfile({
                email: data.email ?? null,
                name: data.name ?? null,
                wallet: data.wallet ?? address,
              });
            } else {
              setEventRegProfile(null);
            }
          })
          .catch(() => {
            setIsUserRegistered(false);
            setEventRegProfile(null);
          });

        fetch(`/api/events/verified?eventId=${selectedEvent.id}&wallet=${address}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((data) => setIsUserVerified(!!data.verified))
          .catch(() => setIsUserVerified(false));
      } else {
        // Email-mode event: registration comes from sessionStorage below, not wallet
        setIsUserVerified(false);
      }
    } else if (selectedEvent.isBlockchain !== false) {
      setIsUserRegistered(false);
      setEventRegProfile(null);
      setIsUserVerified(false);
    } else {
      setIsUserVerified(false);
    }

    if (isOwner) {
      if (!organizerListAuthSuffix) {
        setAttendees([]);
        setRegistrations([]);
        return;
      }
      setLoadingAttendees(true);
      Promise.all([
        fetch(`/api/events/attendees?eventId=${selectedEvent.id}${organizerListAuthSuffix}`, { cache: 'no-store' }).then((r) => r.json()),
        fetch(`/api/events/registrations?eventId=${selectedEvent.id}${organizerListAuthSuffix}`, { cache: 'no-store' }).then((r) => r.json()),
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

    // For non-blockchain events: restore local email hint, then confirm against Supabase
    if (selectedEvent.isBlockchain === false && typeof window !== 'undefined') {
      const parsed = readRegCache(selectedEvent.id);
      if (parsed) {
        try {
          const email = parsed.email;
          if (email) {
            fetch(`/api/register?eventId=${selectedEvent.id}&email=${encodeURIComponent(email)}`, { cache: 'no-store' })
              .then((r) => r.json())
              .then((data) => {
                if (data.registered) {
                  setIsUserRegistered(true);
                  setEventRegProfile({
                    email: data.email ?? email,
                    name: data.name ?? parsed.name ?? null,
                    wallet: data.wallet ?? null,
                  });
                  writeRegCache(selectedEvent.id, {
                    email: data.email ?? email,
                    name: data.name ?? parsed.name ?? null,
                  });
                  return fetch(
                    `/api/events/verified?eventId=${selectedEvent.id}&email=${encodeURIComponent(email)}`,
                    { cache: 'no-store' }
                  )
                    .then((r2) => r2.json())
                    .then((v) => setIsUserVerified(!!v.verified));
                }
                setIsUserVerified(false);
              });
          }
        } catch {
          /* ignore */
        }
      }
    }
  }, [selectedEvent, address, orgCtx]);

  useEffect(() => {
    setRosterSearch('');
    setRosterDetail(null);
  }, [selectedEvent?.id]);

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
    isBlockchain: true,
    organizerEmail: '',
    organizerDisplayName: '',
    ticketPriceUsdc: '' as string,
    mobileMoneyInstructions: '' as string,
    ticketAcceptUsdc: true,
    ticketAcceptMobileMoney: true,
    ticketAcceptStellar: false,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const minStartDatetimeLocal = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }, [showCreateEvent]);

  /** Edit existing event (organizer-only): ticketing, capacity, basics. */
  const [showManageEvent, setShowManageEvent] = useState(false);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState('');
  const [manageForm, setManageForm] = useState({
    name: '',
    description: '',
    date: '',
    endDate: '',
    location: '',
    maxAttendees: '' as string,
    ticketPriceUsdc: '' as string,
    mobileMoneyInstructions: '' as string,
    ticketAcceptUsdc: true,
    ticketAcceptMobileMoney: true,
    bannerUrl: '',
  });
  const [manageBannerUploading, setManageBannerUploading] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetchEvents();
  }, [address]);

  useEffect(() => {
    fetchManagedEvents();
  }, [managedEventsQuerySuffix]);

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

  const fetchManagedEvents = async (): Promise<Event[]> => {
    if (!managedEventsQuerySuffix) {
      setManagedEvents([]);
      return [];
    }
    setManagedEventsLoading(true);
    try {
      const res = await fetch(`/api/events/managed?${managedEventsQuerySuffix}`, { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) {
        setManagedEvents(data);
        return data;
      }
      setManagedEvents([]);
      return [];
    } catch (e) {
      console.error(e);
      setManagedEvents([]);
      return [];
    } finally {
      setManagedEventsLoading(false);
    }
  };

  const mergeEventInLists = (updated: Event) => {
    const idKey = updated.id.toLowerCase();
    setEvents((prev) => {
      const i = prev.findIndex((e) => e.id.toLowerCase() === idKey);
      if (i < 0) return prev;
      const next = [...prev];
      next[i] = { ...next[i], ...updated };
      return next;
    });
    setManagedEvents((prev) => {
      const i = prev.findIndex((e) => e.id.toLowerCase() === idKey);
      if (i < 0) return prev;
      const next = [...prev];
      next[i] = { ...next[i], ...updated };
      return next;
    });
  };

  // ── In-app wallet toast (never triggers RainbowKit modal) ──────────────
  const [walletToast, setWalletToast] = useState<string | null>(null);
  const showWalletToast = (msg: string) => {
    setWalletToast(msg);
    setTimeout(() => setWalletToast(null), 4000);
  };

  const ORG_SESSION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const commitOrganizerEmailSession = (raw: string, opts?: { silent?: boolean }) => {
    const em = raw.trim().toLowerCase();
    if (!ORG_SESSION_EMAIL_RE.test(em)) {
      showWalletToast('Enter a valid organizer email.');
      return false;
    }
    try {
      sessionStorage.setItem('gatefy-organizer-email', em);
    } catch {
      showWalletToast('Could not save organizer session (storage blocked).');
      return false;
    }
    setOrganizerSessionEmail(em);
    setOrganizerSignInDraft('');
    if (!opts?.silent) {
      showWalletToast('Organizer session active — host tools unlocked for your email events.');
    }
    return true;
  };

  const clearOrganizerEmailSession = () => {
    try {
      sessionStorage.removeItem('gatefy-organizer-email');
    } catch {
      /* ignore */
    }
    setOrganizerSessionEmail(null);
    showWalletToast('Organizer email signed out.');
  };

  const handleOrganizerSignInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    commitOrganizerEmailSession(organizerSignInDraft);
  };

  const handleScan = async (data: string, emailFromScanner?: string) => {
    if (verifyInFlightRef.current) return;
    const code = String(data || '').trim().toUpperCase();
    if (!code) {
      setScannerStatus('Enter or scan a verification code.');
      showWalletToast('Enter or scan a verification code.');
      return;
    }

    const ev =
      selectedEvent && selectedEvent.verificationCode?.toUpperCase() === code
        ? selectedEvent
        : events.find((e) => e.verificationCode?.toUpperCase() === code) || selectedEvent;

    let regEmail: string | undefined =
      (emailFromScanner || '').trim().toLowerCase() ||
      eventRegProfile?.email?.trim().toLowerCase() ||
      undefined;
    if (!regEmail && ev?.id) {
      regEmail = readRegCache(ev.id)?.email?.trim().toLowerCase() || undefined;
    }
    const emailMode = ev?.isBlockchain === false;
    if (emailMode && !regEmail) {
      const msg = 'Enter the same email you registered with, then authenticate.';
      setScannerStatus(msg);
      showWalletToast(msg);
      return;
    }
    if (!emailMode && !address && !regEmail) {
      const msg = 'Connect your wallet (or enter your registration email) to verify attendance.';
      setScannerStatus(msg);
      showWalletToast(msg);
      return;
    }
    if (ev && isPast(ev.date, ev.endDate)) {
      const msg = 'Verification is closed — this event has ended.';
      setScannerStatus(msg);
      showWalletToast(msg);
      return;
    }

    verifyInFlightRef.current = true;
    setScanning(true);
    setScannerStatus('Verifying attendance…');
    try {
      const body: Record<string, string> = { code };
      if (address) body.wallet = address;
      if (regEmail) body.email = regEmail;
      const stellar = readStellarAddress();
      if (stellar) body.stellarAddress = stellar;
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.success) {
        setIsUserVerified(true);
        setScannerStatus(null);
        if (regEmail && ev?.id) {
          writeRegCache(ev.id, { email: regEmail, name: eventRegProfile?.name ?? null });
        }
        if (result.alreadyVerified) {
          showWalletToast(result.message || 'You have already verified attendance for this event.');
        } else {
          setMintReceipt(result.mint ?? null);
          setMinted(true);
          if (result.mint?.ok) {
            showWalletToast(result.message || 'Attendance verified and minted on Stellar.');
          } else if (result.mint?.error) {
            showWalletToast(`Checked in. Mint: ${result.mint.error}`);
          } else {
            showWalletToast(result.message || 'Attendance verified.');
          }
        }
        setShowScanner(false);
        refetchOrganizerLists();
      } else {
        const msg = result.message || result.error || 'Verification failed. Check your code and try again.';
        setScannerStatus(msg);
        showWalletToast(msg);
      }
    } catch {
      const msg = 'Network error during verification. Please try again.';
      setScannerStatus(msg);
      showWalletToast(msg);
    } finally {
      setScanning(false);
      verifyInFlightRef.current = false;
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      if (form.isBlockchain && !address) {
        setCreateError('Connect a wallet for blockchain events, or switch registration to email (no wallet).');
        setCreating(false);
        return;
      }
      if (!address && (!form.organizerEmail.trim() || !form.organizerDisplayName.trim())) {
        setCreateError('Enter your email and your name or company name to create an event without a wallet.');
        setCreating(false);
        return;
      }
      // datetime-local returns YYYY-MM-DDTHH:mm (no timezone). Convert to ISO so the user's
      // local time is stored correctly; otherwise Postgres treats it as server (UTC) time.
      const dateIso = form.date ? new Date(form.date).toISOString() : form.date;
      const endDateIso = form.endDate ? new Date(form.endDate).toISOString() : form.endDate;
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        date: dateIso,
        endDate: endDateIso || undefined,
        location: form.location,
        maxAttendees: form.maxAttendees ? parseInt(form.maxAttendees, 10) : undefined,
        isVip: form.isVip,
        vipTokenAddress: form.vipTokenAddress,
        vipMinBalance: form.vipMinBalance,
        bannerUrl: form.bannerUrl || undefined,
        isBlockchain: form.isBlockchain,
      };
      const t = form.ticketPriceUsdc.trim();
      if (t) {
        const n = parseFloat(t);
        if (Number.isFinite(n) && n > 0) payload.ticketPriceUsdc = n;
      }
      const mm = form.mobileMoneyInstructions.trim();
      if (mm) payload.mobileMoneyInstructions = mm;

      const ticketAmt = typeof payload.ticketPriceUsdc === 'number' ? payload.ticketPriceUsdc : undefined;
      const pv = validateEventPaymentConfig({
        isBlockchain: form.isBlockchain,
        ticketPriceUsdc: ticketAmt,
        ticketAcceptUsdc: form.ticketAcceptUsdc,
        ticketAcceptMobileMoney: form.ticketAcceptMobileMoney,
        ticketAcceptStellar: form.ticketAcceptStellar === true,
      });
      if (!pv.ok) {
        setCreateError(pv.error);
        setCreating(false);
        return;
      }
      payload.ticketAcceptUsdc = form.ticketAcceptUsdc;
      payload.ticketAcceptMobileMoney = form.ticketAcceptMobileMoney;
      payload.ticketAcceptStellar = form.ticketAcceptStellar === true;
      if (address) {
        payload.organizer = address;
      } else {
        payload.organizerEmail = form.organizerEmail.trim();
        payload.organizerDisplayName = form.organizerDisplayName.trim();
      }
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
          isBlockchain: true,
          organizerEmail: '',
          organizerDisplayName: '',
          ticketPriceUsdc: '',
          mobileMoneyInstructions: '',
          ticketAcceptUsdc: true,
          ticketAcceptMobileMoney: true,
          ticketAcceptStellar: false,
        });
        if (!address && form.organizerEmail.trim()) {
          commitOrganizerEmailSession(form.organizerEmail.trim(), { silent: true });
        }
        setShowCreateEvent(false);
        setCreatedEvent(newEvent); // show QR download modal
        await Promise.all([fetchEvents(), fetchManagedEvents()]);
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

  const openManageEventModal = () => {
    if (!selectedEvent || !isEventOrganizer(selectedEvent.organizer, orgCtx)) return;
    if (isPast(selectedEvent.date, selectedEvent.endDate)) {
      showWalletToast('Past events cannot be edited.');
      return;
    }
    const ev = selectedEvent;
    setManageError('');
    setManageForm({
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
    });
    setShowManageEvent(true);
  };

  const handleSaveManagedEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    if (isPast(selectedEvent.date, selectedEvent.endDate)) {
      showWalletToast('Past events cannot be edited.');
      return;
    }
    if (!organizerListAuthSuffix) {
      showWalletToast('Sign in as organizer first.');
      return;
    }
    setManageSaving(true);
    setManageError('');
    try {
      const dateIso = manageForm.date ? new Date(manageForm.date).toISOString() : selectedEvent.date;
      const endIso = manageForm.endDate.trim() ? new Date(manageForm.endDate).toISOString() : null;

      let ticketAmount: number | null = null;
      const tp = manageForm.ticketPriceUsdc.trim();
      if (tp) {
        const n = parseFloat(tp);
        if (Number.isFinite(n) && n > 0) ticketAmount = n;
      }

      let maxPatch: number | null = null;
      const mx = manageForm.maxAttendees.trim();
      if (mx) {
        const n = parseInt(mx, 10);
        if (Number.isFinite(n) && n > 0) maxPatch = n;
      }

      const mergedBlockchain = selectedEvent.isBlockchain !== false;

      const payCheck = validateEventPaymentConfig({
        isBlockchain: mergedBlockchain,
        ticketPriceUsdc: ticketAmount ?? undefined,
        ticketAcceptUsdc: manageForm.ticketAcceptUsdc,
        ticketAcceptMobileMoney: manageForm.ticketAcceptMobileMoney,
      });
      if (!payCheck.ok) {
        setManageError(payCheck.error);
        setManageSaving(false);
        return;
      }

      const patch: Record<string, unknown> = {
        eventId: selectedEvent.id,
        ...(address ? { organizerWallet: address } : {}),
        ...(organizerSessionEmail ? { organizerEmail: organizerSessionEmail } : {}),
        name: manageForm.name.trim(),
        description: manageForm.description.trim(),
        date: dateIso,
        endDate: endIso,
        location: manageForm.location.trim(),
        maxAttendees: maxPatch,
        ticketPriceUsdc: ticketAmount,
        mobileMoneyInstructions: manageForm.mobileMoneyInstructions.trim() || null,
        ticketAcceptUsdc: manageForm.ticketAcceptUsdc,
        ticketAcceptMobileMoney: manageForm.ticketAcceptMobileMoney,
        bannerUrl: manageForm.bannerUrl.trim() || null,
      };

      const res = await fetch('/api/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setManageError(typeof data?.error === 'string' ? data.error : 'Update failed');
        return;
      }
      const updated = data as Event;
      mergeEventInLists(updated);
      await fetchEvents();
      await fetchManagedEvents();
      setSelectedEvent(updated);
      setShowManageEvent(false);
      showWalletToast('Event updated.');
      refetchOrganizerLists();
    } catch {
      setManageError('Network error');
    } finally {
      setManageSaving(false);
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

  // Deep links: open detail modal only for upcoming / ongoing events. Past events stay on the homepage
  // (full-screen modal on every reload felt like an unwanted pop-up for archived links).
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setShowCreateEvent(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete('create');
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname || '/', { scroll: false });
    }
  }, [searchParams, pathname, router]);

  useEffect(() => {
    const eventId = searchParams.get('event');
    if (!eventId || events.length === 0) return;
    const ev = events.find((e) => e.id.toLowerCase() === eventId.toLowerCase());
    if (!ev) return;
    if (isPast(ev.date, ev.endDate)) {
      setSelectedEvent(null);
      const next = new URLSearchParams(searchParams.toString());
      next.delete('event');
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname || '/', { scroll: false });
      return;
    }
    setSelectedEvent(ev);
  }, [searchParams, events, pathname, router]);

  // Remaining seats = capacity minus registrations (so it updates after someone registers)
  const getRegisteredCount = (ev: Event) => ev.registrationCount ?? ev.attendeeCount;
  const getRemainingSeats = (ev: Event) =>
    ev.maxAttendees != null && ev.maxAttendees > 0
      ? Math.max(0, ev.maxAttendees - getRegisteredCount(ev))
      : null;

  const registrantMatchesCheckIn = (
    r: { wallet?: string | null; email?: string | null },
    a: { wallet?: string | null; email?: string | null }
  ) => {
    const rw = (r.wallet ?? '').trim().toLowerCase();
    const re = (r.email ?? '').trim().toLowerCase();
    const aw = (a.wallet ?? '').trim().toLowerCase();
    const ae = (a.email ?? '').trim().toLowerCase();
    if (aw && rw && aw === rw) return true;
    if (ae && re && ae === re) return true;
    return false;
  };

  const exportOrganizerRosterCsv = () => {
    if (!selectedEvent) return;
    const unverified = registrations.filter(r => !attendees.some(a => registrantMatchesCheckIn(r, a)));
    const ticketP = selectedEvent.ticketPriceUsdc ?? 0;
    const payExport = (r: RegRow | null, verified: boolean) => {
      if (ticketP <= 0) return 'Free';
      if (verified) return '—';
      if (!r) return '—';
      const st = r.paymentStatus ?? 'none';
      if (st === 'paid_crypto') return 'USDC';
      if (st === 'paid_mobile') return 'Mobile';
      return 'Unpaid';
    };
    const payDetailExport = (r: RegRow | null) => {
      if (!r) return '—';
      const st = (r.paymentStatus ?? '').toLowerCase();
      if (st === 'paid_crypto' && r.paymentTxHash?.trim()) return r.paymentTxHash.trim();
      if (st === 'paid_mobile' && r.paymentReference?.trim()) return r.paymentReference.trim();
      return '—';
    };
    type Row = {
      Status: string;
      Identity: string;
      Name: string;
      Email: string;
      Code: string;
      Payment: string;
      PaymentDetail: string;
      Timestamp: string;
    };
    const rows: Row[] = [];
    attendees.forEach((a: { wallet?: string; email?: string; checkedInAt: string; code?: string }) => {
      rows.push({
        Status: 'Verified',
        Identity: a.wallet?.trim() || a.email?.trim() || '—',
        Name: '—',
        Email: (a.email ?? '').trim() || '—',
        Code: (a.code ?? '').trim() || '—',
        Payment: payExport(null, true),
        PaymentDetail: '—',
        Timestamp: new Date(a.checkedInAt).toLocaleString('en-GB'),
      });
    });
    unverified.forEach(r => {
      rows.push({
        Status: 'Registered only',
        Identity: r.wallet?.trim() || r.email?.trim() || '—',
        Name: (r.name ?? '').trim() || '—',
        Email: (r.email ?? '').trim() || '—',
        Code: '-',
        Payment: payExport(r, false),
        PaymentDetail: payDetailExport(r),
        Timestamp: new Date(r.registeredAt).toLocaleString('en-GB'),
      });
    });
    if (rows.length === 0) {
      showWalletToast('Nothing to export yet.');
      return;
    }
    const headers = Object.keys(rows[0]) as (keyof Row)[];
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(row => headers.map(h => esc(row[h])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gatefy-${selectedEvent.name.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}-roster.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const renderOrganizerEventPanel = () => {
    if (!selectedEvent || !isEventOrganizer(selectedEvent.organizer, orgCtx)) return null;
    const ev = selectedEvent;
    const ticketSpot = ev.ticketPriceUsdc ?? 0;
    const paidRegs = registrations.filter(
      (r) => (r.paymentStatus ?? '').toLowerCase() === 'paid_crypto' || (r.paymentStatus ?? '').toLowerCase() === 'paid_mobile'
    ).length;
    const unpaidRegs = registrations.filter((r) => {
      const st = (r.paymentStatus ?? 'none').toLowerCase();
      return st !== 'paid_crypto' && st !== 'paid_mobile';
    }).length;
    const regPayLabel = (r: RegRow) => {
      const st = r.paymentStatus ?? 'none';
      if (ticketSpot <= 0) return '—';
      if (st === 'paid_crypto') {
        const tx = r.paymentTxHash?.trim();
        return tx && tx.length > 14 ? `Paid · USDC · ${tx.slice(0, 8)}…` : 'Paid · USDC';
      }
      if (st === 'paid_mobile') {
        const ref = r.paymentReference?.trim();
        return ref ? `Paid · Mobile · ${ref.length > 18 ? `${ref.slice(0, 14)}…` : ref}` : 'Paid · Mobile';
      }
      if (st === 'none') return 'Unpaid';
      return String(st);
    };
    return (
      <>
        <div className="space-y-6 p-6 border border-white/[0.08] bg-white/[0.02]">
          <p className="text-[9px] font-mono text-cyan-400/85 tracking-wide">
            Ticket: {formatEventTicketSummary(ev)}
          </p>
          {ticketSpot > 0 ? (
            <p className="text-[9px] font-mono text-white/45">
              Payments: <span className="text-emerald-400/90">{paidRegs} recorded</span>
              {unpaidRegs > 0 ? (
                <>
                  {' '}
                  · <span className="text-amber-400/80">{unpaidRegs} unpaid / pending</span>
                </>
              ) : null}
            </p>
          ) : null}
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="bg-white p-3 border border-white/20 shrink-0">
              <QRCodeCanvas
                id={`organizer-qr-${ev.id}`}
                value={ev.verificationCode}
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
                <code className="text-2xl font-mono text-accent tracking-[0.2em] block">{ev.verificationCode}</code>
              </div>

              <div className="flex flex-wrap justify-center md:justify-start gap-4">
                <button
                  type="button"
                  onClick={() => handleDownloadQR(ev, `organizer-qr-${ev.id}`)}
                  className="px-4 py-2 bg-white text-black hover:bg-neutral-200 transition-all text-[9px] tracking-[0.2em] uppercase font-bold"
                >
                  Download QR
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(ev.verificationCode);
                  }}
                  className="px-4 py-2 border border-white/10 hover:bg-white/5 transition-all text-[9px] tracking-[0.2em] uppercase font-bold text-white/40 hover:text-white"
                >
                  Copy Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(getRegistrationLink(ev));
                    showWalletToast('Registration link copied to clipboard.');
                  }}
                  className="px-4 py-2 bg-white/10 border border-white/20 hover:bg-white/20 transition-all text-[9px] tracking-[0.2em] uppercase font-bold text-white"
                >
                  Copy Registration Link
                </button>
                {isPast(ev.date, ev.endDate) ? (
                  <span className="px-4 py-2 border border-white/10 text-[9px] tracking-[0.2em] uppercase font-bold text-white/35">
                    Past event — read only
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={openManageEventModal}
                    className="px-4 py-2 border border-blue-400/40 bg-blue-500/10 hover:bg-blue-500/20 transition-all text-[9px] tracking-[0.2em] uppercase font-bold text-blue-200/90"
                  >
                    Manage event & tickets
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="text-[8px] tracking-[0.1em] uppercase text-white/10 font-medium text-center md:text-left">Share the registration link for sign-ups. Download the QR (includes event details) for check-in at the event.</p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-[9px] tracking-[0.35em] uppercase text-white/40 font-bold">
                {isPast(ev.date, ev.endDate) ? 'Past event — visitor summary' : 'Registration & check-in roster'}
              </p>
              <p className="text-[9px] text-white/25 mt-1 font-mono">
                {registrations.length} registered · {attendees.length} verified
                {!organizerListAuthSuffix ? ' — connect the organizer wallet or use the same browser after email signup' : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportOrganizerRosterCsv}
                className="px-4 py-2 bg-white text-black hover:bg-neutral-200 transition-all text-[9px] tracking-[0.2em] uppercase font-bold"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={refetchOrganizerLists}
                disabled={loadingAttendees || !organizerListAuthSuffix}
                className="px-4 py-2 border border-white/10 hover:bg-white/5 transition-all text-[9px] tracking-[0.2em] uppercase font-bold text-white/50 hover:text-white disabled:opacity-50"
              >
                {loadingAttendees ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
          <input
            type="search"
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
            placeholder="Search attendees by name, email, wallet…"
            className="w-full bg-white/[0.04] border border-white/10 px-3 py-2 text-white text-[11px] font-mono placeholder:text-white/25 focus:outline-none focus:border-white/25"
          />
          {rosterDetail ? (
            <div className="border border-white/15 bg-white/[0.03] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[8px] tracking-[0.3em] uppercase text-white/40 font-bold">Attendee details</p>
                  <p className="text-sm text-white font-medium tracking-tight mt-1 truncate">
                    {rosterDetail.kind === 'pending'
                      ? rosterDetail.registration.name ||
                        rosterDetail.registration.email ||
                        (rosterDetail.registration.wallet
                          ? `${rosterDetail.registration.wallet.slice(0, 10)}…${rosterDetail.registration.wallet.slice(-6)}`
                          : 'Attendee')
                      : rosterDetail.registration?.name ||
                        rosterDetail.attendee.email ||
                        (rosterDetail.attendee.wallet
                          ? `${rosterDetail.attendee.wallet.slice(0, 10)}…${rosterDetail.attendee.wallet.slice(-6)}`
                          : 'Attendee')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRosterDetail(null)}
                  className="shrink-0 px-2.5 py-1 border border-white/20 text-[9px] uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                {(() => {
                  const reg =
                    rosterDetail.kind === 'pending'
                      ? rosterDetail.registration
                      : rosterDetail.registration;
                  const email =
                    reg?.email ||
                    (rosterDetail.kind === 'verified' ? rosterDetail.attendee.email : null);
                  const wallet =
                    reg?.wallet ||
                    (rosterDetail.kind === 'verified' ? rosterDetail.attendee.wallet : null);
                  const rows: { label: string; value: string; mono?: boolean }[] = [
                    { label: 'Status', value: rosterDetail.kind === 'verified' ? 'Verified' : 'Pending check-in' },
                    ...(reg?.name ? [{ label: 'Name', value: reg.name }] : []),
                    ...(email ? [{ label: 'Email', value: email, mono: true }] : []),
                    ...(wallet ? [{ label: 'Wallet', value: wallet, mono: true }] : []),
                    ...(reg
                      ? [
                          {
                            label: 'Registered',
                            value: new Date(reg.registeredAt).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                            mono: true,
                          },
                        ]
                      : []),
                    ...(rosterDetail.kind === 'verified'
                      ? [
                          {
                            label: 'Checked in',
                            value: new Date(rosterDetail.attendee.checkedInAt).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                            mono: true,
                          },
                        ]
                      : []),
                    ...(rosterDetail.kind === 'verified' && rosterDetail.attendee.code
                      ? [{ label: 'Check-in code', value: rosterDetail.attendee.code, mono: true }]
                      : []),
                    ...(ticketSpot > 0 && reg
                      ? [{ label: 'Payment', value: regPayLabel(reg), mono: true }]
                      : []),
                    ...(reg?.paymentTxHash?.trim()
                      ? [{ label: 'Tx hash', value: reg.paymentTxHash.trim(), mono: true }]
                      : []),
                    ...(reg?.paymentReference?.trim()
                      ? [{ label: 'Payment ref', value: reg.paymentReference.trim(), mono: true }]
                      : []),
                  ];
                  return rows.map((row) => (
                    <div key={row.label} className="space-y-0.5 min-w-0">
                      <p className="text-[8px] tracking-[0.25em] uppercase text-white/35 font-bold">{row.label}</p>
                      <p
                        className={`text-[11px] text-white/80 break-all ${row.mono ? 'font-mono' : 'font-sans'}`}
                      >
                        {row.value}
                      </p>
                    </div>
                  ));
                })()}
              </div>
              {(() => {
                const email =
                  (rosterDetail.kind === 'pending'
                    ? rosterDetail.registration.email
                    : rosterDetail.registration?.email || rosterDetail.attendee.email) ?? null;
                const wallet =
                  (rosterDetail.kind === 'pending'
                    ? rosterDetail.registration.wallet
                    : rosterDetail.registration?.wallet || rosterDetail.attendee.wallet) ?? null;
                if (!email && !wallet) return null;
                return (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-white/[0.06]">
                    {email ? (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(email);
                          showWalletToast('Email copied.');
                        }}
                        className="px-3 py-1.5 border border-white/15 text-[8px] uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10"
                      >
                        Copy email
                      </button>
                    ) : null}
                    {wallet ? (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(wallet);
                          showWalletToast('Wallet copied.');
                        }}
                        className="px-3 py-1.5 border border-white/15 text-[8px] uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10"
                      >
                        Copy wallet
                      </button>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          ) : null}
          {(() => {
            const filteredAttendees = attendees.filter((a) => matchesRosterSearch(a, rosterSearch));
            const unverified = registrations.filter(
              (r) =>
                !attendees.some((a) => registrantMatchesCheckIn(r, a)) &&
                matchesRosterSearch(r, rosterSearch)
            );
            const searching = rosterSearch.trim().length > 0;
            return (
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <p className="text-[10px] uppercase tracking-[0.25em] font-black text-white">Verified check-ins</p>
                <span className="text-[9px] font-mono text-green-500/80">
                  {searching ? `${filteredAttendees.length}/${attendees.length}` : attendees.length}
                </span>
              </div>
              <div className="max-h-[280px] overflow-y-auto border border-white/[0.06] bg-white/[0.02] rounded">
                {loadingAttendees ? (
                  <div className="p-4 text-center">
                    <span className="text-[10px] uppercase tracking-widest text-white/20 animate-pulse">Loading...</span>
                  </div>
                ) : filteredAttendees.length > 0 ? (
                  <div className="divide-y divide-white/[0.04]">
                    {filteredAttendees.map((a, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          setRosterDetail({
                            kind: 'verified',
                            attendee: a,
                            registration: registrations.find((r) => registrantMatchesCheckIn(r, a)) ?? null,
                          })
                        }
                        className="w-full text-left p-3 flex items-center justify-between group hover:bg-white/[0.04] transition-colors"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-[10px] font-mono text-white/70 truncate">
                            {a.wallet ? `${a.wallet.slice(0, 10)}...${a.wallet.slice(-8)}` : (a.email || '—')}
                          </p>
                          {a.code ? (
                            <p className="text-[8px] font-mono text-blue-400/70 truncate">{a.code}</p>
                          ) : null}
                          <p className="text-[8px] font-mono text-white/25">
                            {new Date(a.checkedInAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className="text-[8px] uppercase tracking-widest text-green-500/60 font-bold shrink-0 ml-2">Verified</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/25">
                      {searching
                        ? 'No verified matches'
                        : 'No verified check-ins yet'}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <p className="text-[10px] uppercase tracking-[0.25em] font-black text-white">Registered — not verified</p>
                <span className="text-[9px] font-mono text-white/40">
                  {searching
                    ? `${unverified.length}/${registrations.filter((r) => !attendees.some((a) => registrantMatchesCheckIn(r, a))).length}`
                    : unverified.length}
                </span>
              </div>
              <div className="max-h-[280px] overflow-y-auto border border-white/[0.06] bg-white/[0.02] rounded">
                {loadingAttendees ? (
                  <div className="p-4 text-center">
                    <span className="text-[10px] uppercase tracking-widest text-white/20 animate-pulse">Loading...</span>
                  </div>
                ) : unverified.length > 0 ? (
                    <div className="divide-y divide-white/[0.04]">
                      {unverified.map((r, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setRosterDetail({ kind: 'pending', registration: r })}
                          className="w-full text-left p-3 flex items-center justify-between group hover:bg-white/[0.04] transition-colors"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <p className="text-[10px] text-white/70 truncate font-sans font-medium">
                              {r.wallet
                                ? `${r.wallet.slice(0, 10)}...${r.wallet.slice(-8)}`
                                : (r.name || r.email || '—')}
                            </p>
                            {r.name && r.email ? (
                              <p className="text-[8px] font-mono text-white/35 truncate">{r.email}</p>
                            ) : null}
                            <p className="text-[8px] font-mono text-white/20">
                              Registered {new Date(r.registeredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                            <span className="text-[8px] uppercase tracking-widest text-amber-400/50 font-bold">Pending</span>
                            <span className="text-[8px] font-mono text-white/35">{regPayLabel(r)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/25">
                        {searching
                          ? 'No pending matches'
                          : registrations.length === 0
                            ? 'No registrations yet'
                            : 'All registrants have checked in'}
                      </p>
                    </div>
                  )}
              </div>
            </div>
          </div>
            );
          })()}
        </div>
      </>
    );
  };

  const handleRegisterBlockchain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    if (!address) {
      showWalletToast('Connect your wallet to register — use the button in the top right.');
      return;
    }
    const nameTrim = blockchainSignupName.trim();
    const emailTrim = blockchainSignupEmail.trim();
    if (!nameTrim) {
      showWalletToast('Enter your first name or organization name.');
      return;
    }
    if (!emailTrim) {
      showWalletToast('Enter your email.');
      return;
    }
    const price = selectedEvent.ticketPriceUsdc ?? 0;
    const useUsdc =
      price > 0 && eventAcceptsUsdc(selectedEvent) && blockchainPayMode === 'usdc';
    const useMobile =
      price > 0 && eventAcceptsMobileMoney(selectedEvent) && blockchainPayMode === 'mobile';

    if (price > 0 && !useUsdc && !useMobile) {
      showWalletToast('No payment method is enabled for this ticket. Contact the organizer.');
      return;
    }
    if (useMobile) {
      const ref = blockchainPayRef.trim();
      if (ref.length < 4) {
        showWalletToast('Enter your mobile-money payment reference after paying.');
        return;
      }
    }
    setRegistering(true);
    try {
      let paymentTxHash: string | undefined;
      if (useUsdc) {
        if (DEV_MODE) {
          paymentTxHash = `0xDEV${Date.now().toString(16)}`;
        } else {
          const hash = await writeContractAsync({
            address: USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [TREASURY_ADDRESS, parseUnits(String(price), 6)],
          });
          await waitForTransactionReceipt(wagmiConfig, { hash });
          paymentTxHash = hash;
        }
      }
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          wallet: address,
          email: emailTrim,
          name: nameTrim,
          ...(paymentTxHash ? { paymentTxHash } : {}),
          ...(useMobile && blockchainPayRef.trim()
            ? { mobileMoneyReference: blockchainPayRef.trim() }
            : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.emailSkipped) {
          showWalletToast(
            'Registered. Add RESEND_API_KEY to send confirmation emails.'
          );
        } else if (data.emailSent) {
          showWalletToast('Registered — check your email for confirmation.');
        }
        setIsUserRegistered(true);
        setEventRegProfile({
          email: emailTrim,
          name: nameTrim,
          wallet: address,
        });
        const list = await fetchEvents();
        const updated = list.find((e) => e.id === selectedEvent.id);
        if (updated) setSelectedEvent(updated);
      } else if (data.error === 'Already registered') {
        setIsUserRegistered(true);
      } else {
        showWalletToast(data.error || 'Registration failed. Please try again.');
      }
    } catch (err) {
      console.error(err);
      showWalletToast(
        err instanceof Error ? err.message : 'Payment or registration failed. Please try again.'
      );
    } finally {
      setRegistering(false);
    }
  };

  const handleRegisterNormal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    const email = normalSignupEmail.trim();
    const nameTrim = normalSignupName.trim();
    if (!email) {
      showWalletToast('Please enter your email.');
      return;
    }
    if (!nameTrim) {
      showWalletToast('Enter your first name or organization name.');
      return;
    }
    const price = selectedEvent.ticketPriceUsdc ?? 0;
    if (price > 0) {
      if (!eventAcceptsMobileMoney(selectedEvent)) {
        showWalletToast('This event is not accepting mobile-money references for tickets.');
        return;
      }
      const ref = normalPayRef.trim();
      if (ref.length < 4) {
        showWalletToast('Enter your mobile-money payment reference after paying (see instructions above).');
        return;
      }
    }
    setRegistering(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          email,
          name: nameTrim,
          ...(price > 0 && normalPayRef.trim()
            ? { mobileMoneyReference: normalPayRef.trim() }
            : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.emailSkipped) {
          showWalletToast('Registered. Add RESEND_API_KEY to send confirmation emails.');
        } else if (data.emailSent) {
          showWalletToast('Registered — check your email for confirmation.');
        }
        setIsUserRegistered(true);
        writeRegCache(selectedEvent.id, { email, name: nameTrim });
        setEventRegProfile({
          email,
          name: nameTrim,
          wallet: null,
        });
        const list = await fetchEvents();
        const updated = list.find((e) => e.id === selectedEvent.id);
        if (updated) setSelectedEvent(updated);
      } else if (data.error === 'Already registered') {
        setIsUserRegistered(true);
        writeRegCache(selectedEvent.id, { email, name: nameTrim });
        setEventRegProfile({
          email,
          name: nameTrim,
          wallet: null,
        });
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
      {/* Header / Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 sm:gap-4 px-4 py-4 sm:px-6 lg:px-12 lg:py-6 pointer-events-none bg-gradient-to-b from-black to-transparent">
        <Link href="/" className="flex items-center gap-2 sm:gap-3 pointer-events-auto cursor-pointer group shrink-0 min-w-0">
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
          <div className="flex flex-col leading-[1.1] gap-0">
            <span className="text-[10px] lg:text-xs font-semibold tracking-[0.14em] text-white group-hover:text-white/90">
              Gate <span className="text-white/65 font-medium tracking-[0.1em]">Protocol</span>
            </span>
          </div>
        </Link>

        <nav className="flex flex-1 items-center justify-center gap-2 sm:gap-5 md:gap-8 pointer-events-auto min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-1">
          <Link
            href="/#events"
            className="text-[7px] sm:text-[8px] md:text-[9px] tracking-[0.15em] sm:tracking-[0.25em] md:tracking-[0.3em] uppercase text-white/50 hover:text-white transition-colors font-bold whitespace-nowrap"
          >
            Events
          </Link>
          <Link
            href="/about"
            className="text-[7px] sm:text-[8px] md:text-[9px] tracking-[0.15em] sm:tracking-[0.25em] md:tracking-[0.3em] uppercase text-white/50 hover:text-white transition-colors font-bold whitespace-nowrap"
          >
            About
          </Link>
          <Link
            href="/leaderboard"
            className="text-[7px] sm:text-[8px] md:text-[9px] tracking-[0.15em] sm:tracking-[0.25em] md:tracking-[0.3em] uppercase text-white/50 hover:text-white transition-colors font-bold whitespace-nowrap"
          >
            Leaderboard
          </Link>
          <Link
            href="/organizer"
            className="text-[7px] sm:text-[8px] md:text-[9px] tracking-[0.15em] sm:tracking-[0.25em] md:tracking-[0.3em] uppercase text-white/50 hover:text-white transition-colors font-bold whitespace-nowrap"
          >
            Host
          </Link>
        </nav>

        <div className="pointer-events-auto shrink-0 flex items-center gap-2 scale-[0.72] sm:scale-90 lg:scale-100 origin-right">
          <ConnectStellarButton compact />
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
        </div>
      </header>

      {/* Corner notice only — never opens the wallet modal; tap to dismiss */}
      <AnimatePresence>
        {walletToast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            role="status"
            onClick={() => setWalletToast(null)}
            className="fixed bottom-4 left-4 z-[400] max-w-[min(22rem,calc(100vw-2rem))] px-4 py-2.5 border border-white/15 bg-black/88 backdrop-blur-md flex items-start gap-2.5 shadow-lg cursor-pointer pointer-events-auto"
            title="Dismiss"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0 mt-1" />
            <span className="text-[9px] font-semibold tracking-[0.12em] uppercase text-white/75 leading-snug break-words">
              {walletToast}
            </span>
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
                Web App
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

                <button
                  type="button"
                  onClick={() => {
                    setShowCreateEvent(true);
                    if (!address) {
                      setForm(f => ({ ...f, isBlockchain: false }));
                    }
                  }}
                  className="px-8 py-5 lg:py-4 border border-white/20 text-white font-medium hover:bg-white/5 transition-all flex items-center justify-center"
                >
                  <span className="tracking-[0.2em] uppercase text-sm font-bold">Create Event</span>
                </button>
              </div>

            </div>
          </motion.div>

          {/* Right: Events Panel */}
          <motion.div
            id="events"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-8 pb-12 lg:sticky lg:top-32 scroll-mt-28 lg:scroll-mt-36"
          >
            {/* Live Events */}
            {/* Session: DB status + wallet + email registration (this event) */}
            <div className="border border-white/5 bg-white/[0.02] backdrop-blur-3xl p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white">Your session</p>
              <div className="space-y-2 text-[9px] font-mono tracking-wider">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white/40 uppercase tracking-[0.2em]">Database</span>
                  {databaseConfigured === null ? (
                    <span className="text-white/30">…</span>
                  ) : databaseConfigured ? (
                    <span className="text-emerald-500/90 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-amber-500/90">Not configured</span>
                  )}
                </div>
                {isConnected && address && (
                  <div className="flex items-start justify-between gap-2 pt-1 border-t border-white/[0.06]">
                    <span className="text-white/40 uppercase tracking-[0.2em] shrink-0">Wallet</span>
                    <span className="text-white/80 text-right break-all">
                      {address.slice(0, 6)}...{address.slice(-4)}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t border-white/[0.06] space-y-2">
                  <span className="text-white/40 uppercase tracking-[0.2em] text-[9px] block font-bold">
                    Organizer (email-hosted events)
                  </span>
                  <p className="text-[8px] text-white/25 leading-relaxed">
                    Same role as connecting a wallet for on-chain events — sign in to unlock QR, roster, and export for events you created with this email.
                  </p>
                  {organizerSessionEmail ? (
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-white/40 uppercase tracking-[0.2em] shrink-0 text-[8px]">Signed in</span>
                        <span className="text-white/75 text-right break-all text-[9px] font-mono">{organizerSessionEmail}</span>
                      </div>
                      <button
                        type="button"
                        onClick={clearOrganizerEmailSession}
                        className="text-[8px] font-bold tracking-[0.2em] uppercase text-white/35 hover:text-white border border-white/10 px-2 py-1.5 w-full"
                      >
                        Sign out organizer
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleOrganizerSignInSubmit} className="space-y-2">
                      <input
                        type="email"
                        value={organizerSignInDraft}
                        onChange={e => setOrganizerSignInDraft(e.target.value)}
                        placeholder="you@company.com"
                        autoComplete="email"
                        className="w-full bg-white/[0.04] border border-white/10 px-3 py-2.5 text-white text-[11px] font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25"
                      />
                      <button
                        type="submit"
                        className="w-full py-2.5 bg-white text-black text-[8px] font-black tracking-[0.2em] uppercase hover:bg-neutral-200"
                      >
                        Sign in as organizer
                      </button>
                    </form>
                  )}
                </div>
                {selectedEvent?.isBlockchain === false &&
                  eventRegProfile?.email &&
                  isUserRegistered && (
                    <div className="pt-1 border-t border-white/[0.06] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white/40 uppercase tracking-[0.2em]">Registered</span>
                        <span className="text-white/70 text-right break-all">{eventRegProfile.email}</span>
                      </div>
                      {eventRegProfile.name ? (
                        <p className="text-[10px] text-white/90 font-sans font-medium tracking-tight pl-0">
                          {eventRegProfile.name}
                        </p>
                      ) : null}
                    </div>
                  )}
                {selectedEvent && selectedEvent.isBlockchain !== false && isUserRegistered && (
                  <div className="pt-1 border-t border-white/[0.06] space-y-1">
                    <span className="text-emerald-500/85 text-[9px] uppercase tracking-[0.2em] font-bold">
                      Registered for this event
                    </span>
                    {eventRegProfile?.name ? (
                      <p className="text-[10px] text-white/85 font-sans tracking-tight">{eventRegProfile.name}</p>
                    ) : null}
                    {eventRegProfile?.email ? (
                      <p className="text-[9px] font-mono text-white/45 break-all">{eventRegProfile.email}</p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

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
                              {ev.isBlockchain === false && (
                                <span className="text-[7px] bg-white/10 text-white/80 px-1 border border-white/20 font-black tracking-widest uppercase shrink-0">Email</span>
                              )}
                              <p className="text-sm font-bold tracking-tight truncate uppercase">{ev.name}</p>
                            </div>
                            {ev.location ? (
                              <p className="text-[9px] tracking-[0.2em] uppercase text-secondary/40 font-bold truncate pl-3">{ev.location} // {formatOrganizerShort(ev)}</p>
                            ) : (
                              <p className="text-[9px] tracking-[0.2em] uppercase text-secondary/40 font-bold truncate pl-3">ORG: {formatOrganizerShort(ev)}</p>
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
            {(((isConnected && address) || organizerSessionEmail)) && (
              <div id="your-events" className="space-y-4 scroll-mt-28">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white">Your Uploads</p>
                    <p className="text-[8px] font-mono text-white/40 tracking-wider">
                      {address
                        ? `Wallet: ${address.slice(0, 6)}...${address.slice(-4)}`
                        : organizerSessionEmail
                          ? `Email: ${organizerSessionEmail}`
                          : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href="/organizer"
                      className="text-[8px] font-black uppercase tracking-widest border border-blue-400/35 text-blue-200/90 px-3 py-1.5 hover:bg-blue-500/10"
                    >
                      Full dashboard
                    </Link>
                    <span className="text-[9px] font-mono text-white/70 tracking-widest">
                      {managedEventsLoading ? '…' : `${managedEvents.length} Total`}
                    </span>
                  </div>
                </div>

                <div className="border border-white/5 bg-white/[0.01] backdrop-blur-3xl overflow-hidden">
                  {managedEventsLoading && managedEvents.length === 0 ? (
                    <div className="p-8 flex flex-col items-center justify-center text-center gap-4">
                      <p className="text-[10px] text-center tracking-[0.3em] uppercase opacity-30 animate-pulse">Loading your events…</p>
                    </div>
                  ) : managedEvents.length === 0 ? (
                    <div className="p-8 flex flex-col items-center justify-center text-center gap-4">
                      <p className="text-[10px] text-center tracking-[0.3em] uppercase opacity-30">No uploads found</p>
                      <button
                        type="button"
                        onClick={() => setShowCreateEvent(true)}
                        className="text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white border border-white/15 px-4 py-2"
                      >
                        Create event
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.05]">
                      {[...managedEvents]
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
                                <p className="text-[8px] tracking-[0.2em] uppercase text-secondary/20 font-bold truncate pl-3">
                                  {formatEventTicketSummary(ev)} · {formatOrganizerShort(ev)}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[8px] font-mono text-secondary/40">{formatDateTime(ev.date)}</p>
                                <p className="text-[8px] tracking-widest text-accent mt-0.5">
                                  {ev.maxAttendees != null && ev.maxAttendees > 0
                                    ? `${getRegisteredCount(ev)} / ${ev.maxAttendees} · ${getRemainingSeats(ev) ?? 0} left`
                                    : `${ev.attendeeCount} checkins`}
                                </p>
                                {(ev.ticketPriceUsdc ?? 0) > 0 &&
                                (ev.paidRegistrationCount != null || ev.unpaidRegistrationCount != null) ? (
                                  <p className="text-[8px] font-mono text-white/35 mt-0.5">
                                    {ev.paidRegistrationCount ?? 0} paid
                                    {(ev.unpaidRegistrationCount ?? 0) > 0
                                      ? ` · ${ev.unpaidRegistrationCount} unpaid`
                                      : ''}
                                  </p>
                                ) : null}
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
          <div className="fixed inset-0 z-[300]">
            <div className="absolute top-4 right-4 z-[310] w-[min(16rem,calc(100vw-2rem))] pointer-events-auto">
              <ConnectStellarButton
                onConnected={() =>
                  setScannerStatus('Freighter connected — authenticate to mint on Soroban.')
                }
              />
            </div>
            <Scanner
              onScan={handleScan}
              onClose={() => {
                if (scanning) return;
                setScannerStatus(null);
                setShowScanner(false);
              }}
              busy={scanning}
              status={scannerStatus}
              needEmail={!address || selectedEvent?.isBlockchain === false}
              initialEmail={eventRegProfile?.email ?? ''}
            />
          </div>
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
              className="w-full max-w-xl border border-white/10 bg-black max-h-[90vh] lg:max-h-[92vh] flex flex-col overflow-hidden"
            >
              <CreateEventWizard
                form={form}
                setForm={setForm}
                address={address}
                organizerSessionEmail={organizerSessionEmail}
                creating={creating}
                createError={createError}
                uploadingBanner={uploadingBanner}
                setUploadingBanner={setUploadingBanner}
                minStartDatetimeLocal={minStartDatetimeLocal}
                onSubmit={handleCreateEvent}
                onCancel={() => setShowCreateEvent(false)}
                showToast={showWalletToast}
                onCommitOrganizerEmail={(email) => commitOrganizerEmailSession(email, { silent: true })}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showManageEvent && selectedEvent && !isPast(selectedEvent.date, selectedEvent.endDate) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setShowManageEvent(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-lg border border-white/10 bg-black max-h-[90vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-[9px] tracking-[0.35em] uppercase text-blue-400/90 font-black">Organizer</p>
                  <h2 className="text-lg font-bold tracking-tight">Manage event & tickets</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManageEvent(false)}
                  className="text-[10px] font-bold uppercase text-white/40 hover:text-white"
                >
                  Close
                </button>
              </div>
              <form onSubmit={handleSaveManagedEvent} className="flex flex-col min-h-0 flex-1">
                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                  {manageError ? (
                    <p className="text-[10px] text-red-400 font-mono">{manageError}</p>
                  ) : null}
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-white/35 font-bold">Name</label>
                    <input
                      value={manageForm.name}
                      onChange={(e) => setManageForm((f) => ({ ...f, name: e.target.value }))}
                      required
                      className="w-full bg-white/[0.04] border border-white/10 px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/25"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-white/35 font-bold">Description</label>
                    <textarea
                      value={manageForm.description}
                      onChange={(e) => setManageForm((f) => ({ ...f, description: e.target.value }))}
                      rows={2}
                      className="w-full bg-white/[0.04] border border-white/10 px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-white/25"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase tracking-widest text-white/35 font-bold">Banner image</label>
                    {manageForm.bannerUrl ? (
                      <div className="relative border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={manageForm.bannerUrl} alt="" className="w-full h-28 object-cover opacity-90" />
                        <button
                          type="button"
                          onClick={() => setManageForm((f) => ({ ...f, bannerUrl: '' }))}
                          className="absolute top-2 right-2 text-[8px] font-bold uppercase bg-black/80 border border-white/20 px-2 py-1 text-white/70 hover:text-white"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label className="block w-full bg-white/[0.04] border border-white/10 px-3 py-4 text-center text-white/40 text-[10px] font-mono cursor-pointer hover:border-white/20">
                        {manageBannerUploading ? 'Uploading…' : 'Choose image (optional)'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={manageBannerUploading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !selectedEvent) return;
                            setManageBannerUploading(true);
                            try {
                              const fd = new FormData();
                              fd.set('file', file);
                              fd.set('eventId', selectedEvent.id);
                              if (address) fd.set('organizerWallet', address);
                              if (organizerSessionEmail) fd.set('organizerEmail', organizerSessionEmail);
                              const res = await fetch('/api/events/upload-banner', { method: 'POST', body: fd });
                              const data = await res.json();
                              if (data.url) setManageForm((f) => ({ ...f, bannerUrl: data.url }));
                              else showWalletToast(data.error || 'Banner upload failed.');
                            } catch {
                              showWalletToast('Banner upload failed.');
                            } finally {
                              setManageBannerUploading(false);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-widest text-white/35 font-bold">Start</label>
                      <input
                        type="datetime-local"
                        value={manageForm.date}
                        onChange={(e) => setManageForm((f) => ({ ...f, date: e.target.value }))}
                        required
                        className="w-full bg-white/[0.04] border border-white/10 px-2 py-2 text-white text-[11px] [color-scheme:dark]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-widest text-white/35 font-bold">End (optional)</label>
                      <input
                        type="datetime-local"
                        value={manageForm.endDate}
                        onChange={(e) => setManageForm((f) => ({ ...f, endDate: e.target.value }))}
                        className="w-full bg-white/[0.04] border border-white/10 px-2 py-2 text-white text-[11px] [color-scheme:dark]"
                      />
                    </div>
                  </div>
                  <EventLocationField
                    id="manage-event-location"
                    variant="manage"
                    value={manageForm.location}
                    onChange={(location) => setManageForm((f) => ({ ...f, location }))}
                  />
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-white/35 font-bold">Max capacity</label>
                    <input
                      type="number"
                      min={1}
                      value={manageForm.maxAttendees}
                      onChange={(e) => setManageForm((f) => ({ ...f, maxAttendees: e.target.value }))}
                      placeholder="Empty = unlimited"
                      className="w-full bg-white/[0.04] border border-white/10 px-3 py-2.5 text-white text-sm [color-scheme:dark]"
                    />
                  </div>
                  <div className="space-y-1 p-3 border border-white/10 bg-white/[0.02]">
                    <label className="text-[9px] uppercase tracking-widest text-white/35 font-bold">Ticket (USDC) — blank = free</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={manageForm.ticketPriceUsdc}
                      onChange={(e) => setManageForm((f) => ({ ...f, ticketPriceUsdc: e.target.value }))}
                      className="w-full bg-black/40 border border-white/10 px-3 py-2 text-white text-sm [color-scheme:dark]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-white/35 font-bold">Mobile money instructions</label>
                    <textarea
                      value={manageForm.mobileMoneyInstructions}
                      onChange={(e) => setManageForm((f) => ({ ...f, mobileMoneyInstructions: e.target.value }))}
                      rows={3}
                      className="w-full bg-white/[0.04] border border-white/10 px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-white/25"
                    />
                  </div>
                  {(() => {
                    const tp = parseFloat(manageForm.ticketPriceUsdc.trim());
                    const paid = Number.isFinite(tp) && tp > 0;
                    if (!paid) return null;
                    return (
                      <div className="space-y-3 p-3 border border-cyan-500/25 bg-cyan-500/[0.04] rounded">
                        <p className="text-[9px] uppercase tracking-widest text-cyan-400 font-black">
                          Accepted payment modes
                        </p>
                        {selectedEvent.isBlockchain !== false ? (
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={manageForm.ticketAcceptUsdc}
                              onChange={(e) =>
                                setManageForm((f) => ({ ...f, ticketAcceptUsdc: e.target.checked }))
                              }
                              className="mt-0.5"
                            />
                            <span className="text-[10px] text-white/70">
                              Accept <strong className="text-white">USDC on Base</strong> (wallet signup)
                            </span>
                          </label>
                        ) : (
                          <p className="text-[9px] text-white/40">
                            This event uses email signup — collectors pay with{' '}
                            <strong className="text-white/60">mobile money reference</strong> when enabled below.
                          </p>
                        )}
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manageForm.ticketAcceptMobileMoney}
                            onChange={(e) =>
                              setManageForm((f) => ({ ...f, ticketAcceptMobileMoney: e.target.checked }))
                            }
                            className="mt-0.5 accent-emerald-500"
                          />
                          <span className="text-[10px] text-white/70">
                            Accept <strong className="text-emerald-400">mobile-money references</strong>
                          </span>
                        </label>
                      </div>
                    );
                  })()}
                </div>
                <div className="p-5 border-t border-white/10 flex gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowManageEvent(false)}
                    className="flex-1 py-3 border border-white/20 text-[10px] font-bold uppercase text-white/60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={manageSaving}
                    className="flex-1 py-3 bg-white text-black text-[10px] font-black uppercase hover:bg-neutral-200 disabled:opacity-50"
                  >
                    {manageSaving ? 'Saving…' : 'Save changes'}
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
            className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-xl flex items-start justify-center overflow-y-auto p-3 lg:p-6 pt-6 lg:pt-8"
            onClick={(e) => e.target === e.currentTarget && setSelectedEvent(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              className="w-full max-w-lg border border-white/10 bg-black overflow-y-auto max-h-[90vh] no-scrollbar flex flex-col shrink-0"
            >
              {/* Sticky header: Back + status + Close (always visible) */}
              <div className="sticky top-0 z-10 shrink-0 px-3 py-2.5 flex items-center gap-2 border-b border-white/10 bg-black backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-white/30 bg-white/10 hover:bg-white/20 text-white text-xs font-bold tracking-wide"
                  aria-label="Back"
                >
                  Back
                </button>
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  {isUpcoming(selectedEvent.date, selectedEvent.endDate) ? (
                    <>
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0" />
                      <span className="text-[8px] tracking-[0.25em] uppercase text-green-400 font-bold truncate">Upcoming</span>
                    </>
                  ) : isOngoing(selectedEvent.date, selectedEvent.endDate) ? (
                    <>
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0 animate-pulse" />
                      <span className="text-[8px] tracking-[0.25em] uppercase text-amber-400 font-bold truncate">Ongoing</span>
                    </>
                  ) : (
                    <>
                      <div className="w-1.5 h-1.5 bg-white/20 rounded-full shrink-0" />
                      <span className="text-[8px] tracking-[0.25em] uppercase text-white/30 font-bold truncate">Past Event</span>
                    </>
                  )}
                  {selectedEvent.isVip && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                      <span className="text-[8px] tracking-[0.25em] uppercase text-yellow-500 font-bold">VIP</span>
                    </div>
                  )}
                  {selectedEvent.isBlockchain === false && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="w-1.5 h-1.5 bg-white/50 rounded-full" />
                      <span className="text-[8px] tracking-[0.25em] uppercase text-white/70 font-bold">Email signup</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="ml-auto shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded border border-white/30 bg-white/10 hover:bg-white/20 text-white text-xs font-bold"
                  aria-label="Close"
                >
                  <span aria-hidden className="text-base leading-none">×</span>
                  <span>Close</span>
                </button>
              </div>

              <div className="p-4 space-y-4">
                {selectedEvent.bannerUrl && (
                  <div className="w-full -mx-4 -mt-4 mb-0 bg-white/5">
                    <img
                      src={selectedEvent.bannerUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      className="w-full h-36 sm:h-44 object-cover"
                    />
                  </div>
                )}
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tighter mb-1">{selectedEvent.name}</h2>
                  {selectedEvent.description && (
                    <p className="text-secondary/60 text-xs font-light leading-snug line-clamp-3">{selectedEvent.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  <div className="space-y-0.5">
                    <p className="text-[8px] tracking-[0.25em] uppercase text-white/40 font-bold">Start</p>
                    <p className="text-xs font-mono text-white/70">{formatDateTime(selectedEvent.date)}</p>
                  </div>
                  {selectedEvent.endDate ? (
                    <div className="space-y-0.5">
                      <p className="text-[8px] tracking-[0.25em] uppercase text-white/40 font-bold">End</p>
                      <p className="text-xs font-mono text-white/70">{formatDateTime(selectedEvent.endDate)}</p>
                    </div>
                  ) : null}
                  {selectedEvent.location && (
                    <div className="col-span-2 space-y-1.5">
                      <p className="text-[8px] tracking-[0.25em] uppercase text-white/40 font-bold">Location</p>
                      <p className="text-xs font-mono text-white/70 leading-snug line-clamp-2" title={selectedEvent.location}>
                        {selectedEvent.location}
                      </p>
                      <EventLocationMapLazy location={selectedEvent.location} compact />
                    </div>
                  )}
                  <div className="space-y-0.5">
                    <p className="text-[8px] tracking-[0.25em] uppercase text-white/40 font-bold">Organizer</p>
                    <p className="text-[11px] font-mono text-white/50 truncate" title={selectedEvent.organizer}>
                      {selectedEvent.organizer.slice(0, 8)}...{selectedEvent.organizer.slice(-4)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[8px] tracking-[0.25em] uppercase text-white/40 font-bold">Attendees</p>
                    <p className="text-xs font-mono text-white/70">
                      {selectedEvent.maxAttendees != null && selectedEvent.maxAttendees > 0
                        ? `${getRegisteredCount(selectedEvent)} / ${selectedEvent.maxAttendees} (${selectedEvent.attendeeCount} verified)`
                        : selectedEvent.attendeeCount}
                    </p>
                  </div>
                  {selectedEvent.maxAttendees != null && selectedEvent.maxAttendees > 0 && (
                    <>
                      <div className="space-y-0.5">
                        <p className="text-[8px] tracking-[0.25em] uppercase text-white/40 font-bold">Capacity</p>
                        <p className="text-xs font-mono text-white/70">{selectedEvent.maxAttendees} people</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[8px] tracking-[0.25em] uppercase text-white/40 font-bold">Remaining</p>
                        <p className="text-xs font-mono text-white/70">
                          {getRemainingSeats(selectedEvent) ?? 0} spots left
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {(selectedEvent.ticketPriceUsdc ?? 0) > 0 && (
                  <div className="p-3 border border-blue-500/25 bg-blue-500/[0.06] space-y-2">
                    <p className="text-[9px] uppercase tracking-[0.25em] text-blue-400/95 font-black">Ticket</p>
                    <p className="text-xs text-white/90 font-semibold">
                      <strong className="text-white">{selectedEvent.ticketPriceUsdc} USDC</strong>
                      {selectedEvent.isBlockchain !== false
                        ? eventAcceptsUsdc(selectedEvent)
                          ? ' · Pay with USDC on Base when registering with a wallet.'
                          : ' · USDC checkout is turned off for this event.'
                        : null}
                    </p>
                    <ul className="text-[9px] text-white/65 space-y-1 list-none font-mono leading-snug">
                      {selectedEvent.isBlockchain !== false && eventAcceptsUsdc(selectedEvent) && (
                        <li>
                          <span className="text-blue-300/90 font-bold">Crypto</span>: USDC on Base (wallet registration).
                        </li>
                      )}
                      {eventAcceptsMobileMoney(selectedEvent) && (
                        <li>
                          <span className="text-emerald-400/90 font-bold">Mobile money</span>: follow the organizer’s steps and enter your reference when you register with email.
                        </li>
                      )}
                      {!eventAcceptsMobileMoney(selectedEvent) && selectedEvent.isBlockchain === false ? (
                        <li className="text-amber-400/80">
                          Check with the host — mobile-money payment is not listed for this ticket.
                        </li>
                      ) : null}
                    </ul>
                    {selectedEvent.mobileMoneyInstructions ? (
                      <div className="text-[10px] text-white/75 whitespace-pre-wrap leading-snug border border-white/10 p-2.5 bg-black/40 font-sans">
                        <p className="text-[8px] uppercase tracking-widest text-white/35 font-black mb-1.5">
                          How to pay (mobile / local)
                        </p>
                        {selectedEvent.mobileMoneyInstructions}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Non-blockchain event: normal email signup (no wallet required) */}
                {selectedEvent.isBlockchain === false ? (
                  <div className="space-y-3">
                    {renderOrganizerEventPanel()}
                    {/* Hosts only see organizer tools — not attendee register/confirm UI */}
                    {!isEventOrganizer(selectedEvent.organizer, orgCtx) && (!isUserRegistered ? (
                      isPast(selectedEvent.date, selectedEvent.endDate) ? (
                        <div className="p-3 border border-white/10 bg-white/[0.02] text-center">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Event ended</p>
                          <p className="text-[9px] text-white/25 mt-1">Registration is closed for this event.</p>
                        </div>
                      ) : (
                        <form onSubmit={handleRegisterNormal} className="space-y-3 p-3 border border-white/10 bg-white/[0.02]">
                          <p className="text-[8px] tracking-[0.25em] uppercase text-white/50 font-bold">Sign up with email</p>
                          <div className="space-y-1">
                            <label className="text-[8px] tracking-[0.2em] uppercase text-white/40 block">Email *</label>
                            <input
                              type="email"
                              required
                              value={normalSignupEmail}
                              onChange={e => setNormalSignupEmail(e.target.value)}
                              placeholder="you@example.com"
                              className="w-full bg-white/[0.04] border border-white/10 px-3 py-2 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] tracking-[0.2em] uppercase text-white/40 block">
                              First name or organization name *
                            </label>
                            <input
                              type="text"
                              required
                              value={normalSignupName}
                              onChange={e => setNormalSignupName(e.target.value)}
                              placeholder="Jane Doe or Acme Inc."
                              className="w-full bg-white/[0.04] border border-white/10 px-3 py-2 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25"
                            />
                          </div>
                          {(selectedEvent.ticketPriceUsdc ?? 0) > 0 &&
                          eventAcceptsMobileMoney(selectedEvent) ? (
                            <div className="space-y-1">
                              <label className="text-[8px] tracking-[0.2em] uppercase text-white/40 block">
                                Mobile-money reference * (after payment)
                              </label>
                              <input
                                type="text"
                                required
                                value={normalPayRef}
                                onChange={e => setNormalPayRef(e.target.value)}
                                placeholder="Transaction ID from your provider"
                                className="w-full bg-white/[0.04] border border-white/10 px-3 py-2 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25"
                              />
                            </div>
                          ) : null}
                          <button
                            type="submit"
                            disabled={registering}
                            className="w-full py-3 bg-white text-black hover:bg-neutral-200 transition-all font-bold text-[10px] tracking-[0.2em] uppercase disabled:opacity-50"
                          >
                            {registering ? 'Processing...' : 'Register for Event'}
                          </button>
                        </form>
                      )
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 border border-white/10 bg-white/[0.02] text-center space-y-1.5">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                            <p className="text-[10px] uppercase tracking-[0.2em] text-green-400/80 font-bold">You&apos;re registered</p>
                          </div>
                          {eventRegProfile?.name && (
                            <p className="text-sm text-white/90 font-medium tracking-tight">{eventRegProfile.name}</p>
                          )}
                          {eventRegProfile?.email && (
                            <p className="text-[10px] font-mono text-white/45 break-all">{eventRegProfile.email}</p>
                          )}
                          {isConnected && address && (
                            <p className="text-[9px] font-mono text-white/35 pt-1 border-t border-white/[0.06]">
                              Wallet: {address.slice(0, 6)}...{address.slice(-4)}
                            </p>
                          )}
                          <p className="text-[9px] text-white/25">Scan the event QR at the door to verify attendance.</p>
                        </div>

                        {isPast(selectedEvent.date, selectedEvent.endDate) ? (
                          <div className="p-4 border border-white/10 bg-white/[0.02] text-center">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Event ended</p>
                            <p className="text-[9px] text-white/25 mt-1">Verification is closed for past events.</p>
                          </div>
                        ) : isUserVerified ? (
                          <div className="p-4 border border-white/10 bg-white/[0.02] text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                              <p className="text-[10px] uppercase tracking-[0.2em] text-green-400/80 font-bold">Attendance verified</p>
                            </div>
                            <p className="text-[9px] text-white/25 mt-1">You have checked in for this event.</p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowScanner(true)}
                            className="btn-premium w-full py-4 group"
                          >
                            <div className="flex items-center justify-center gap-3">
                              <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                              <span className="tracking-[0.2em] uppercase text-sm font-bold">Verify Attendance</span>
                            </div>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : !isConnected ? (
                  <button
                    type="button"
                    onClick={() => openConnectModal?.()}
                    className="w-full p-4 border border-white/20 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/30 text-center transition-colors"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-bold">Connect wallet to interact</p>
                  </button>
                ) : (
                  <div className="space-y-6">
                    {renderOrganizerEventPanel()}

                    {/* Action Button: Register first, then Verify only when event has started and is not past */}
                    {/* Hosts only see organizer tools — not attendee register/confirm UI */}
                    {!isEventOrganizer(selectedEvent.organizer, orgCtx) && (!isUserRegistered ? (
                      isPast(selectedEvent.date, selectedEvent.endDate) ? (
                        <div className="p-4 border border-white/10 bg-white/[0.02] text-center">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Event ended</p>
                          <p className="text-[9px] text-white/25 mt-1">Registration is closed for this event.</p>
                        </div>
                      ) : (
                        <form
                          onSubmit={handleRegisterBlockchain}
                          className="space-y-4 p-4 border border-white/10 bg-white/[0.02]"
                        >
                          <p className="text-[9px] tracking-[0.3em] uppercase text-white/50 font-bold">
                            Register with wallet
                          </p>
                          <p className="text-[9px] text-white/35 leading-relaxed">
                            Connect your wallet, then add how we should list you and your email for confirmations.
                            {(selectedEvent.ticketPriceUsdc ?? 0) > 0 && eventAcceptsUsdc(selectedEvent) && blockchainPayMode === 'usdc' ? (
                              <span className="block mt-2 text-amber-400/90">
                                This ticket costs {selectedEvent.ticketPriceUsdc} USDC on Base — your wallet will be prompted to pay when you register.
                              </span>
                            ) : null}
                            {(selectedEvent.ticketPriceUsdc ?? 0) > 0 &&
                            eventAcceptsMobileMoney(selectedEvent) &&
                            blockchainPayMode === 'mobile' ? (
                              <span className="block mt-2 text-emerald-400/90">
                                Pay with mobile money using the organizer&apos;s instructions, then enter your reference below.
                              </span>
                            ) : null}
                          </p>
                          {(selectedEvent.ticketPriceUsdc ?? 0) > 0 &&
                          eventAcceptsUsdc(selectedEvent) &&
                          eventAcceptsMobileMoney(selectedEvent) ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setBlockchainPayMode('usdc')}
                                className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest border ${
                                  blockchainPayMode === 'usdc'
                                    ? 'bg-white text-black border-white'
                                    : 'border-white/15 text-white/50 hover:text-white'
                                }`}
                              >
                                Pay USDC
                              </button>
                              <button
                                type="button"
                                onClick={() => setBlockchainPayMode('mobile')}
                                className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest border ${
                                  blockchainPayMode === 'mobile'
                                    ? 'bg-emerald-600/30 text-emerald-200 border-emerald-500/40'
                                    : 'border-white/15 text-white/50 hover:text-white'
                                }`}
                              >
                                Mobile money
                              </button>
                            </div>
                          ) : null}
                          {(selectedEvent.ticketPriceUsdc ?? 0) > 0 &&
                          blockchainPayMode === 'mobile' &&
                          eventAcceptsMobileMoney(selectedEvent) &&
                          selectedEvent.mobileMoneyInstructions ? (
                            <div className="text-[11px] text-white/75 whitespace-pre-wrap leading-relaxed border border-white/10 p-3 bg-black/40">
                              {selectedEvent.mobileMoneyInstructions}
                            </div>
                          ) : null}
                          {(selectedEvent.ticketPriceUsdc ?? 0) > 0 &&
                          blockchainPayMode === 'mobile' &&
                          eventAcceptsMobileMoney(selectedEvent) ? (
                            <div className="space-y-2">
                              <label className="text-[8px] tracking-[0.2em] uppercase text-white/40 block">
                                Mobile-money reference *
                              </label>
                              <input
                                type="text"
                                required
                                value={blockchainPayRef}
                                onChange={e => setBlockchainPayRef(e.target.value)}
                                placeholder="Transaction ID from your provider"
                                className="w-full bg-white/[0.04] border border-white/10 px-4 py-3 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25"
                              />
                            </div>
                          ) : null}
                          <div className="space-y-2">
                            <label className="text-[8px] tracking-[0.2em] uppercase text-white/40 block">
                              First name or organization name *
                            </label>
                            <input
                              type="text"
                              required
                              value={blockchainSignupName}
                              onChange={e => setBlockchainSignupName(e.target.value)}
                              placeholder="Jane Doe or Acme Inc."
                              className="w-full bg-white/[0.04] border border-white/10 px-4 py-3 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[8px] tracking-[0.2em] uppercase text-white/40 block">Email *</label>
                            <input
                              type="email"
                              required
                              value={blockchainSignupEmail}
                              onChange={e => setBlockchainSignupEmail(e.target.value)}
                              placeholder="you@example.com"
                              className="w-full bg-white/[0.04] border border-white/10 px-4 py-3 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/25"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={registering}
                            className="w-full py-4 bg-white text-black hover:bg-neutral-200 transition-all group flex items-center justify-center gap-3 disabled:opacity-50"
                          >
                            <span className="tracking-[0.2em] uppercase text-sm font-bold">
                              {registering ? 'Processing...' : 'Register for Event'}
                            </span>
                          </button>
                        </form>
                      )
                    ) : isPast(selectedEvent.date, selectedEvent.endDate) ? (
                      <div className="p-4 border border-white/10 bg-white/[0.02] text-center">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Event ended</p>
                        <p className="text-[9px] text-white/25 mt-1">Verification is closed for past events.</p>
                      </div>
                    ) : isUserVerified ? (
                      <div className="p-4 border border-white/10 bg-white/[0.02] text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                          <p className="text-[10px] uppercase tracking-[0.2em] text-green-400/80 font-bold">Attendance verified</p>
                        </div>
                        <p className="text-[9px] text-white/25 mt-1">You have already checked in for this event.</p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowScanner(true)}
                        className="btn-premium w-full py-4 group"
                      >
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                          <span className="tracking-[0.2em] uppercase text-sm font-bold">Verify Attendance</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event Created — QR Download Modal (compact) */}
      <AnimatePresence>
        {createdEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm border border-white/10 bg-black overflow-y-auto max-h-[92vh] no-scrollbar"
            >
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[8px] tracking-[0.35em] uppercase text-green-400 font-bold">Event registered</p>
                  <p className="text-[9px] font-mono text-white/35 tracking-widest truncate">{createdEvent.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCreatedEvent(null);
                    setSelectedEvent(null);
                    fetchEvents();
                  }}
                  className="shrink-0 text-[9px] font-bold tracking-[0.25em] uppercase text-white/40 hover:text-white"
                >
                  Done
                </button>
              </div>

              <div className="p-4 space-y-3">
                {createdEvent.bannerUrl ? (
                  <img
                    src={createdEvent.bannerUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    className="w-full h-20 object-cover border border-white/10"
                  />
                ) : null}

                <div>
                  <h2 className="text-base font-bold tracking-tight leading-snug">{createdEvent.name}</h2>
                  <p
                    className="text-[9px] uppercase tracking-[0.12em] text-white/35 font-bold mt-1 line-clamp-2"
                    title={
                      createdEvent.location
                        ? `${formatDateTime(createdEvent.date)} · ${createdEvent.location}`
                        : formatDateTime(createdEvent.date)
                    }
                  >
                    {formatDateTime(createdEvent.date)}
                    {createdEvent.location ? ` · ${createdEvent.location}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white shrink-0">
                    <QRCodeCanvas
                      id="event-qr-canvas"
                      value={createdEvent.verificationCode}
                      size={128}
                      level="H"
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-[8px] uppercase tracking-[0.25em] text-white/40 font-bold">Verification code</p>
                    <p className="font-mono text-lg tracking-[0.28em] text-white break-all leading-none">
                      {createdEvent.verificationCode}
                    </p>
                    <p className="text-[9px] text-white/35 leading-snug">
                      Share the link. Attendees register, then scan at the door.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadQR(createdEvent, 'event-qr-canvas')}
                    className="btn-premium flex-1 py-2.5 flex items-center justify-center"
                  >
                    <span className="tracking-[0.15em] uppercase text-[10px] font-bold">Download QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdEvent.verificationCode);
                    }}
                    className="flex-1 py-2.5 border border-white/15 hover:bg-white/5 transition-colors"
                  >
                    <span className="tracking-[0.15em] uppercase text-[10px] font-bold text-white/70">Copy code</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(getRegistrationLink(createdEvent));
                    showWalletToast('Registration link copied to clipboard.');
                  }}
                  className="w-full py-2.5 border border-white/15 hover:bg-white/5 transition-colors"
                >
                  <span className="tracking-[0.15em] uppercase text-[10px] font-bold text-white/70">
                    Copy registration link
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verify + Soroban mint success */}
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
                <span className="text-[10px] font-bold tracking-[0.5em] uppercase text-accent">
                  {mintReceipt?.ok ? 'Minted on Stellar' : 'Attendance verified'}
                </span>
              </div>
              <h2 className="text-5xl md:text-8xl font-medium tracking-tighter mb-8 italic">VERIFIED.</h2>
              <p className="text-lg md:text-xl text-secondary font-light mb-8 max-w-sm mx-auto">
                {mintReceipt?.ok
                  ? 'Your attendance proof was minted on Soroban. Base minting comes later.'
                  : mintReceipt?.error
                    ? `Checked in. Mint: ${mintReceipt.error}`
                    : 'Your presence is recorded. Connect Freighter to mint on Soroban.'}
              </p>
              {mintReceipt?.ok && mintReceipt.tokenId ? (
                <p className="text-[10px] font-mono text-white/40 mb-8">
                  Token #{mintReceipt.tokenId}
                  {mintReceipt.txHash ? ` · ${mintReceipt.txHash.slice(0, 10)}…` : ''}
                </p>
              ) : null}
              {!mintReceipt?.ok && selectedEvent ? (
                <div className="w-full max-w-xs mx-auto mb-8 space-y-3">
                  <ConnectStellarButton
                    onConnected={() => showWalletToast('Freighter connected — tap Mint proof.')}
                  />
                  <button
                    type="button"
                    className="w-full py-3 border border-white/20 hover:bg-white hover:text-black transition-colors text-[10px] font-bold tracking-[0.2em] uppercase"
                    onClick={async () => {
                      const stellar = readStellarAddress();
                      if (!stellar) {
                        showWalletToast('Connect Freighter first.');
                        return;
                      }
                      const email = eventRegProfile?.email || readRegCache(selectedEvent.id)?.email;
                      try {
                        const res = await fetch('/api/attendance/mint', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            eventId: selectedEvent.id,
                            email: email || undefined,
                            wallet: address || undefined,
                            stellarAddress: stellar,
                          }),
                        });
                        const data = await res.json();
                        if (data.ok) {
                          setMintReceipt({
                            ok: true,
                            chain: data.chain,
                            txHash: data.txHash,
                            tokenId: data.tokenId,
                            explorerUrl: data.explorerUrl,
                          });
                          showWalletToast(
                            data.alreadyMinted ? 'Proof already minted.' : 'Minted on Stellar.'
                          );
                        } else {
                          showWalletToast(data.error || 'Mint failed.');
                        }
                      } catch {
                        showWalletToast('Network error during mint.');
                      }
                    }}
                  >
                    Mint proof on Stellar
                  </button>
                </div>
              ) : null}
              <div className="flex flex-col gap-6 items-center">
                <button
                  type="button"
                  onClick={() => {
                    setMinted(false);
                    setMintReceipt(null);
                  }}
                  className="btn-premium w-full max-w-xs py-5"
                >
                  <span className="tracking-widest uppercase text-xs font-bold">Return</span>
                </button>
                {mintReceipt?.ok && mintReceipt.explorerUrl ? (
                  <a
                    href={mintReceipt.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] tracking-[0.3em] hover:opacity-100 opacity-40 uppercase transition-opacity"
                  >
                    View on Stellar Expert
                  </a>
                ) : null}
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

      <footer className="relative z-10 border-t border-white/5 bg-[#050505]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Links — use Link for client-side nav to avoid wallet intercept in Mini App */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {[
              { label: 'About', href: '/about' },
              { label: 'Leaderboard', href: '/leaderboard' },
              { label: 'Developer', href: '/developer' },
              { label: 'Terms', href: '/terms' },
              { label: 'Privacy', href: '/privacy' },
            ].map((link, i, arr) => (
              <span key={link.label} className="flex items-center gap-6">
                <Link
                  href={link.href}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[9px] tracking-[0.3em] uppercase text-white/40 hover:text-white transition-colors font-bold"
                >
                  {link.label}
                </Link>
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
