import { NextResponse } from 'next/server';
import { getRegistrations } from '@/lib/registrations';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const registrations = getRegistrations();
        return NextResponse.json(registrations, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 });
    }
}
