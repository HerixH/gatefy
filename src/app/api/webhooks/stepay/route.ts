import { NextResponse } from 'next/server';
import { getEventById } from '@/lib/events';
import {
    isPaymentTxHashUsed,
    isRegistered,
    isRegisteredByEmail,
    registerForEvent,
    registerForEventWithEmail,
} from '@/lib/registrations';
import { sendRegistrationConfirmationEmail } from '@/lib/email';
import { stellarExplorerTxUrl } from '@/lib/attendance-mint';
import {
    stepayConfigured,
    stepayWebhookSecret,
    verifyStepayWebhook,
    type StepayWebhookEvent,
} from '@/lib/stepay';

export const dynamic = 'force-dynamic';

function paymentExplorerUrl(txHash: string): string | null {
    if (!txHash || txHash.startsWith('stepay:')) return null;
    return stellarExplorerTxUrl(txHash);
}

/**
 * Stepay checkout.paid webhook.
 * Registers the attendee, emails a payment receipt (Stepay tx is the on-chain receipt).
 * Attendance POAP still mints at check-in / mint CTA.
 * Docs: https://stepay.pro/developers
 */
export async function POST(request: Request) {
    if (!stepayConfigured()) {
        return NextResponse.json({ error: 'Stepay not configured' }, { status: 503 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get('stepay-signature') || request.headers.get('Stepay-Signature');

    if (!stepayWebhookSecret()) {
        console.error('[stepay webhook] STEPAY_WEBHOOK_SECRET missing');
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 });
    }

    if (!verifyStepayWebhook(rawBody, signature)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let event: StepayWebhookEvent;
    try {
        event = JSON.parse(rawBody) as StepayWebhookEvent;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (event.event !== 'checkout.paid') {
        return NextResponse.json({ ok: true, ignored: true });
    }

    const meta = (event.metadata && typeof event.metadata === 'object' ? event.metadata : {}) as Record<
        string,
        unknown
    >;
    const eventId = typeof meta.eventId === 'string' ? meta.eventId.trim() : '';
    const email = typeof meta.email === 'string' ? meta.email.trim().toLowerCase() : '';
    const name = typeof meta.name === 'string' ? meta.name.trim() : '';
    const wallet = typeof meta.wallet === 'string' && meta.wallet.trim() ? meta.wallet.trim() : '';
    const txHash = typeof event.txHash === 'string' ? event.txHash.trim() : '';
    const checkoutId = typeof event.checkoutId === 'string' ? event.checkoutId.trim() : '';

    if (!eventId || !email) {
        console.error('[stepay webhook] missing eventId/email in metadata', meta);
        return NextResponse.json({ error: 'Missing registration metadata' }, { status: 400 });
    }

    const ev = await getEventById(eventId);
    if (!ev) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const paymentTx = txHash || `stepay:${checkoutId || event.referenceId || Date.now()}`;
    const explorer = paymentExplorerUrl(paymentTx);
    const price = Number(ev.ticketPriceUsdc);

    if (txHash && (await isPaymentTxHashUsed(txHash))) {
        return NextResponse.json({ ok: true, already: true });
    }

    const payment = {
        txHash: paymentTx,
        rail: 'stepay' as const,
        stepayCheckoutId: checkoutId || undefined,
    };

    let newlyRegistered = false;
    try {
        const emailMode = ev.isBlockchain === false;
        if (emailMode || !wallet) {
            if (!(await isRegisteredByEmail(ev.id, email))) {
                newlyRegistered = await registerForEventWithEmail(ev.id, email, name || undefined, payment);
            }
        } else if (!(await isRegistered(ev.id, wallet)) && !(await isRegisteredByEmail(ev.id, email))) {
            newlyRegistered = await registerForEvent(
                ev.id,
                wallet,
                { email, name: name || undefined },
                payment
            );
        }

        // Payment receipt email (Stepay USDC tx = on-chain payment receipt).
        const mailed = await sendRegistrationConfirmationEmail({
            to: email,
            event: ev,
            attendeeName: name || null,
            ticketPriceUsdc: Number.isFinite(price) && price > 0 ? price : undefined,
            paymentLabel: 'Stepay (USDC on Stellar)',
            paymentTxHash: paymentTx.startsWith('stepay:') ? null : paymentTx,
            paymentExplorerUrl: explorer,
        });

        if (!mailed.ok && !mailed.skipped) {
            console.error('[stepay webhook] receipt email failed:', mailed.error);
        }

        return NextResponse.json({
            ok: true,
            registered: true,
            newlyRegistered,
            receiptEmailed: mailed.ok || !!mailed.skipped,
            paymentTx: paymentTx.startsWith('stepay:') ? null : paymentTx,
            paymentExplorerUrl: explorer,
        });
    } catch (e) {
        console.error('[stepay webhook] register failed:', e);
        const msg = e instanceof Error ? e.message : 'Registration failed';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
