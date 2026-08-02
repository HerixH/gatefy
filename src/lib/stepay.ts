import { createHmac, timingSafeEqual } from 'crypto';

const STEPAY_BASE = (process.env.STEPAY_API_BASE || 'https://stepay.pro').replace(/\/$/, '');

export function stepayConfigured(): boolean {
    return Boolean(process.env.STEPAY_API_KEY?.trim());
}

export function stepayWebhookSecret(): string {
    return (process.env.STEPAY_WEBHOOK_SECRET || '').trim();
}

export type StepayCheckout = {
    id: string;
    checkout_token: string;
    amount: number;
    asset: string;
    label: string;
    status: string;
    expires_at: string;
    checkout_url: string;
    embed_url: string;
};

export type StepayCheckoutCreateInput = {
    amount: number;
    label: string;
    reference: string;
    description?: string;
    metadata?: Record<string, unknown>;
    successUrl: string;
    cancelUrl?: string;
    webhookUrl: string;
    expiresInMinutes?: number;
};

/** Create a Stepay checkout session (server-side only). Docs: https://stepay.pro/developers */
export async function createStepayCheckout(
    input: StepayCheckoutCreateInput
): Promise<{ ok: true; checkout: StepayCheckout } | { ok: false; error: string }> {
    const key = process.env.STEPAY_API_KEY?.trim();
    if (!key) return { ok: false, error: 'Stepay is not configured (STEPAY_API_KEY).' };

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 1) {
        return { ok: false, error: 'Stepay checkout amount must be at least 1 USDC.' };
    }

    try {
        const res = await fetch(`${STEPAY_BASE}/api/v1/checkouts`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount,
                asset: 'usdc',
                label: input.label.slice(0, 200),
                description: input.description?.slice(0, 500),
                reference: input.reference.slice(0, 120),
                metadata: input.metadata ?? {},
                success_url: input.successUrl,
                cancel_url: input.cancelUrl,
                webhook_url: input.webhookUrl,
                expires_in_minutes: input.expiresInMinutes ?? 1440,
            }),
        });
        const data = (await res.json().catch(() => ({}))) as StepayCheckout & { error?: string };
        if (!res.ok) {
            return { ok: false, error: data.error || `Stepay checkout failed (${res.status})` };
        }
        if (!data.checkout_url || !data.id) {
            return { ok: false, error: 'Stepay returned an incomplete checkout.' };
        }
        return { ok: true, checkout: data };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Stepay request failed' };
    }
}

export type StepayWebhookEvent = {
    event: string;
    checkoutId?: string;
    checkoutToken?: string;
    referenceId?: string;
    amount?: number;
    asset?: string;
    txHash?: string;
    payerId?: string | null;
    paymentMethod?: string;
    paidAt?: string;
    metadata?: Record<string, unknown>;
};

/** Verify Stepay-Signature: t=UNIX,v1=HEX_HMAC over `${t}.${rawBody}`. */
export function verifyStepayWebhook(
    rawBody: string,
    signatureHeader: string | null | undefined,
    secret = stepayWebhookSecret()
): boolean {
    if (!secret || !signatureHeader || !rawBody) return false;
    try {
        const parts = Object.fromEntries(
            signatureHeader.split(',').map((p) => {
                const [k, ...rest] = p.trim().split('=');
                return [k, rest.join('=')];
            })
        ) as Record<string, string>;
        const timestamp = parts.t;
        const expected = parts.v1;
        if (!timestamp || !expected) return false;

        // Reject stale signatures (>15 min)
        const ts = Number(timestamp);
        if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 15 * 60) return false;

        const signed = `${timestamp}.${rawBody}`;
        const actual = createHmac('sha256', secret).update(signed).digest('hex');
        const a = Buffer.from(actual);
        const b = Buffer.from(expected);
        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

export function appPublicUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`.replace(/\/$/, '');
    return 'http://localhost:3000';
}
