import { NextResponse } from 'next/server';
import { generateCode, getCodes } from '@/lib/codes';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const codes = getCodes();
        return NextResponse.json(codes, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch codes' }, { status: 500 });
    }
}

export async function POST() {
    try {
        const code = generateCode();
        return NextResponse.json({ code });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
    }
}
