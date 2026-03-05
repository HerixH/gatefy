import { NextResponse } from 'next/server';
import { registerForEvent, isRegistered } from '@/lib/registrations';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const { eventId, wallet } = await request.json();

        if (!eventId || !wallet) {
            return NextResponse.json({ error: 'Event ID and wallet are required' }, { status: 400 });
        }

        if (await isRegistered(eventId, wallet)) {
            return NextResponse.json({ error: 'Already registered' }, { status: 400 });
        }

        const success = await registerForEvent(eventId, wallet);
        if (success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
        }
    } catch (error) {
        return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const wallet = searchParams.get('wallet');

    if (!eventId || !wallet) {
        return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    return NextResponse.json({ registered: await isRegistered(eventId, wallet) }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
}
