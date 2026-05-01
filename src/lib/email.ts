import type { Event } from './events';
import QRCode from 'qrcode';

const RESEND_URL = 'https://api.resend.com/emails';

const DEFAULT_FROM = 'Gate Protocol <onboarding@resend.dev>';

/** Colors aligned with `globals.css` (dark UI). */
const C = {
    pageBg: '#020202',
    cardBg: '#0c0c0c',
    cardBorder: '#262626',
    text: '#f4f4f5',
    muted: '#a1a1aa',
    faint: '#71717a',
    accent: '#3b82f6',
    codeBg: '#18181b',
    white: '#ffffff',
    black: '#0a0a0a',
} as const;

function appOrigin(): string {
    return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function brandName(): string {
    return process.env.EMAIL_BRAND_NAME?.trim() || 'Gate Protocol';
}

/** Same payload as in-app organizer `QRCodeCanvas` — raw verification code for door scanners. */
async function qrPngDataUrlForEmail(code: string): Promise<string | null> {
    try {
        return await QRCode.toDataURL(code.trim(), {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 216,
            margin: 2,
            color: { dark: '#0a0a0a', light: '#ffffff' },
        });
    } catch (e) {
        console.warn('[email] QRCode.toDataURL failed', e);
        return null;
    }
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

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Inbox preview line (hidden in body; many clients pick this up). */
function preheaderHtml(text: string): string {
    const t = escapeHtml(text.slice(0, 140));
    return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${t}</div>`;
}

function bulletproofButtonHref(href: string, label: string): string {
    const h = escapeHtml(href);
    const l = escapeHtml(label);
    return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
  <tr>
    <td align="left">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${h.replace(/"/g, '&quot;')}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="12%" stroke="f" fillcolor="${C.white}">
        <w:anchorlock/>
        <center style="color:${C.black};font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;">${l}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${h}" target="_blank" rel="noopener noreferrer"
        style="background-color:${C.white};color:${C.black};display:inline-block;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;line-height:48px;text-align:center;text-decoration:none;padding:0 28px;border-radius:8px;">
        ${l}
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

function emailShell(opts: { preheader: string; innerHtml: string }): string {
    const { preheader, innerHtml } = opts;
    const bn = escapeHtml(brandName());
    const year = new Date().getFullYear();
    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${bn}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.pageBg};-webkit-text-size-adjust:100%;">
  ${preheaderHtml(preheader)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.pageBg};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
          <tr>
            <td style="padding:0 0 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;letter-spacing:0.02em;color:${C.text};">
              ${bn}
            </td>
          </tr>
          <tr>
            <td style="background-color:${C.cardBg};border:1px solid ${C.cardBorder};border-radius:16px;padding:36px 32px 40px;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 8px 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.6;color:${C.faint};text-align:center;">
              You’re receiving this because of activity on ${bn}.<br />
              © ${year} ${bn}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailRow(label: string, value: string): string {
    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
  <tr>
    <td style="width:88px;vertical-align:top;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:${C.muted};padding:2px 12px 0 0;">${escapeHtml(label)}</td>
    <td style="vertical-align:top;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5;color:${C.text};">${escapeHtml(value)}</td>
  </tr>
</table>`;
}

function verificationCodeBlock(code: string, qrDataUrl: string | null): string {
    const c = escapeHtml(code);
    const qrHtml = qrDataUrl
        ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 0;">
  <tr>
    <td align="center" style="background-color:${C.white};border-radius:12px;padding:12px;line-height:0;">
      <img src="${qrDataUrl}" width="168" height="168" alt="" role="presentation"
        style="display:block;width:168px;height:168px;border:0;outline:none;text-decoration:none;" />
    </td>
  </tr>
</table>
<p style="margin:10px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.45;color:${C.muted};text-align:center;">
  Scan the QR at the door — it matches the code above (same data as the host’s Gate Protocol QR).
</p>`
        : '';
    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
  <tr>
    <td style="background-color:${C.codeBg};border:1px solid ${C.cardBorder};border-radius:12px;padding:20px 22px 24px;text-align:center;">
      <p style="margin:0 0 6px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.muted};">
        Check-in code
      </p>
      <p style="margin:0;font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:0.18em;color:${C.text};">
        ${c}
      </p>
      ${qrHtml}
    </td>
  </tr>
</table>
<p style="margin:12px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.5;color:${C.muted};">
  Show this at the door or keep it for your records.
</p>`;
}

/** Sends via Resend when RESEND_API_KEY is set; otherwise logs and no-ops. */
export async function sendRegistrationConfirmationEmail(opts: {
    to: string;
    event: Event;
    attendeeName?: string | null;
    /** If set, email mentions paid ticket */
    ticketPriceUsdc?: number;
    paymentLabel?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;

    const { to, event, attendeeName, ticketPriceUsdc, paymentLabel } = opts;
    const origin = appOrigin();
    const link = `${origin}/?event=${encodeURIComponent(event.id)}`;
    const qrDataUrl = await qrPngDataUrlForEmail(event.verificationCode);

    const subject = `You're registered · ${event.name}`;
    const ticketLine =
        ticketPriceUsdc != null && ticketPriceUsdc > 0
            ? `Ticket: ${ticketPriceUsdc} USDC on Base${paymentLabel ? ` (${paymentLabel})` : ''}.`
            : '';
    const text = [
        `Hi${attendeeName ? ` ${attendeeName}` : ''},`,
        '',
        `You're registered for "${event.name}".`,
        ticketLine,
        '',
        `When: ${formatEventWhen(event)}`,
        event.location ? `Where: ${event.location}` : '',
        '',
        `Verification / check-in code: ${event.verificationCode}`,
        '(HTML version includes a QR with the same code for scanning at the door.)',
        '',
        `Event link: ${link}`,
        '',
        `— ${brandName()}`,
    ]
        .filter(Boolean)
        .join('\n');

    const greet = attendeeName ? `Hi <strong style="color:${C.text};">${escapeHtml(attendeeName)}</strong>,` : 'Hi there,';
    const preheader = `Your check-in code is ${event.verificationCode} · ${event.name}`;
    const inner = `
<p style="margin:0 0 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  ${greet}
</p>
<p style="margin:0 0 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  You’re registered for <strong style="color:${C.white};">${escapeHtml(event.name)}</strong>.
</p>
${
    ticketPriceUsdc != null && ticketPriceUsdc > 0
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background-color:${C.codeBg};border:1px solid ${C.cardBorder};border-radius:12px;">
  <tr>
    <td style="padding:14px 18px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;color:${C.text};">
      <strong style="color:${C.accent};">Ticket</strong> · ${escapeHtml(String(ticketPriceUsdc))} USDC on Base${
            paymentLabel ? ` · ${escapeHtml(paymentLabel)}` : ''
        }
    </td>
  </tr>
</table>`
        : ''
}
${detailRow('When', formatEventWhen(event))}
${event.location ? detailRow('Where', event.location) : ''}
${verificationCodeBlock(event.verificationCode, qrDataUrl)}
${bulletproofButtonHref(link, 'View event details')}
<p style="margin:20px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.55;color:${C.muted};">
  Prefer a plain link?
  <a href="${escapeHtml(link)}" style="color:${C.accent};text-decoration:underline;text-underline-offset:2px;">Open in browser</a>
</p>`;

    const html = emailShell({ preheader, innerHtml: inner });

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
    const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
    const { to, event, displayName } = opts;
    const origin = appOrigin();
    const link = `${origin}/?event=${encodeURIComponent(event.id)}`;
    const qrDataUrl = await qrPngDataUrlForEmail(event.verificationCode);

    const subject = `Event is live · ${event.name}`;
    const text = [
        `Hi ${displayName},`,
        '',
        `Your event "${event.name}" is live.`,
        '',
        `When: ${formatEventWhen(event)}`,
        event.location ? `Where: ${event.location}` : '',
        '',
        `Verification code (check-in): ${event.verificationCode}`,
        '(HTML version includes a matching QR for sharing with staff or signage.)',
        `Share link: ${link}`,
        '',
        `— ${brandName()}`,
    ]
        .filter(Boolean)
        .join('\n');

    const preheader = `Share your link and verification code for ${event.name}`;
    const inner = `
<p style="margin:0 0 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  Hi <strong style="color:${C.white};">${escapeHtml(displayName)}</strong>,
</p>
<p style="margin:0 0 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  <strong style="color:${C.white};">${escapeHtml(event.name)}</strong> is live. Share the link below with attendees and use the code for check-in.
</p>
${detailRow('When', formatEventWhen(event))}
${event.location ? detailRow('Where', event.location) : ''}
${verificationCodeBlock(event.verificationCode, qrDataUrl)}
${bulletproofButtonHref(link, 'Open event page')}
<p style="margin:20px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.55;color:${C.muted};">
  Share URL:
  <a href="${escapeHtml(link)}" style="color:${C.accent};word-break:break-all;text-decoration:underline;text-underline-offset:2px;">${escapeHtml(link)}</a>
</p>`;

    const html = emailShell({ preheader, innerHtml: inner });

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
