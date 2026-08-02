import { NextResponse } from 'next/server';
import {
    registerForEvent,
    registerForEventWithEmail,
    isRegistered,
    isRegisteredByEmail,
    getRegistrationForEvent,
    countRegistrationsForEvent,
    isPaymentTxHashUsed,
    isMobileMoneyRefUsed,
} from '@/lib/registrations';
import { getEventById } from '@/lib/events';
import {
    eventAcceptsMobileMoney,
    eventAcceptsStepay,
    eventAcceptsStellar,
    eventAcceptsUsdc,
    type TicketPaymentFields,
} from '@/lib/event-payment';
import { sendRegistrationEmailsAfterSignup } from '@/lib/email';
import { verifyUsdcTicketPayment } from '@/lib/usdc-payment';
import {
    looksLikeBaseTxHash,
    looksLikeStellarTxHash,
    verifyStellarUsdcPayment,
} from '@/lib/stellar-payment';
import { stellarExplorerTxUrl } from '@/lib/attendance-mint';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TREASURY = (process.env.TREASURY_WALLET || process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '').trim();

function ticketPrice(ev: { ticketPriceUsdc?: number } | null | undefined): number {
    if (!ev?.ticketPriceUsdc) return 0;
    const n = Number(ev.ticketPriceUsdc);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

async function alreadyRegisteredResponse(
    eventId: string,
    lookup: { email?: string; wallet?: string }
) {
    const row = await getRegistrationForEvent(eventId, lookup);
    return NextResponse.json(
        {
            error: 'Already registered',
            alreadyRegistered: true,
            registered: true,
            email: row?.email ?? lookup.email?.trim().toLowerCase() ?? null,
            name: row?.name ?? null,
            wallet: row?.wallet ?? lookup.wallet?.trim() ?? null,
            paymentStatus: row?.paymentStatus ?? null,
        },
        { status: 409 }
    );
}

function paymentExplorerForRail(
    rail: 'base' | 'stellar' | 'stepay' | undefined,
    txHash: string | undefined
): string | null {
    if (!txHash || txHash.startsWith('0xDEV') || txHash.startsWith('stepay:')) return null;
    if (rail === 'base' || txHash.startsWith('0x')) {
        const mainnet =
            (process.env.NEXT_PUBLIC_BASE_CHAIN || process.env.BASE_CHAIN || 'baseSepolia')
                .trim()
                .toLowerCase() === 'base';
        return mainnet ? `https://basescan.org/tx/${txHash}` : `https://sepolia.basescan.org/tx/${txHash}`;
    }
    return stellarExplorerTxUrl(txHash);
}

async function resolvePaidTicketOpts(
    ev: Pick<
        TicketPaymentFields,
        'ticketAcceptUsdc' | 'ticketAcceptMobileMoney' | 'ticketAcceptStellar' | 'ticketAcceptStepay'
    >,
    price: number,
    body: { paymentTxHash?: string; mobileMoneyReference?: string; paymentRail?: string }
): Promise<
    | {
          ok: true;
          payment?: { txHash?: string; mobileRef?: string; rail?: 'base' | 'stellar' | 'stepay' };
          paymentLabel?: string;
          paymentVerified?: boolean;
      }
    | { ok: false; error: string; status: number }
> {
    if (price <= 0) return { ok: true, payment: undefined };
    const txHash = typeof body.paymentTxHash === 'string' ? body.paymentTxHash.trim() : '';
    const mobileRef = typeof body.mobileMoneyReference === 'string' ? body.mobileMoneyReference.trim() : '';
    const railHint = typeof body.paymentRail === 'string' ? body.paymentRail.trim().toLowerCase() : '';

    const allowed: string[] = [];
    if (eventAcceptsUsdc(ev)) allowed.push('crypto on Base (0x… tx after wallet pay)');
    if (eventAcceptsStellar(ev))
        allowed.push('crypto on Stellar (wallet pay or 64-char tx hash)');
    if (eventAcceptsStepay(ev)) allowed.push('Pay with Stepay');
    if (eventAcceptsMobileMoney(ev))
        allowed.push('mobile money (follow organizer instructions, then enter your payment reference)');

    if (txHash) {
        // Prefer explicit paymentRail; otherwise infer from hash shape (Base = 0x…, Stellar = 64 hex).
        const wantStellar =
            railHint === 'stellar' ||
            (railHint !== 'base' && !looksLikeBaseTxHash(txHash) && looksLikeStellarTxHash(txHash));
        const wantBase =
            railHint === 'base' ||
            (railHint !== 'stellar' && looksLikeBaseTxHash(txHash));

        if (wantStellar && !wantBase) {
            if (!eventAcceptsStellar(ev)) {
                return {
                    ok: false,
                    error: 'This organizer is not accepting Stellar crypto for this ticket.',
                    status: 400,
                };
            }
            const v = await verifyStellarUsdcPayment(txHash, price);
            if (!v.ok) return { ok: false, error: v.error || 'Stellar payment verification failed', status: 400 };
            return {
                ok: true,
                payment: { txHash, rail: 'stellar' },
                paymentLabel: 'crypto on Stellar',
                paymentVerified: true,
            };
        }

        if (!eventAcceptsUsdc(ev)) {
            return {
                ok: false,
                error: 'This organizer is not accepting Base crypto for this ticket.',
                status: 400,
            };
        }
        const v = await verifyUsdcTicketPayment(txHash, price, TREASURY);
        if (!v.ok) return { ok: false, error: v.error || 'Payment verification failed', status: 400 };
        return {
            ok: true,
            payment: { txHash, rail: 'base' },
            paymentLabel: 'crypto on Base',
            paymentVerified: true,
        };
    }
    if (mobileRef.length >= 4) {
        if (!eventAcceptsMobileMoney(ev)) {
            return {
                ok: false,
                error: 'This organizer is not accepting mobile-money references for this ticket.',
                status: 400,
            };
        }
        return {
            ok: true,
            payment: { mobileRef },
            paymentLabel: 'mobile money (awaiting host confirmation)',
            paymentVerified: false,
        };
    }
    return {
        ok: false,
        error:
            allowed.length === 0
                ? 'This ticket is misconfigured — contact the organizer.'
                : `This event requires payment (ticket ${price}): use ${allowed.join(' or ')}.`,
        status: 400,
    };
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { eventId, wallet, email, name } = body;

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
        }

        const nameStr = typeof name === 'string' ? name.trim() : '';
        const emailStr = typeof email === 'string' ? email.trim() : '';

        const ev = await getEventById(String(eventId).trim());
        if (!ev) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }
        if (ev.cancelledAt) {
            return NextResponse.json({ error: 'This event has been cancelled.' }, { status: 400 });
        }

        const price = ticketPrice(ev);
        const paymentDefaults = {
            ticketAcceptUsdc: true,
            ticketAcceptMobileMoney: true,
            ticketAcceptStellar: false,
        };

        const max = ev.maxAttendees != null && ev.maxAttendees > 0 ? ev.maxAttendees : null;
        if (max != null) {
            const count = await countRegistrationsForEvent(ev.id);
            if (count >= max) {
                return NextResponse.json({ error: 'This event is sold out.' }, { status: 400 });
            }
        }

        const walletSignup = ev.isBlockchain !== false;

        // Blockchain (wallet) signup — collect email + first name / org name (must run before email-only branch)
        if (wallet) {
            if (!walletSignup) {
                return NextResponse.json(
                    { error: 'This event uses email signup. Register with your email instead of a wallet.' },
                    { status: 400 }
                );
            }
            if (!nameStr) {
                return NextResponse.json(
                    { error: 'First name or organization name is required' },
                    { status: 400 }
                );
            }
            if (!emailStr) {
                return NextResponse.json({ error: 'Email is required' }, { status: 400 });
            }
            if (!EMAIL_RE.test(emailStr)) {
                return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
            }
            const cleanWallet = String(wallet).trim();
            if (await isRegistered(eventId, cleanWallet)) {
                return alreadyRegisteredResponse(eventId, { wallet: cleanWallet });
            }
            if (await isRegisteredByEmail(eventId, emailStr)) {
                // Same person or same email — open their existing ticket instead of blocking.
                return alreadyRegisteredResponse(eventId, { email: emailStr });
            }

            const paid = await resolvePaidTicketOpts(ev ?? paymentDefaults, price, body);
            if (!paid.ok) return NextResponse.json({ error: paid.error }, { status: paid.status });
            if (paid.payment?.txHash && (await isPaymentTxHashUsed(paid.payment.txHash))) {
                return NextResponse.json(
                    { error: 'This payment transaction was already used for a registration.' },
                    { status: 400 }
                );
            }
            if (paid.payment?.mobileRef && (await isMobileMoneyRefUsed(ev.id, paid.payment.mobileRef))) {
                return NextResponse.json(
                    { error: 'This mobile-money reference was already used for this event.' },
                    { status: 400 }
                );
            }

            const success = await registerForEvent(
                eventId,
                cleanWallet,
                {
                    email: emailStr,
                    name: nameStr,
                },
                paid.payment
            );
            if (success) {
                let emailSent = false;
                let emailSkipped = false;
                let receiptSent: boolean | undefined;
                let confirmationSent: boolean | undefined;
                try {
                    if (ev) {
                        const mail = await sendRegistrationEmailsAfterSignup({
                            to: emailStr.toLowerCase(),
                            event: ev,
                            attendeeName: nameStr,
                            ticketPriceUsdc: price > 0 ? price : undefined,
                            paymentLabel: paid.paymentLabel,
                            paymentTxHash: paid.payment?.txHash,
                            paymentExplorerUrl: paymentExplorerForRail(
                                paid.payment?.rail,
                                paid.payment?.txHash
                            ),
                            paymentReference: paid.payment?.mobileRef,
                            paymentVerified: paid.paymentVerified === true,
                        });
                        emailSent = mail.emailSent;
                        emailSkipped = mail.emailSkipped;
                        receiptSent = mail.receiptSent;
                        confirmationSent = mail.confirmationSent;
                    }
                } catch (mailErr) {
                    console.error('Registration emails failed:', mailErr);
                }
                return NextResponse.json({
                    success: true,
                    registered: true,
                    paymentVerified: paid.paymentVerified === true,
                    emailSent,
                    emailSkipped,
                    receiptSent,
                    confirmationSent,
                });
            }
            return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
        }

        // Normal (email) signup for non-blockchain events
        if (emailStr) {
            if (walletSignup) {
                return NextResponse.json(
                    {
                        error:
                            'This event requires wallet signup. Connect a wallet to register (email-only signup is disabled).',
                    },
                    { status: 400 }
                );
            }
            if (!nameStr) {
                return NextResponse.json(
                    { error: 'First name or organization name is required' },
                    { status: 400 }
                );
            }
            if (!EMAIL_RE.test(emailStr)) {
                return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
            }
            if (await isRegisteredByEmail(eventId, emailStr)) {
                return alreadyRegisteredResponse(eventId, { email: emailStr });
            }

            const paid = await resolvePaidTicketOpts(ev ?? paymentDefaults, price, body);
            if (!paid.ok) return NextResponse.json({ error: paid.error }, { status: paid.status });
            if (paid.payment?.txHash && (await isPaymentTxHashUsed(paid.payment.txHash))) {
                return NextResponse.json(
                    { error: 'This payment transaction was already used for a registration.' },
                    { status: 400 }
                );
            }
            if (paid.payment?.mobileRef && (await isMobileMoneyRefUsed(ev.id, paid.payment.mobileRef))) {
                return NextResponse.json(
                    { error: 'This mobile-money reference was already used for this event.' },
                    { status: 400 }
                );
            }

            const success = await registerForEventWithEmail(eventId, emailStr, nameStr, paid.payment);
            if (success) {
                let emailSent = false;
                let emailSkipped = false;
                let receiptSent: boolean | undefined;
                let confirmationSent: boolean | undefined;
                try {
                    if (ev) {
                        const mail = await sendRegistrationEmailsAfterSignup({
                            to: emailStr.toLowerCase(),
                            event: ev,
                            attendeeName: nameStr,
                            ticketPriceUsdc: price > 0 ? price : undefined,
                            paymentLabel: paid.paymentLabel,
                            paymentTxHash: paid.payment?.txHash,
                            paymentExplorerUrl: paymentExplorerForRail(
                                paid.payment?.rail,
                                paid.payment?.txHash
                            ),
                            paymentReference: paid.payment?.mobileRef,
                            paymentVerified: paid.paymentVerified === true,
                        });
                        emailSent = mail.emailSent;
                        emailSkipped = mail.emailSkipped;
                        receiptSent = mail.receiptSent;
                        confirmationSent = mail.confirmationSent;
                    }
                } catch (mailErr) {
                    console.error('Registration emails failed:', mailErr);
                }
                return NextResponse.json({
                    success: true,
                    registered: true,
                    paymentVerified: paid.paymentVerified === true,
                    emailSent,
                    emailSkipped,
                    receiptSent,
                    confirmationSent,
                });
            }
            return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
        }

        return NextResponse.json({ error: 'Wallet or email is required' }, { status: 400 });
    } catch (error) {
        console.error('Register POST error:', error);
        const dev = process.env.NODE_ENV === 'development';
        const message =
            dev && error instanceof Error ? error.message : 'Registration failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const wallet = searchParams.get('wallet');
    const email = searchParams.get('email');

    if (!eventId) {
        return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }

    if (email) {
        const row = await getRegistrationForEvent(eventId, { email });
        return NextResponse.json(
            {
                registered: !!row,
                email: row?.email ?? null,
                name: row?.name ?? null,
                wallet: row?.wallet ?? null,
                paymentStatus: row?.paymentStatus ?? null,
                paymentTxHash: row?.paymentTxHash ?? null,
                paymentReference: row?.paymentReference ?? null,
            },
            { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
        );
    }

    if (!wallet) {
        return NextResponse.json({ error: 'Missing wallet or email' }, { status: 400 });
    }

    const row = await getRegistrationForEvent(eventId, { wallet });
    return NextResponse.json(
        {
            registered: !!row,
            email: row?.email ?? null,
            name: row?.name ?? null,
            paymentStatus: row?.paymentStatus ?? null,
            paymentTxHash: row?.paymentTxHash ?? null,
            paymentReference: row?.paymentReference ?? null,
            wallet: row?.wallet ?? null,
        },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
}
