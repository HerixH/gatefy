import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE_NAME = 'gatefy_admin';

/** Signing key: prefer dedicated secret; fall back to dashboard password for single-env setups. */
function signingKey(): string {
    return (
        process.env.ADMIN_SESSION_SECRET?.trim() ||
        process.env.ADMIN_DASHBOARD_PASSWORD?.trim() ||
        ''
    );
}

export function getExpectedAdminCookieValue(): string {
    const key = signingKey();
    if (!key) return '';
    return createHmac('sha256', key).update('gatefy-admin-v1').digest('hex');
}

export async function verifyAdminCookieFromStore(): Promise<boolean> {
    const expected = getExpectedAdminCookieValue();
    if (!expected) return false;
    const store = await cookies();
    const val = store.get(ADMIN_COOKIE_NAME)?.value;
    if (!val || val.length !== expected.length) return false;
    try {
        return timingSafeEqual(Buffer.from(val, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
        return false;
    }
}

export function adminPasswordConfigured(): boolean {
    return !!process.env.ADMIN_DASHBOARD_PASSWORD?.trim();
}

export function verifyDashboardPassword(password: string): boolean {
    const expected = process.env.ADMIN_DASHBOARD_PASSWORD?.trim();
    if (!expected) return false;
    return password === expected;
}
