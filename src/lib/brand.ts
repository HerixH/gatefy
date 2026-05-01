/**
 * Canonical product name for emails, footers, and UI chrome.
 * `EMAIL_BRAND_NAME` or `NEXT_PUBLIC_BRAND_NAME` may still say "Gatefy" from older deploys — map to Gate Protocol.
 */
export function getBrandDisplayName(): string {
    const raw = process.env.EMAIL_BRAND_NAME?.trim() || process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || 'Gate Protocol';
    if (/^gatefy$/i.test(raw)) return 'Gate Protocol';
    return raw;
}
