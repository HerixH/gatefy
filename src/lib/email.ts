import type { Event } from './events';
import { getBrandDisplayName } from './brand';
import QRCode from 'qrcode';

const RESEND_URL = 'https://api.resend.com/emails';

/** CID for inline QR PNG — email clients block `data:` URLs; Resend maps this to `<img src="cid:…">`. */
const CHECKIN_QR_CONTENT_ID = 'gate-protocol-checkin-qr';

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
    let raw = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? 'http://localhost:3000').trim();
    // VERCEL_URL is host-only — iPhone Mail won't open protocol-less links.
    if (raw && !/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    return raw.replace(/\/$/, '');
}

function brandName(): string {
    return getBrandDisplayName();
}

/** PNG as raw base64 for Resend `attachments[].content` (not a data: URL). */
async function qrPngBase64ForEmail(code: string): Promise<string | null> {
    try {
        const buf = await QRCode.toBuffer(code.trim(), {
            errorCorrectionLevel: 'M',
            type: 'png',
            width: 216,
            margin: 2,
            color: { dark: '#0a0a0a', light: '#ffffff' },
        });
        return buf.toString('base64');
    } catch (e) {
        console.warn('[email] QRCode.toBuffer failed', e);
        return null;
    }
}

function inlineCheckinQrAttachment(qrBase64: string): { content: string; filename: string; content_id: string; content_type: string } {
    return {
        content: qrBase64,
        filename: 'check-in-qr.png',
        content_id: CHECKIN_QR_CONTENT_ID,
        content_type: 'image/png',
    };
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

/**
 * Full-width CTA — table + padded &lt;a&gt; so iPhone Mail / Gmail keep a 44pt tap target
 * and don’t clip the label the way a lone inline-block button can.
 */
function bulletproofButtonHref(href: string, label: string): string {
    const h = escapeHtml(href);
    const l = escapeHtml(label);
    return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0 8px;border-collapse:collapse;">
  <tr>
    <td align="center" bgcolor="${C.white}" style="background-color:${C.white};border-radius:10px;mso-padding-alt:0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${h.replace(/"/g, '&quot;')}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="12%" stroke="f" fillcolor="${C.white}">
        <w:anchorlock/>
        <center style="color:${C.black};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;font-weight:600;">${l}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${h}"
        style="background-color:${C.white};border-radius:10px;color:${C.black};display:block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:20px;margin:0;min-height:20px;padding:16px 12px;text-align:center;text-decoration:none;-webkit-text-size-adjust:none;mso-hide:all;">
        ${l}
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

/** Secondary link — text only so iPhone doesn’t stack multiple full-width Safari choosers. */
function plainLinkHref(href: string, label: string): string {
    const h = escapeHtml(href);
    const l = escapeHtml(label);
    return `<p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;text-align:center;-webkit-text-size-adjust:none;">
  <a href="${h}" style="color:${C.accent};text-decoration:underline;">${l}</a>
</p>`;
}

