import type { OrganizerEvent } from '@/lib/organizer-event';
import { getPublicRegistrationLink } from '@/lib/organizer-event';
import { formatEventDateTime } from '@/lib/event-status';

/** Download composite PNG: event title, QR, verification code, registration link. */
export function downloadEventQrImage(ev: OrganizerEvent, canvasId: string) {
    const qrCanvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!qrCanvas) return;

    const regLink = getPublicRegistrationLink(ev.id);
    const dateStr = formatEventDateTime(ev.date);
    const locStr = ev.location || 'TBA';

    const pad = 32;
    const qrSize = 200;
    const w = 400;
    const h = 580;
    const composite = document.createElement('canvas');
    composite.width = w;
    composite.height = h;
    const ctx = composite.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ev.name.toUpperCase(), w / 2, pad + 24);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(dateStr + (locStr !== 'TBA' ? ' · ' + locStr : ''), w / 2, pad + 50);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((w - qrSize - 24) / 2, pad + 70, qrSize + 24, qrSize + 24);
    ctx.drawImage(qrCanvas, (w - qrSize) / 2, pad + 82, qrSize, qrSize);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('Verification Code', w / 2, pad + qrSize + 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(ev.verificationCode, w / 2, pad + qrSize + 132);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('Register: ' + regLink, w / 2, h - pad - 36);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('GATE PROTOCOL · Scan or enter code to verify attendance', w / 2, h - pad);

    const url = composite.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ev.name.replace(/\s+/g, '-').toLowerCase()}-gatefy-qr.png`;
    a.click();
}
