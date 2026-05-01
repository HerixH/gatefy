import { NextResponse } from 'next/server';
import { getAttendance } from '@/lib/codes';
import { verifyAdminCookieFromStore } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    if (!(await verifyAdminCookieFromStore())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const records = await getAttendance();
        return NextResponse.json(records, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
    }
}
