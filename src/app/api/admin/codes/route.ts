import { NextResponse } from 'next/server';
import { generateCode, getCodes } from '@/lib/codes';
import { verifyAdminCookieFromStore } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    if (!(await verifyAdminCookieFromStore())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const codes = await getCodes();
        return NextResponse.json(codes, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch codes' }, { status: 500 });
    }
}

export async function POST() {
    if (!(await verifyAdminCookieFromStore())) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const code = await generateCode();
        return NextResponse.json({ code });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
    }
}
