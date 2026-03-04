import { NextResponse } from 'next/server';
import { getAttendance } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const records = getAttendance();
        return NextResponse.json(records, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
    }
}
