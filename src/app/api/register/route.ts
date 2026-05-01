import { NextResponse } from 'next/server';
import {
    registerForEvent,
    registerForEventWithEmail,
    isRegistered,
    isRegisteredByEmail,
    getRegistrationForEvent,
} from '@/lib/registrations';
import { getEventById } from '@/lib/events';
import { sendRegistrationConfirmationEmail } from '@/lib/email';
import { verifyUsdcTicketPayment } from '@/lib/usdc-payment';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TREASURY = (process.env.TREASURY_WALLET || process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '').trim();

function ticketPrice(ev: { ticketPriceUsdc?: number } | null | undefined): number {
    if (!ev?.ticketPriceUsdc) return 0;
    const n = Number(ev.ticketPriceUsdc);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

async function resolvePaidTicketOpts(
    price: number,
    body: { paymentTxHash?: string; mobileMoneyReference?: string }
): Promise<
    | { ok: true; payment?: { txHash?: string; mobileRef?: string }; paymentLabel?: string }
    | { ok: false; error: string; status: number }
> {
    if (price <= 0) return { ok: true, payment: undefined };
    const txHash = typeof body.paymentTxHash === 'string' ? body.paymentTxHash.trim() : '';
    const mobileRef = typeof body.mobileMoneyReference === 'string' ? body.mobileMoneyReference.trim() : '';
    if (txHash) {
        const v = await verifyUsdcTicketPayment(txHash, price, TREASURY);
        if (!v.ok) return { ok: false, error: v.error || 'Payment verification failed', status: 400 };
        return { ok: true, payment: { txHash }, paymentLabel: 'USDC on Base' };
    }
    if (mobileRef.length >= 4) {
        return { ok: true, payment: { mobileRef }, paymentLabel: 'mobile money' };
    }
    return {
        ok: false,
        error:
            'This event requires a paid ticket: pay with USDC on Base and paste the transaction hash, or use mobile money per the organizer’s instructions and enter your payment reference.',
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
        const price = ticketPrice(ev);

        // Blockchain (wallet) signup — collect email + first name / org name (must run before email-only branch)
        if (wallet) {
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
                return NextResponse.json({ error: 'Already registered' }, { status: 400 });
            }
            if (await isRegisteredByEmail(eventId, emailStr)) {
                const existing = await getRegistrationForEvent(eventId, { email: emailStr });
                const ew = existing?.wallet?.toLowerCase();
                const cw = cleanWallet.toLowerCase();
                if (ew === cw) {
                    return NextResponse.json({ error: 'Already registered' }, { status: 400 });
                }
                return NextResponse.json(
                    { error: 'This email is already registered for this event' },
                    { status: 400 }
                );
            }

            const paid = await resolvePaidTicketOpts(price, body);
            if (!paid.ok) return NextResponse.json({ error: paid.error }, { status: paid.status });

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
                try {
                    if (ev) {
                        const r = await sendRegistrationConfirmationEmail({
                            to: emailStr.toLowerCase(),
                            event: ev,
                            attendeeName: nameStr,
                            ticketPriceUsdc: price > 0 ? price : undefined,
                            paymentLabel: paid.paymentLabel,
                        });
                        emailSent = r.ok;
                        emailSkipped = !!r.skipped;
                    }
                } catch (mailErr) {
                    console.error('Registration confirmation email failed:', mailErr);
                }
                return NextResponse.json({ success: true, emailSent, emailSkipped });
            }
            return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
        }

        // Normal (email) signup for non-blockchain events
        if (emailStr) {
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
                return NextResponse.json({ error: 'Already registered' }, { status: 400 });
            }

            const paid = await resolvePaidTicketOpts(price, body);
            if (!paid.ok) return NextResponse.json({ error: paid.error }, { status: paid.status });

            const success = await registerForEventWithEmail(eventId, emailStr, nameStr, paid.payment);
            if (success) {
                let emailSent = false;
                let emailSkipped = false;
                try {
                    if (ev) {
                        const r = await sendRegistrationConfirmationEmail({
                            to: emailStr.toLowerCase(),
                            event: ev,
                            attendeeName: nameStr,
                            ticketPriceUsdc: price > 0 ? price : undefined,
                            paymentLabel: paid.paymentLabel,
                        });
                        emailSent = r.ok;
                        emailSkipped = !!r.skipped;
                    }
                } catch (mailErr) {
                    console.error('Registration confirmation email failed:', mailErr);
                }
                return NextResponse.json({ success: true, emailSent, emailSkipped });
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
            wallet: row?.wallet ?? null,
        },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
}
