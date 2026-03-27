import { NextResponse } from 'next/server';
import { getAttendance } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const eventId = searchParams.get('eventId');
        const wallet = searchParams.get('wallet');
        const email = searchParams.get('email');

        if (!eventId || (!wallet && !email)) {
            return NextResponse.json({ error: 'eventId and wallet or email are required' }, { status: 400 });
        }

        const records = await getAttendance();
        const id = eventId.trim().toLowerCase();

        const verified = records.some(r => {
            if (r.eventId == null || String(r.eventId).toLowerCase() !== id) return false;
            if (email) {
                return (r.email ?? '').toLowerCase() === email.trim().toLowerCase();
            }
            return r.wallet != null && r.wallet.toLowerCase() === wallet!.trim().toLowerCase();
        });

        return NextResponse.json({ verified }, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to check verification' }, { status: 500 });
    }
}
