import { NextResponse } from 'next/server';
import {
    getRegistrations,
    getRegistrationById,
    updateRegistrationPaymentByHost,
    type HostPaymentAction,
} from '@/lib/registrations';
import {
    findEventByIdCaseInsensitive,
    requireOrganizerListAccess,
    requireOrganizerSessionForEvent,
} from '@/lib/organizer-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get('eventId');
        const organizerWallet = searchParams.get('organizerWallet');
        const organizerEmail = searchParams.get('organizerEmail');

        if (!eventId) {
            return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
        }

        const event = await findEventByIdCaseInsensitive(eventId);
        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        const auth = await requireOrganizerListAccess(event.organizer, {
            organizerWallet,
            organizerEmail,
        });
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const all = await getRegistrations();
        const eventRegistrations = all.filter(
            (r) => r.eventId.toLowerCase() === eventId.trim().toLowerCase()
        );

        return NextResponse.json(eventRegistrations, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 });
    }
}

const ACTIONS = new Set<HostPaymentAction>([
    'confirm_mobile',
    'reject_mobile',
    'mark_paid_mobile',
    'mark_unpaid',
]);

/** Host payment admin: confirm/reject mobile money, or clear payment. */
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
        const organizerWallet = typeof body.organizerWallet === 'string' ? body.organizerWallet.trim() : '';
        const organizerEmail = typeof body.organizerEmail === 'string' ? body.organizerEmail.trim() : '';
        const registrationId = typeof body.registrationId === 'number' ? body.registrationId : Number(body.registrationId);
        const actionRaw = typeof body.action === 'string' ? body.action.trim() : '';

        if (!eventId) {
            return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
        }
        if (!Number.isFinite(registrationId) || registrationId <= 0) {
            return NextResponse.json({ error: 'registrationId is required' }, { status: 400 });
        }
        if (!ACTIONS.has(actionRaw as HostPaymentAction)) {
            return NextResponse.json(
                {
                    error: 'action must be confirm_mobile, reject_mobile, mark_paid_mobile, or mark_unpaid',
                },
                { status: 400 }
            );
        }
        const action = actionRaw as HostPaymentAction;

        const event = await findEventByIdCaseInsensitive(eventId);
        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        const auth = await requireOrganizerSessionForEvent(event.organizer, {
            organizerWallet,
            organizerEmail,
        });
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const existing = await getRegistrationById(registrationId);
        if (!existing) {
            return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
        }
        if (existing.eventId.toLowerCase() !== event.id.toLowerCase()) {
            return NextResponse.json(
                { error: 'Registration does not belong to this event.' },
                { status: 400 }
            );
        }

        const updated = await updateRegistrationPaymentByHost(registrationId, action);
        if (!updated) {
            return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
        }

        return NextResponse.json(updated, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update registration';
        console.error('PATCH /api/events/registrations error:', error);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