function emailShell(opts: { preheader: string; innerHtml: string }): string {
    const { preheader, innerHtml } = opts;
    const bn = escapeHtml(brandName());
    const year = new Date().getFullYear();
    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${bn}</title>
  <style type="text/css">
    :root { color-scheme: dark; supported-color-schemes: dark; }
    html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; }
    table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    a { text-decoration: none; }
    /* Stop iOS Mail from auto-linking dates / addresses and restyling them blue */
    a[x-apple-data-detectors],
    .unstyle-auto-detected a {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }
    @media only screen and (max-width: 620px) {
      .email-outer-pad { padding: 24px 12px !important; }
      .email-card { padding: 24px 16px 28px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${C.pageBg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${preheaderHtml(preheader)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.pageBg};width:100%;">
    <tr>
      <td align="center" class="email-outer-pad" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
          <tr>
            <td style="padding:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;letter-spacing:0.02em;color:${C.text};">
              ${bn}
            </td>
          </tr>
          <tr>
            <td class="email-card unstyle-auto-detected" style="background-color:${C.cardBg};border:1px solid ${C.cardBorder};border-radius:16px;padding:28px 20px 32px;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${C.faint};text-align:center;">
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

function verificationCodeBlock(code: string, qrImgSrc: string | null): string {
    const c = escapeHtml(code);
    const qrHtml = qrImgSrc
        ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 0;">
  <tr>
    <td align="center" style="background-color:${C.white};border-radius:12px;padding:12px;line-height:0;">
      <img src="${escapeHtml(qrImgSrc)}" width="168" height="168" alt="Check-in QR code"
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
type MailResult = { ok: boolean; skipped?: boolean; error?: string };

/** Payment receipt only (paid tickets after payment is verified). */
export async function sendPaymentReceiptEmail(opts: {
    to: string;
    event: Event;
    attendeeName?: string | null;
    ticketPriceUsdc: number;
    paymentLabel?: string;
    paymentTxHash?: string | null;
    paymentExplorerUrl?: string | null;
    paymentReference?: string | null;
}): Promise<MailResult> {
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
    const {
        to,
        event,
        attendeeName,
        ticketPriceUsdc,
        paymentLabel,
        paymentTxHash,
        paymentExplorerUrl,
        paymentReference,
    } = opts;
    const origin = appOrigin();
    // Deep-link into the event so mobile opens Gate Protocol first (not an explorer chooser).
    const link = `${origin}/?event=${encodeURIComponent(event.id)}&email=${encodeURIComponent(to)}`;
    const subject = `Payment receipt · ${event.name}`;
    const text = [
        `Hi${attendeeName ? ` ${attendeeName}` : ''},`,
        '',
        `This is your payment receipt for "${event.name}".`,
        `Amount: ${ticketPriceUsdc} USDC${paymentLabel ? ` (${paymentLabel})` : ''}`,
        paymentTxHash ? `Payment tx: ${paymentTxHash}` : '',
        paymentReference ? `Reference: ${paymentReference}` : '',
        paymentExplorerUrl ? `Explorer: ${paymentExplorerUrl}` : '',
        '',
        `When: ${formatEventWhen(event)}`,
        event.location ? `Where: ${event.location}` : '',
        '',
        `Open your ticket: ${link}`,
        '',
        `— ${brandName()}`,
    ]
        .filter(Boolean)
        .join('\n');

    const greet = attendeeName
        ? `Hi <strong style="color:${C.text};">${escapeHtml(attendeeName)}</strong>,`
        : 'Hi there,';
    const explorerPlain =
        paymentExplorerUrl?.includes('basescan')
            ? 'View payment on Basescan'
            : paymentExplorerUrl?.includes('stellar.expert')
              ? 'View payment on Stellar Expert'
              : 'View payment online';
    const inner = `
<p style="margin:0 0 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  ${greet}
</p>
<p style="margin:0 0 20px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  Payment verified for <strong style="color:${C.white};">${escapeHtml(event.name)}</strong>. Keep this email as your receipt.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background-color:${C.codeBg};border:1px solid ${C.cardBorder};border-radius:12px;">
  <tr>
    <td style="padding:14px 18px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;color:${C.text};">
      <strong style="color:${C.accent};">Receipt</strong> · ${escapeHtml(String(ticketPriceUsdc))} USDC${
          paymentLabel ? ` · ${escapeHtml(paymentLabel)}` : ''
      }${
          paymentTxHash
              ? `<br/><span style="font-family:ui-monospace,monospace;font-size:12px;color:${C.muted};word-break:break-all;">Tx ${escapeHtml(
                    paymentTxHash.length > 24
                        ? `${paymentTxHash.slice(0, 10)}…${paymentTxHash.slice(-8)}`
                        : paymentTxHash
                )}</span>`
              : ''
      }${
          paymentReference
              ? `<br/><span style="font-family:ui-monospace,monospace;font-size:12px;color:${C.muted};word-break:break-all;">Ref ${escapeHtml(paymentReference)}</span>`
              : ''
      }
    </td>
  </tr>
</table>
${detailRow('When', formatEventWhen(event))}
${event.location ? detailRow('Where', event.location) : ''}
${bulletproofButtonHref(link, 'Open your ticket')}
${paymentExplorerUrl ? plainLinkHref(paymentExplorerUrl, explorerPlain) : ''}
<p style="margin:16px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.55;color:${C.muted};text-align:center;">
  A second email has your check-in QR. Tap <strong style="color:${C.text};">Open your ticket</strong> above to return to Gate Protocol.
</p>`;

    const html = emailShell({ preheader: `Receipt · ${ticketPriceUsdc} USDC · ${event.name}`, innerHtml: inner });

    if (!key) {
        console.warn('[email] RESEND_API_KEY not set; skipping payment receipt to', to);
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
        console.error('[email] Resend error (receipt):', res.status, err);
        return { ok: false, error: err };
    }
    return { ok: true };
}

/** Registration confirmed — check-in QR / code (always sent after successful signup). */
export async function sendRegistrationConfirmationEmail(opts: {
    to: string;
    event: Event;
    attendeeName?: string | null;
    ticketPriceUsdc?: number;
    paymentLabel?: string;
    paymentTxHash?: string | null;
    paymentExplorerUrl?: string | null;
}): Promise<MailResult> {
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;

    const { to, event, attendeeName, ticketPriceUsdc, paymentLabel } = opts;
    const origin = appOrigin();
    const link = `${origin}/?event=${encodeURIComponent(event.id)}&email=${encodeURIComponent(to)}`;
    const qrBase64 = await qrPngBase64ForEmail(event.verificationCode);
    const qrImgSrc = qrBase64 ? `cid:${CHECKIN_QR_CONTENT_ID}` : null;
    const paid = ticketPriceUsdc != null && ticketPriceUsdc > 0;

    const subject = `Registration confirmed · ${event.name}`;
    const text = [
        `Hi${attendeeName ? ` ${attendeeName}` : ''},`,
        '',
        `Your registration for "${event.name}" is confirmed.`,
        paid ? `Ticket paid: ${ticketPriceUsdc}${paymentLabel ? ` (${paymentLabel})` : ''}.` : '',
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

    const greet = attendeeName
        ? `Hi <strong style="color:${C.text};">${escapeHtml(attendeeName)}</strong>,`
        : 'Hi there,';
    const inner = `
<p style="margin:0 0 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  ${greet}
</p>
<p style="margin:0 0 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  Your registration for <strong style="color:${C.white};">${escapeHtml(event.name)}</strong> is <strong style="color:${C.accent};">confirmed</strong>.
</p>
${
    paid
        ? `<p style="margin:0 0 20px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;color:${C.muted};">
  Ticket ${escapeHtml(String(ticketPriceUsdc))} USDC${paymentLabel ? ` · ${escapeHtml(paymentLabel)}` : ''} — payment verified.
</p>`
        : ''
}
${detailRow('When', formatEventWhen(event))}
${event.location ? detailRow('Where', event.location) : ''}
${verificationCodeBlock(event.verificationCode, qrImgSrc)}
${bulletproofButtonHref(link, 'Open your ticket')}
<p style="margin:12px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.55;color:${C.muted};text-align:center;">
  On phone: tap the button to open Gate Protocol and see your registration.
</p>`;

    const html = emailShell({
        preheader: `Registration confirmed · check-in code ${event.verificationCode}`,
        innerHtml: inner,
    });

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
            ...(qrBase64 ? { attachments: [inlineCheckinQrAttachment(qrBase64)] } : {}),
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

/**
 * After signup succeeds:
 * - free → registration confirmation only
 * - paid (verified payment) → payment receipt + registration confirmation
 */
export async function sendRegistrationEmailsAfterSignup(opts: {
    to: string;
    event: Event;
    attendeeName?: string | null;
    ticketPriceUsdc?: number;
    paymentLabel?: string;
    paymentTxHash?: string | null;
    paymentExplorerUrl?: string | null;
    paymentReference?: string | null;
    /** true when crypto/Stepay paid; false for pending mobile */
    paymentVerified?: boolean;
}): Promise<{
    emailSent: boolean;
    emailSkipped: boolean;
    receiptSent?: boolean;
    confirmationSent?: boolean;
}> {
    const price =
        opts.ticketPriceUsdc != null && Number.isFinite(opts.ticketPriceUsdc) && opts.ticketPriceUsdc > 0
            ? opts.ticketPriceUsdc
            : 0;
    const paidVerified = price > 0 && opts.paymentVerified === true;

    let receiptSent = false;
    let confirmationSent = false;
    let emailSkipped = false;

    if (paidVerified) {
        const receipt = await sendPaymentReceiptEmail({
            to: opts.to,
            event: opts.event,
            attendeeName: opts.attendeeName,
            ticketPriceUsdc: price,
            paymentLabel: opts.paymentLabel,
            paymentTxHash: opts.paymentTxHash,
            paymentExplorerUrl: opts.paymentExplorerUrl,
            paymentReference: opts.paymentReference,
        });
        receiptSent = receipt.ok;
        if (receipt.skipped) emailSkipped = true;
    }

    const conf = await sendRegistrationConfirmationEmail({
        to: opts.to,
        event: opts.event,
        attendeeName: opts.attendeeName,
        ticketPriceUsdc: price > 0 ? price : undefined,
        paymentLabel: opts.paymentLabel,
        paymentTxHash: opts.paymentTxHash,
        paymentExplorerUrl: opts.paymentExplorerUrl,
    });
    confirmationSent = conf.ok;
    if (conf.skipped) emailSkipped = true;

    return {
        emailSent: confirmationSent || receiptSent,
        emailSkipped,
        receiptSent: paidVerified ? receiptSent : undefined,
        confirmationSent,
    };
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
    const qrBase64 = await qrPngBase64ForEmail(event.verificationCode);
    const qrImgSrc = qrBase64 ? `cid:${CHECKIN_QR_CONTENT_ID}` : null;

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
${verificationCodeBlock(event.verificationCode, qrImgSrc)}
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
        body: JSON.stringify({
            from,
            to: [to],
            subject,
            html,
            text,
            ...(qrBase64 ? { attachments: [inlineCheckinQrAttachment(qrBase64)] } : {}),
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

/** After a successful check-in — includes on-chain explorer links when a mint just succeeded. */
export async function sendAttendanceVerifiedEmail(opts: {
    to: string;
    event: Event;
    attendeeName?: string | null;
    chain?: string | null;
    txHash?: string | null;
    tokenId?: string | null;
    explorerUrl?: string | null;
    baseTxHash?: string | null;
    baseExplorerUrl?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
    const {
        to,
        event,
        attendeeName,
        chain,
        txHash,
        tokenId,
        explorerUrl,
        baseTxHash,
        baseExplorerUrl,
    } = opts;
    const origin = appOrigin();
    const link = `${origin}/?event=${encodeURIComponent(event.id)}&email=${encodeURIComponent(to)}`;
    const c = (chain || '').toLowerCase();
    const stellarExplorer =
        explorerUrl && explorerUrl.includes('stellar.expert')
            ? explorerUrl
            : explorerUrl && c !== 'base'
              ? explorerUrl
              : null;
    const baseExplorer =
        baseExplorerUrl ||
        (explorerUrl && (explorerUrl.includes('basescan') || c === 'base') ? explorerUrl : null);

    const subject = `You're checked in · ${event.name}`;
    const text = [
        `Hi${attendeeName ? ` ${attendeeName}` : ''},`,
        '',
        `Your attendance was recorded for "${event.name}".`,
        '',
        `When: ${formatEventWhen(event)}`,
        event.location ? `Where: ${event.location}` : '',
        tokenId ? `Token: #${tokenId}` : '',
        txHash ? `Transaction: ${txHash}` : '',
        stellarExplorer ? `Stellar Expert: ${stellarExplorer}` : '',
        baseExplorer && baseExplorer !== stellarExplorer ? `Basescan: ${baseExplorer}` : '',
        baseTxHash && baseTxHash !== txHash ? `Base tx: ${baseTxHash}` : '',
        '',
        `Open your ticket: ${link}`,
        '',
        `— ${brandName()}`,
    ]
        .filter(Boolean)
        .join('\n');

    const greet = attendeeName ? `Hi <strong style="color:${C.text};">${escapeHtml(attendeeName)}</strong>,` : 'Hi there,';
    const preheader = stellarExplorer || baseExplorer
        ? `Checked in · on-chain proof for ${event.name}`
        : `Attendance confirmed for ${event.name}`;
    const inner = `
<p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  ${greet}
</p>
<p style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  Your attendance is <strong style="color:${C.white};">verified</strong> for <strong style="color:${C.white};">${escapeHtml(event.name)}</strong>.
</p>
${detailRow('When', formatEventWhen(event))}
${event.location ? detailRow('Where', event.location) : ''}
${tokenId ? detailRow('Token', `#${tokenId}`) : ''}
${txHash ? detailRow('Tx', txHash.length > 20 ? `${txHash.slice(0, 12)}…${txHash.slice(-8)}` : txHash) : ''}
${bulletproofButtonHref(link, 'Open your ticket')}
${stellarExplorer ? plainLinkHref(stellarExplorer, 'View on Stellar Expert') : ''}
${baseExplorer && baseExplorer !== stellarExplorer ? plainLinkHref(baseExplorer, 'View on Basescan') : ''}
<p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:${C.muted};text-align:center;">
  Keep this email for your records.
</p>`;

    const html = emailShell({ preheader, innerHtml: inner });

    if (!key) {
        console.warn('[email] RESEND_API_KEY not set; skipping check-in email to', to);
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

    const chkBody = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = typeof chkBody?.message === 'string' ? chkBody.message : JSON.stringify(chkBody);
        console.error('[email] Resend error (check-in):', res.status, err);
        return { ok: false, error: err };
    }
    return { ok: true };
}

/** After a successful attendance proof mint (Stellar and/or Base). */
export async function sendAttendanceMintedEmail(opts: {
    to: string;
    event: Event;
    attendeeName?: string | null;
    chain?: string | null;
    txHash?: string | null;
    tokenId?: string | null;
    explorerUrl?: string | null;
    baseTxHash?: string | null;
    baseExplorerUrl?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
    const { to, event, attendeeName, chain, txHash, tokenId, explorerUrl, baseTxHash, baseExplorerUrl } =
        opts;
    const origin = appOrigin();
    const link = `${origin}/?event=${encodeURIComponent(event.id)}&email=${encodeURIComponent(to)}`;
    const c = (chain || 'soroban').toLowerCase();
    const chainLabel =
        c === 'both'
            ? 'Stellar and Base'
            : c === 'base'
              ? 'Base'
              : 'Stellar (Soroban)';
    const explorerLabel =
        c === 'base' ? 'View on Basescan' : 'View on Stellar Expert';

    const subject = `Attendance proof minted · ${event.name}`;
    const text = [
        `Hi${attendeeName ? ` ${attendeeName}` : ''},`,
        '',
        `Your attendance proof was minted on ${chainLabel} for "${event.name}".`,
        '',
        `When: ${formatEventWhen(event)}`,
        event.location ? `Where: ${event.location}` : '',
        tokenId ? `Token: #${tokenId}` : '',
        txHash ? `Transaction: ${txHash}` : '',
        explorerUrl ? `Explorer: ${explorerUrl}` : '',
        baseTxHash && baseTxHash !== txHash ? `Base tx: ${baseTxHash}` : '',
        baseExplorerUrl && baseExplorerUrl !== explorerUrl ? `Base explorer: ${baseExplorerUrl}` : '',
        '',
        `Open event: ${link}`,
        '',
        `— ${brandName()}`,
    ]
        .filter(Boolean)
        .join('\n');

    const greet = attendeeName ? `Hi <strong style="color:${C.text};">${escapeHtml(attendeeName)}</strong>,` : 'Hi there,';
    const preheader = `On-chain attendance proof minted for ${event.name}`;
    const inner = `
<p style="margin:0 0 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  ${greet}
</p>
<p style="margin:0 0 20px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  Your attendance proof was <strong style="color:${C.white};">minted on ${escapeHtml(chainLabel)}</strong> for <strong style="color:${C.white};">${escapeHtml(event.name)}</strong>.
</p>
${detailRow('When', formatEventWhen(event))}
${event.location ? detailRow('Where', event.location) : ''}
${tokenId ? detailRow('Token', `#${tokenId}`) : ''}
${txHash ? detailRow('Tx', txHash.length > 20 ? `${txHash.slice(0, 12)}…${txHash.slice(-8)}` : txHash) : ''}
${bulletproofButtonHref(link, 'Open your ticket')}
${explorerUrl ? plainLinkHref(explorerUrl, explorerLabel) : ''}
${baseExplorerUrl && baseExplorerUrl !== explorerUrl ? plainLinkHref(baseExplorerUrl, 'View on Basescan') : ''}
<p style="margin:16px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.55;color:${C.muted};text-align:center;">
  Keep this email as your on-chain attendance receipt.
</p>`;

    const html = emailShell({ preheader, innerHtml: inner });

    if (!key) {
        console.warn('[email] RESEND_API_KEY not set; skipping mint email to', to);
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

    const mintBody = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = typeof mintBody?.message === 'string' ? mintBody.message : JSON.stringify(mintBody);
        console.error('[email] Resend error (mint):', res.status, err);
        return { ok: false, error: err };
    }
    return { ok: true };
}

/** One-time code for an attendee to reopen their existing ticket. */
export async function sendAttendeeTicketCodeEmail(opts: {
    to: string;
    code: string;
    eventName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
    const { to, code, eventName } = opts;
    const subject = `${code} is your Gate Protocol ticket code`;
    const text = [
        `Your code to open your ticket for "${eventName}":`,
        '',
        code,
        '',
        'This code expires in 10 minutes. If you did not request it, ignore this email.',
        '',
        `— ${brandName()}`,
    ].join('\n');

    const preheader = `Your ticket code is ${code}`;
    const inner = `
<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  Use this code to open your ticket for <strong style="color:${C.white};">${escapeHtml(eventName)}</strong>:
</p>
<p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:32px;letter-spacing:0.2em;font-weight:700;color:${C.white};">
  ${escapeHtml(code)}
</p>
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:${C.muted};">
  Expires in 10 minutes. Anyone with this code can view this registration.
</p>`;

    const html = emailShell({ preheader, innerHtml: inner });

    if (!key) {
        console.warn('[email] RESEND_API_KEY not set; attendee ticket OTP for', to, 'code:', code);
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
        console.error('[email] Resend error (attendee ticket OTP):', res.status, err);
        return { ok: false, error: err };
    }
    return { ok: true };
}

/** Platform admin message to an event host. */
export async function sendAdminHostContactEmail(opts: {
    to: string;
    hostName: string;
    eventName: string;
    eventId: string;
    subject: string;
    message: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
    const { to, hostName, eventName, eventId, subject, message } = opts;
    const origin = appOrigin();
    const eventLink = `${origin}/?event=${encodeURIComponent(eventId)}`;
    const hostDashboard = `${origin}/organizer`;
    const safeSubject = subject.trim().slice(0, 160);
    const safeMessage = message.trim().slice(0, 5000);
    const greeting = hostName.trim() || 'host';

    const text = [
        `Hi ${greeting},`,
        '',
        `Message from Gate Protocol admin about “${eventName}”:`,
        '',
        safeMessage,
        '',
        `Event page: ${eventLink}`,
        `Host dashboard: ${hostDashboard}`,
        '',
        `— ${brandName()} Admin`,
    ].join('\n');

    const preheader = `Admin message about ${eventName}`;
    const inner = `
<p style="margin:0 0 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  Hi <strong style="color:${C.white};">${escapeHtml(greeting)}</strong>,
</p>
<p style="margin:0 0 20px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:${C.muted};">
  Message from Gate Protocol admin about
  <strong style="color:${C.white};">${escapeHtml(eventName)}</strong>:
</p>
<div style="margin:0 0 24px;padding:16px 18px;border:1px solid ${C.cardBorder};background:${C.codeBg};">
  <p style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:${C.text};white-space:pre-wrap;">${escapeHtml(safeMessage)}</p>
</div>
${bulletproofButtonHref(eventLink, 'Open event page')}
<p style="margin:16px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.55;color:${C.muted};">
  Host dashboard:
  <a href="${escapeHtml(hostDashboard)}" style="color:${C.accent};text-decoration:underline;">${escapeHtml(hostDashboard)}</a>
</p>`;

    const html = emailShell({ preheader, innerHtml: inner });

    if (!key) {
        console.warn('[email] RESEND_API_KEY not set; skipping admin→host email to', to);
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
            subject: `[Gate Protocol] ${safeSubject}`,
            html,
            text,
            reply_to: process.env.ADMIN_CONTACT_REPLY_TO?.trim() || undefined,
        }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = typeof body?.message === 'string' ? body.message : JSON.stringify(body);
        console.error('[email] Resend error (admin→host):', res.status, err);
        return { ok: false, error: err };
    }
    return { ok: true };
}

/** One-time code for organizer email sign-up / sign-in. */
export async function sendOrganizerSignInCodeEmail(opts: {
    to: string;
    code: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
    const { to, code } = opts;
    const subject = `${code} is your Gate Protocol host code`;
    const text = [
        'Your Gate Protocol host sign-in code:',
        '',
        code,
        '',
        'This code expires in 10 minutes. If you did not request it, ignore this email.',
        '',
        `— ${brandName()}`,
    ].join('\n');

    const preheader = `Your host code is ${code}`;
    const inner = `
<p style="margin:0 0 16px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;line-height:1.55;color:${C.text};">
  Use this code to sign in as a host:
</p>
<p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:32px;letter-spacing:0.2em;font-weight:700;color:${C.white};">
  ${escapeHtml(code)}
</p>
<p style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.55;color:${C.muted};">
  Expires in 10 minutes. Anyone with this code can manage events for this email.
</p>`;

    const html = emailShell({ preheader, innerHtml: inner });

    if (!key) {
        console.warn('[email] RESEND_API_KEY not set; organizer OTP for', to, 'code:', code);
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
        console.error('[email] Resend error (organizer OTP):', res.status, err);
        return { ok: false, error: err };
    }
    return { ok: true };
}
