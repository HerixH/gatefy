import { NextResponse } from 'next/server';
import { getAttendance } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get('eventId');
        const wallet = searchParams.get('wallet');

        if (!eventId || !wallet) {
            return NextResponse.json({ error: 'eventId and wallet are required' }, { status: 400 });
        }

        const records = await getAttendance();
        const id = eventId.trim().toLowerCase();
        const w = wallet.trim().toLowerCase();

        const verified = records.some(
            r => r.eventId != null && String(r.eventId).toLowerCase() === id && r.wallet.toLowerCase() === w
        );

        return NextResponse.json({ verified }, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to check verification' }, { status: 500 });
    }
}
