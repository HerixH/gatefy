export type OrganizerRegRow = {
    id?: number;
    wallet?: string | null;
    email?: string | null;
    name?: string | null;
    registeredAt: string;
    paymentStatus?: string | null;
    paymentTxHash?: string | null;
    paymentReference?: string | null;
};

export type OrganizerAttendeeRow = {
    wallet?: string | null;
    email?: string | null;
    checkedInAt: string;
    code?: string;
};

export function registrantMatchesCheckIn(
    r: { wallet?: string | null; email?: string | null },
    a: { wallet?: string | null; email?: string | null }
) {
    const rw = (r.wallet ?? '').trim().toLowerCase();
    const re = (r.email ?? '').trim().toLowerCase();
    const aw = (a.wallet ?? '').trim().toLowerCase();
    const ae = (a.email ?? '').trim().toLowerCase();
    if (aw && rw && aw === rw) return true;
    if (ae && re && ae === re) return true;
    return false;
}

export function registrationPaymentDetail(r: OrganizerRegRow): string | null {
    const st = (r.paymentStatus ?? '').toLowerCase();
    if ((st === 'paid_crypto' || st === 'paid_stellar') && r.paymentTxHash?.trim()) return r.paymentTxHash.trim();
    if (
        (st === 'paid_mobile' || st === 'pending_mobile' || st === 'rejected_mobile') &&
        r.paymentReference?.trim()
    ) {
        return r.paymentReference.trim();
    }
    return null;
}

export function registrationPayLabel(r: OrganizerRegRow, ticketPriceUsdc: number): string {
    const st = r.paymentStatus ?? 'none';
    if (ticketPriceUsdc <= 0) return '—';
    if (st === 'paid_crypto') {
        const tx = r.paymentTxHash?.trim();
        return tx && tx.length > 14 ? `Paid · Base · ${tx.slice(0, 8)}…` : 'Paid · Base';
    }
    if (st === 'paid_stellar') {
        const tx = r.paymentTxHash?.trim();
        return tx && tx.length > 14 ? `Paid · Stellar · ${tx.slice(0, 8)}…` : 'Paid · Stellar';
    }
    if (st === 'paid_mobile') {
        const ref = r.paymentReference?.trim();
        return ref ? `Paid · Mobile · ${ref.length > 18 ? `${ref.slice(0, 14)}…` : ref}` : 'Paid · Mobile';
    }
    if (st === 'pending_mobile') return 'Awaiting host · Mobile';
    if (st === 'rejected_mobile') return 'Rejected · Mobile';
    if (st === 'none') return 'Unpaid';
    return String(st);
}

export function exportOrganizerRosterCsv(
    eventName: string,
    ticketPriceUsdc: number,
    attendees: OrganizerAttendeeRow[],
    registrations: OrganizerRegRow[]
) {
    const unverified = registrations.filter((r) => !attendees.some((a) => registrantMatchesCheckIn(r, a)));
    const payExport = (r: OrganizerRegRow | null, verified: boolean) => {
        if (ticketPriceUsdc <= 0) return 'Free';
        if (verified) return '—';
        if (!r) return '—';
        const st = r.paymentStatus ?? 'none';
        if (st === 'paid_crypto') return 'Base';
        if (st === 'paid_stellar') return 'Stellar';
        if (st === 'paid_mobile') return 'Mobile';
        return 'Unpaid';
    };
    const payDetailExport = (r: OrganizerRegRow | null) => {
        if (!r) return '—';
        const st = (r.paymentStatus ?? '').toLowerCase();
        if ((st === 'paid_crypto' || st === 'paid_stellar') && r.paymentTxHash?.trim()) return r.paymentTxHash.trim();
        if (st === 'paid_mobile' && r.paymentReference?.trim()) return r.paymentReference.trim();
        return '—';
    };

    type Row = {
        Status: string;
        Identity: string;
        Name: string;
        Email: string;
        Code: string;
        Payment: string;
        PaymentDetail: string;
        Timestamp: string;
    };
    const rows: Row[] = [];
    attendees.forEach((a) => {
        rows.push({
            Status: 'Verified',
            Identity: a.wallet?.trim() || a.email?.trim() || '—',
            Name: '—',
            Email: (a.email ?? '').trim() || '—',
            Code: (a.code ?? '').trim() || '—',
            Payment: payExport(null, true),
            PaymentDetail: '—',
            Timestamp: new Date(a.checkedInAt).toLocaleString('en-GB'),
        });
    });
    unverified.forEach((r) => {
        rows.push({
            Status: 'Registered only',
            Identity: r.wallet?.trim() || r.email?.trim() || '—',
            Name: (r.name ?? '').trim() || '—',
            Email: (r.email ?? '').trim() || '—',
            Code: '-',
            Payment: payExport(r, false),
            PaymentDetail: payDetailExport(r),
            Timestamp: new Date(r.registeredAt).toLocaleString('en-GB'),
        });
    });
    if (rows.length === 0) return false;

    const headers = Object.keys(rows[0]) as (keyof Row)[];
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map((row) => headers.map((h) => esc(row[h])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gatefy-${eventName.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}-roster.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    return true;
}
