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
import {
    stepayConfigured,
    stepayWebhookSecret,
    verifyStepayWebhook,
    type StepayWebhookEvent,
} from '@/lib/stepay';

export const dynamic = 'force-dynamic';

/**
 * Stepay checkout.paid webhook.
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

    if (txHash && (await isPaymentTxHashUsed(txHash))) {
        return NextResponse.json({ ok: true, already: true });
    }

    const payment = {
        txHash: txHash || `stepay:${checkoutId || event.referenceId || Date.now()}`,
        rail: 'stepay' as const,
        stepayCheckoutId: checkoutId || undefined,
    };

    try {
        const emailMode = ev.isBlockchain === false;
        if (emailMode || !wallet) {
            if (await isRegisteredByEmail(ev.id, email)) {
                return NextResponse.json({ ok: true, already: true });
            }
            const ok = await registerForEventWithEmail(ev.id, email, name || undefined, payment);
            if (!ok) return NextResponse.json({ ok: true, already: true });
        } else {
            if (await isRegistered(ev.id, wallet)) {
                return NextResponse.json({ ok: true, already: true });
            }
            if (await isRegisteredByEmail(ev.id, email)) {
                return NextResponse.json({ ok: true, already: true });
            }
            const ok = await registerForEvent(ev.id, wallet, { email, name: name || undefined }, payment);
            if (!ok) return NextResponse.json({ ok: true, already: true });
        }

        const price = Number(ev.ticketPriceUsdc);
        void sendRegistrationConfirmationEmail({
            to: email,
            event: ev,
            attendeeName: name || null,
            ticketPriceUsdc: Number.isFinite(price) && price > 0 ? price : undefined,
            paymentLabel: 'Stepay (USDC)',
        }).catch((e) => console.error('[stepay webhook] email failed:', e));

        return NextResponse.json({ ok: true, registered: true });
    } catch (e) {
        console.error('[stepay webhook] register failed:', e);
        const msg = e instanceof Error ? e.message : 'Registration failed';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
