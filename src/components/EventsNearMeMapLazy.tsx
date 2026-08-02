'use client';

import dynamic from 'next/dynamic';
import type { GeoPoint } from '@/lib/osm-location';
import type { NearMeMapEvent } from '@/components/EventsNearMeMap';
import type { CountryOption } from '@/lib/countries';

const EventsNearMeMap = dynamic(
    () => import('@/components/EventsNearMeMap').then((m) => m.EventsNearMeMap),
    {
        ssr: false,
        loading: () => (
            <div className="h-56 border border-white/10 bg-white/[0.02] flex items-center justify-center">
                <p className="text-[9px] uppercase tracking-widest text-white/35 animate-pulse">Loading map…</p>
            </div>
        ),
    }
);

export function EventsNearMeMapLazy({
    user,
    events,
    selectedId,
    onSelectEvent,
    onUserLocated,
    country,
    className,
}: {
    user: GeoPoint | null;
    events: NearMeMapEvent[];
    selectedId?: string | null;
    onSelectEvent?: (id: string) => void;
    onUserLocated?: (point: GeoPoint) => void;
    country?: CountryOption | null;
    className?: string;
}) {
    return (
        <EventsNearMeMap
            user={user}
            events={events}
            selectedId={selectedId}
            onSelectEvent={onSelectEvent}
            onUserLocated={onUserLocated}
            country={country}
            className={className}
        />
    );
}
