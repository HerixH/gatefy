import { NextResponse } from 'next/server';
import { getEventById } from '@/lib/events';
import { eventAcceptsStepay } from '@/lib/event-payment';
import { getRegistrationForEvent, isRegistered, isRegisteredByEmail } from '@/lib/registrations';
import { appPublicUrl, createStepayCheckout, stepayConfigured } from '@/lib/stepay';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ticketPrice(ev: { ticketPriceUsdc?: number }): number {
    const n = Number(ev.ticketPriceUsdc);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function POST(request: Request) {
    if (!stepayConfigured()) {
        return NextResponse.json(
            { error: 'Pay with Stepay is not configured. Set STEPAY_API_KEY on the server.' },
            { status: 503 }
        );
    }

    let body: {
        eventId?: string;
        email?: string;
        name?: string;
        wallet?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const wallet = typeof body.wallet === 'string' ? body.wallet.trim() : '';

    if (!eventId) return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    if (!email || !EMAIL_RE.test(email)) {
        return NextResponse.json({ error: 'A valid email is required for Stepay checkout.' }, { status: 400 });
    }
    if (!name) {
        return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    }

    const ev = await getEventById(eventId);
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    if (ev.cancelledAt) {
        return NextResponse.json({ error: 'This event has been cancelled.' }, { status: 400 });
    }
    if (!eventAcceptsStepay(ev)) {
        return NextResponse.json(
            { error: 'This event is not accepting Stepay payments.' },
            { status: 400 }
        );
    }

    const price = ticketPrice(ev);
    if (price <= 0) {
        return NextResponse.json({ error: 'This event is free — register without Stepay.' }, { status: 400 });
    }

    if (wallet && (await isRegistered(ev.id, wallet))) {
        const row = await getRegistrationForEvent(ev.id, { wallet });
        return NextResponse.json(
            {
                error: 'Already registered',
                alreadyRegistered: true,
                registered: true,
                email: row?.email ?? email,
                name: row?.name ?? name,
                wallet: row?.wallet ?? wallet,
            },
            { status: 409 }
        );
    }
    if (await isRegisteredByEmail(ev.id, email)) {
        const row = await getRegistrationForEvent(ev.id, { email });
        return NextResponse.json(
            {
                error: 'Already registered',
                alreadyRegistered: true,
                registered: true,
                email: row?.email ?? email,
                name: row?.name ?? name,
                wallet: row?.wallet ?? wallet ?? null,
            },
            { status: 409 }
        );
    }

    const base = appPublicUrl();
    const successUrl = `${base}/?event=${encodeURIComponent(ev.id)}&stepay=paid&email=${encodeURIComponent(email)}`;
    const cancelUrl = `${base}/?event=${encodeURIComponent(ev.id)}&stepay=cancel&email=${encodeURIComponent(email)}`;
    const webhookUrl = `${base}/api/webhooks/stepay`;

    const reference = `gatefy_${ev.id.slice(0, 24)}_${email.replace(/[^a-z0-9]/g, '').slice(0, 32)}`;

    const created = await createStepayCheckout({
        amount: price,
        label: `${ev.name} — ticket`,
        description: `Gate Protocol ticket for ${ev.name}`,
        reference,
        metadata: {
            eventId: ev.id,
            email,
            name,
            wallet: wallet || null,
            isBlockchain: ev.isBlockchain !== false,
            source: 'gatefy',
        },
        successUrl,
        cancelUrl,
        webhookUrl,
    });

    if (!created.ok) {
        return NextResponse.json({ error: created.error }, { status: 502 });
    }

    return NextResponse.json({
        ok: true,
        checkoutId: created.checkout.id,
        checkoutUrl: created.checkout.checkout_url,
        embedUrl: created.checkout.embed_url,
        amount: created.checkout.amount,
        asset: created.checkout.asset,
    });
}
