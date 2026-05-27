import { NextResponse } from 'next/server';
import { getEvents, createEvent, updateEventById, type OrganizerMutableEventPatch } from '@/lib/events';
import { validateEventPaymentConfig } from '@/lib/event-payment';
import { getRegistrations } from '@/lib/registrations';
import { makeEmailOrganizerId, isEmailOrganizerId } from '@/lib/event-organizer';
import { sendOrganizerEventCreatedEmail } from '@/lib/email';
import { findEventByIdCaseInsensitive, serverOrganizerMatchesEvent } from '@/lib/organizer-access';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const events = await getEvents();
        let registrations: Awaited<ReturnType<typeof getRegistrations>> = [];
        try {
            registrations = await getRegistrations();
        } catch (regErr) {
            console.error('Failed to fetch registrations (using empty):', regErr);
        }
        const sorted = events
            .map((ev) => {
                const registrationCount = registrations.filter(
                    (r) => r.eventId?.toLowerCase() === ev.id.toLowerCase()
                ).length;
                return { ...ev, registrationCount };
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return NextResponse.json(sorted, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        console.error('GET /api/events error:', error);
        const msg = error instanceof Error ? error.message : 'Failed to fetch events';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            name,
            description,
            date,
            endDate,
            location,
            maxAttendees,
            organizer,
            organizerEmail,
            organizerDisplayName,
            isVip,
            vipTokenAddress,
            vipMinBalance,
            bannerUrl,
            isBlockchain,
            ticketPriceUsdc,
            mobileMoneyInstructions,
            ticketAcceptUsdc,
            ticketAcceptMobileMoney,
        } = body;

        let ticketPrice: number | undefined;
        if (ticketPriceUsdc != null && ticketPriceUsdc !== '') {
            const n = typeof ticketPriceUsdc === 'number' ? ticketPriceUsdc : parseFloat(String(ticketPriceUsdc));
            if (Number.isFinite(n) && n > 0) ticketPrice = n;
        }
        const acceptUsdc = ticketAcceptUsdc !== false;
        const acceptMobile = ticketAcceptMobileMoney !== false;
        const mmInstr =
            typeof mobileMoneyInstructions === 'string' && mobileMoneyInstructions.trim()
                ? mobileMoneyInstructions.trim()
                : undefined;
        if (!name || !date) {
            return NextResponse.json({ error: 'Name and date are required' }, { status: 400 });
        }

        const wallet = typeof organizer === 'string' && ADDR.test(organizer.trim()) ? organizer.trim() : '';
        const emailRaw = typeof organizerEmail === 'string' ? organizerEmail.trim() : '';
        const displayName =
            typeof organizerDisplayName === 'string' ? organizerDisplayName.trim() : '';

        let organizerField: string;
        if (wallet) {
            organizerField = wallet;
        } else if (emailRaw && EMAIL.test(emailRaw)) {
            organizerField = makeEmailOrganizerId(emailRaw);
        } else {
            return NextResponse.json(
                { error: 'Connect a wallet or provide a valid organizer email and name / company.' },
                { status: 400 }
            );
        }

        if (!wallet && !displayName) {
            return NextResponse.json(
                { error: 'Your name or company name is required when creating without a wallet.' },
                { status: 400 }
            );
        }

        const blockchain = isBlockchain !== false;
        if (blockchain && !wallet) {
            return NextResponse.json(
                { error: 'Blockchain events require a connected wallet. Turn off blockchain mode for email-only events.' },
                { status: 400 }
            );
        }

        const paymentCheck = validateEventPaymentConfig({
            isBlockchain: blockchain,
            ticketPriceUsdc: ticketPrice,
            ticketAcceptUsdc: acceptUsdc,
            ticketAcceptMobileMoney: acceptMobile,
        });
        if (!paymentCheck.ok) {
            return NextResponse.json({ error: paymentCheck.error }, { status: 400 });
        }

        const event = await createEvent({
            name,
            description: description || '',
            date,
            endDate: endDate || undefined,
            location: location || '',
            maxAttendees: typeof maxAttendees === 'number' && maxAttendees > 0 ? maxAttendees : undefined,
            organizer: organizerField,
            organizerDisplayName: displayName || undefined,
            isVip: !!isVip,
            vipTokenAddress: vipTokenAddress || '',
            vipMinBalance: vipMinBalance || '',
            bannerUrl: bannerUrl || undefined,
            isBlockchain: blockchain,
            ticketPriceUsdc: ticketPrice,
            mobileMoneyInstructions: mmInstr,
            ticketAcceptUsdc: acceptUsdc,
            ticketAcceptMobileMoney: acceptMobile,
        });

        if (!wallet && emailRaw) {
            try {
                await sendOrganizerEventCreatedEmail({
                    to: emailRaw.toLowerCase(),
                    event,
                    displayName: displayName || 'Organizer',
                });
            } catch (mailErr) {
                console.error('Organizer confirmation email failed:', mailErr);
            }
        }

        return NextResponse.json(event, { status: 201 });
    } catch (error) {
        const raw =
            error instanceof Error
                ? error.message
                : typeof (error as { message?: string })?.message === 'string'
                  ? (error as { message: string }).message
                  : 'Failed to create event';
        const message =
            raw.toLowerCase().includes('fetch failed') || raw.toLowerCase().includes('econnrefused')
                ? 'Cannot reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL, your network, and that the Supabase project is not paused.'
                : raw;
        console.error('Create event error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/** Update an existing event — same auth model as attendee/registration organizer routes (wallet or session email). */
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
        const organizerWallet = typeof body.organizerWallet === 'string' ? body.organizerWallet.trim() : '';
        const organizerEmail = typeof body.organizerEmail === 'string' ? body.organizerEmail.trim() : '';

        if (!eventId) {
            return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
        }
        if (!organizerWallet && !organizerEmail) {
            return NextResponse.json(
                { error: 'organizerWallet or organizerEmail is required to update an event.' },
                { status: 403 }
            );
        }

        const event = await findEventByIdCaseInsensitive(eventId);
        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }
        if (
            !serverOrganizerMatchesEvent(event.organizer, {
                organizerWallet,
                organizerEmail,
            })
        ) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const patch: OrganizerMutableEventPatch = {};

        if ('name' in body && typeof body.name === 'string') patch.name = body.name.trim();
        if ('description' in body && typeof body.description === 'string') patch.description = body.description.trim();
        if ('date' in body && typeof body.date === 'string' && body.date.trim()) patch.date = body.date.trim();

        if ('endDate' in body) {
            if (body.endDate === null || body.endDate === '') patch.endDate = null;
            else if (typeof body.endDate === 'string') patch.endDate = body.endDate.trim();
        }

        if ('location' in body && typeof body.location === 'string') patch.location = body.location.trim();

        if ('maxAttendees' in body) {
            if (body.maxAttendees === null || body.maxAttendees === '')
                patch.maxAttendees = null;
            else if (typeof body.maxAttendees === 'number')
                patch.maxAttendees = Number.isFinite(body.maxAttendees) ? body.maxAttendees : null;
        }

        if ('isVip' in body && typeof body.isVip === 'boolean') patch.isVip = body.isVip;
        if ('vipTokenAddress' in body && typeof body.vipTokenAddress === 'string')
            patch.vipTokenAddress = body.vipTokenAddress.trim();
        if ('vipMinBalance' in body && typeof body.vipMinBalance === 'string')
            patch.vipMinBalance = body.vipMinBalance.trim();

        if ('bannerUrl' in body) {
            if (body.bannerUrl === null || body.bannerUrl === '') patch.bannerUrl = null;
            else if (typeof body.bannerUrl === 'string') patch.bannerUrl = body.bannerUrl.trim();
        }

        if ('organizerDisplayName' in body && typeof body.organizerDisplayName === 'string') {
            patch.organizerDisplayName = body.organizerDisplayName.trim();
        }

        if ('isBlockchain' in body && typeof body.isBlockchain === 'boolean') {
            if (body.isBlockchain && isEmailOrganizerId(event.organizer)) {
                return NextResponse.json(
                    {
                        error: 'Blockchain (wallet) registration requires a wallet-owned event. Email-only organizers cannot enable blockchain attendee mode.',
                    },
                    { status: 400 }
                );
            }
            patch.isBlockchain = body.isBlockchain;
        }

        if ('ticketPriceUsdc' in body) {
            if (body.ticketPriceUsdc === null || body.ticketPriceUsdc === '') patch.ticketPriceUsdc = null;
            else {
                const n = typeof body.ticketPriceUsdc === 'number' ? body.ticketPriceUsdc : parseFloat(String(body.ticketPriceUsdc));
                if (!Number.isFinite(n) || n <= 0) patch.ticketPriceUsdc = null;
                else patch.ticketPriceUsdc = n;
            }
        }

        if ('mobileMoneyInstructions' in body) {
            if (body.mobileMoneyInstructions === null || body.mobileMoneyInstructions === '')
                patch.mobileMoneyInstructions = null;
            else if (typeof body.mobileMoneyInstructions === 'string')
                patch.mobileMoneyInstructions = body.mobileMoneyInstructions.trim();
        }

        if ('ticketAcceptUsdc' in body && typeof body.ticketAcceptUsdc === 'boolean') {
            patch.ticketAcceptUsdc = body.ticketAcceptUsdc;
        }
        if ('ticketAcceptMobileMoney' in body && typeof body.ticketAcceptMobileMoney === 'boolean') {
            patch.ticketAcceptMobileMoney = body.ticketAcceptMobileMoney;
        }

        let mergedPrice = event.ticketPriceUsdc ?? 0;
        if (patch.ticketPriceUsdc !== undefined) {
            mergedPrice =
                patch.ticketPriceUsdc === null || patch.ticketPriceUsdc <= 0 ? 0 : patch.ticketPriceUsdc;
        }
        const mergedBlockchain = patch.isBlockchain !== undefined ? patch.isBlockchain : event.isBlockchain !== false;
        const mergedUsdc =
            patch.ticketAcceptUsdc !== undefined ? patch.ticketAcceptUsdc : event.ticketAcceptUsdc !== false;
        const mergedMob =
            patch.ticketAcceptMobileMoney !== undefined
                ? patch.ticketAcceptMobileMoney
                : event.ticketAcceptMobileMoney !== false;

        const paymentMerged = validateEventPaymentConfig({
            isBlockchain: mergedBlockchain,
            ticketPriceUsdc: mergedPrice > 0 ? mergedPrice : undefined,
            ticketAcceptUsdc: mergedUsdc,
            ticketAcceptMobileMoney: mergedMob,
        });
        if (!paymentMerged.ok) {
            return NextResponse.json({ error: paymentMerged.error }, { status: 400 });
        }

        const updated = await updateEventById(event.id, patch);
        if (!updated) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        return NextResponse.json(updated, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        const raw =
            error instanceof Error
                ? error.message
                : typeof (error as { message?: string })?.message === 'string'
                  ? (error as { message: string }).message
                  : 'Failed to update event';
        const message =
            raw.toLowerCase().includes('fetch failed') || raw.toLowerCase().includes('econnrefused')
                ? 'Cannot reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL and your network.'
                : raw;
        console.error('PATCH /api/events error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
