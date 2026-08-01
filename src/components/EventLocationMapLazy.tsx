'use client';

import dynamic from 'next/dynamic';
import type { GeoPoint } from '@/lib/osm-location';

const EventLocationMap = dynamic(
    () => import('@/components/EventLocationMap').then((m) => m.EventLocationMap),
    {
        ssr: false,
        loading: () => (
            <div className="h-40 border border-white/10 bg-white/[0.02] flex items-center justify-center">
                <p className="text-[9px] uppercase tracking-widest text-white/35 animate-pulse">Loading map…</p>
            </div>
        ),
    }
);

export function EventLocationMapLazy({
    location,
    countryCode,
    allowPin,
    onPinned,
    compact,
    className,
}: {
    location: string;
    countryCode?: string;
    allowPin?: boolean;
    onPinned?: (point: GeoPoint) => void;
    compact?: boolean;
    className?: string;
}) {
    if (!location.trim() && !countryCode) return null;
    return (
        <EventLocationMap
            location={location.trim()}
            countryCode={countryCode}
            allowPin={allowPin}
            onPinned={onPinned}
            compact={compact}
            className={className}
        />
    );
}
