import type { Event } from './events';

const RESEND_URL = 'https://api.resend.com/emails';

function appOrigin(): string {
    return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function formatEventWhen(ev: Event): string {
    try {
        return new Date(ev.date).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    } catch {
        return ev.date;
    }
}

/** Sends via Resend when RESEND_API_KEY is set; otherwise logs and no-ops. */
export async function sendRegistrationConfirmationEmail(opts: {
    to: string;
    event: Event;
    attendeeName?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() || 'Gatefy <onboarding@resend.dev>';

    const { to, event, attendeeName } = opts;
    const origin = appOrigin();
    const link = `${origin}/?event=${encodeURIComponent(event.id)}`;

    const subject = `You're registered: ${event.name}`;
    const text = [
        `Hi${attendeeName ? ` ${attendeeName}` : ''},`,
        '',
        `You're registered for "${event.name}".`,
        '',
        `When: ${formatEventWhen(event)}`,
        event.location ? `Where: ${event.location}` : '',
        '',
        `Verification / check-in code: ${event.verificationCode}`,
        '(Show this at the door or keep it for your records.)',
        '',
        `Event link: ${link}`,
        '',
        '— Gatefy',
    ]
        .filter(Boolean)
        .join('\n');

    const html = `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <p>Hi${attendeeName ? ` <strong>${escapeHtml(attendeeName)}</strong>` : ''},</p>
  <p>You're registered for <strong>${escapeHtml(event.name)}</strong>.</p>
  <table style="margin:16px 0;font-size:14px;">
    <tr><td style="color:#666;padding-right:12px;">When</td><td>${escapeHtml(formatEventWhen(event))}</td></tr>
    ${event.location ? `<tr><td style="color:#666;padding-right:12px;">Where</td><td>${escapeHtml(event.location)}</td></tr>` : ''}
  </table>
  <p style="font-size:18px;letter-spacing:0.1em;"><strong>Code:</strong> <code style="background:#f4f4f5;padding:4px 8px;border-radius:4px;">${escapeHtml(event.verificationCode)}</code></p>
  <p><a href="${escapeHtml(link)}" style="color:#2563eb;">Open event</a></p>
  <p style="color:#888;font-size:12px;">— Gatefy</p>
</body></html>`;

    if (!key) {
        console.warn('[email] RESEND_API_KEY not set; skipping registration email to', to);
        return { ok: false, skipped: true };
    }

    const res = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to: [to],
            subject,
            html,
            text,
        }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = typeof body?.message === 'string' ? body.message : JSON.stringify(body);
        console.error('[email] Resend error:', res.status, err);
        return { ok: false, error: err };
    }
    return { ok: true };
}

export async function sendOrganizerEventCreatedEmail(opts: {
    to: string;
    event: Event;
    displayName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() || 'Gatefy <onboarding@resend.dev>';
    const { to, event, displayName } = opts;
    const origin = appOrigin();
    const link = `${origin}/?event=${encodeURIComponent(event.id)}`;

    const subject = `Event created: ${event.name}`;
    const text = [
        `Hi ${displayName},`,
        '',
        `Your event "${event.name}" is live.`,
        '',
        `Verification code (for check-in): ${event.verificationCode}`,
        `Share link: ${link}`,
        '',
        '— Gatefy',
    ].join('\n');

    const html = `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <p>Hi <strong>${escapeHtml(displayName)}</strong>,</p>
  <p>Your event <strong>${escapeHtml(event.name)}</strong> is live.</p>
  <p style="font-size:18px;letter-spacing:0.1em;"><strong>Verification code:</strong> <code style="background:#f4f4f5;padding:4px 8px;border-radius:4px;">${escapeHtml(event.verificationCode)}</code></p>
  <p><a href="${escapeHtml(link)}" style="color:#2563eb;">Open event</a></p>
  <p style="color:#888;font-size:12px;">— Gatefy</p>
</body></html>`;

    if (!key) {
        console.warn('[email] RESEND_API_KEY not set; skipping organizer email to', to);
        return { ok: false, skipped: true };
    }

    const res = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = typeof body?.message === 'string' ? body.message : JSON.stringify(body);
        console.error('[email] Resend error:', res.status, err);
        return { ok: false, error: err };
    }
    return { ok: true };
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
