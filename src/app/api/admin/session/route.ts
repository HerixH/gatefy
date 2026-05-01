import { NextResponse } from 'next/server';
import {
    ADMIN_COOKIE_NAME,
    adminPasswordConfigured,
    getExpectedAdminCookieValue,
    verifyAdminCookieFromStore,
    verifyDashboardPassword,
} from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    const authenticated = await verifyAdminCookieFromStore();
    return NextResponse.json({
        authenticated,
        configured: adminPasswordConfigured(),
    });
}

export async function POST(request: Request) {
    if (!adminPasswordConfigured()) {
        return NextResponse.json(
            { error: 'Admin dashboard is not configured. Set ADMIN_DASHBOARD_PASSWORD in the server environment.' },
            { status: 503 }
        );
    }

    let body: { password?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const password = typeof body.password === 'string' ? body.password : '';
    if (!verifyDashboardPassword(password)) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = getExpectedAdminCookieValue();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/admin',
        maxAge: 60 * 60 * 24 * 7,
    });
    return res;
}

export async function DELETE() {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/admin',
        maxAge: 0,
    });
    return res;
}
