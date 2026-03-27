import { NextResponse } from 'next/server';
import { getEvents, createEvent } from '@/lib/events';
import { getRegistrations } from '@/lib/registrations';
import { makeEmailOrganizerId } from '@/lib/event-organizer';
import { sendOrganizerEventCreatedEmail } from '@/lib/email';

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
        } = body;

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
