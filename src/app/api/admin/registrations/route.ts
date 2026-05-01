import { NextResponse } from 'next/server';
import { getRegistrations } from '@/lib/registrations';
import { verifyAdminCookieFromStore } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    if (!(await verifyAdminCookieFromStore())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const registrations = await getRegistrations();
        return NextResponse.json(registrations, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 });
    }
}
