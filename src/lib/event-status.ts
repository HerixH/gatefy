export type EventStatus = 'upcoming' | 'ongoing' | 'past';

export function getEventStatus(date: string, endDate?: string): EventStatus {
    if (!date) return 'upcoming';
    const now = new Date();
    const isoTrim = String(date).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(isoTrim)) {
        const [y, m, d] = isoTrim.split('-').map(Number);
        const eventDayStart = new Date(y, m - 1, d).getTime();
        const eventDayEnd = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
        if (now.getTime() < eventDayStart) return 'upcoming';
        if (now.getTime() <= eventDayEnd) return 'ongoing';
        return 'past';
    }

    const start = new Date(date);
    if (Number.isNaN(start.getTime())) return 'upcoming';

    if (endDate) {
        const end = new Date(endDate);
        if (now < start) return 'upcoming';
        if (now <= end) return 'ongoing';
        return 'past';
    }

    const startDayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
    if (now < start) return 'upcoming';
    if (now <= startDayEnd) return 'ongoing';
    return 'past';
}

export function isUpcoming(date: string, endDate?: string) {
    return getEventStatus(date, endDate) === 'upcoming';
}

export function isOngoing(date: string, endDate?: string) {
    return getEventStatus(date, endDate) === 'ongoing';
}

export function isPast(date: string, endDate?: string) {
    return getEventStatus(date, endDate) === 'past';
}

/** Organizers may view past events but not PATCH tickets, dates, or banners. */
export function eventIsEditable(date: string, endDate?: string): boolean {
    return !isPast(date, endDate);
}

export function formatEventDateTime(iso: string) {
    if (!iso) return '';
    const d = new Date(iso);
    const hasTime = /T\d{1,2}:\d{2}/.test(String(iso).trim()) || iso.includes(':');
    if (hasTime) {
        return d.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
