'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    distanceMeters,
    geocodeLocationQuery,
    getBrowserPosition,
    type GeoPoint,
} from '@/lib/osm-location';
import { EventsNearMeMapLazy } from '@/components/EventsNearMeMapLazy';

export type NearMeEvent = {
    id: string;
    name: string;
    location: string;
    date: string;
    endDate?: string;
};

type Located = NearMeEvent & {
    point: GeoPoint;
    distanceKm: number | null;
};

type Props = {
    events: NearMeEvent[];
    onSelectEvent: (id: string) => void;
    formatDate?: (iso: string) => string;
};

const GEO_CACHE_KEY = 'gatefy-geo-loc-v1';
const MAX_GEOCODE = 24;

function parseCoordLocation(loc: string): GeoPoint | null {
    const m = loc.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon, label: loc.trim() };
}

function readGeoCache(): Record<string, GeoPoint> {
    if (typeof window === 'undefined') return {};
    try {
        const raw = sessionStorage.getItem(GEO_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, GeoPoint>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeGeoCache(cache: Record<string, GeoPoint>) {
    try {
        sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
    } catch {
        /* ignore */
    }
}

function formatDistanceKm(km: number | null): string {
    if (km == null) return '—';
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
}

function defaultFormatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
        return iso;
    }
}

export function EventsNearMe({ events, onSelectEvent, formatDate = defaultFormatDate }: Props) {
    const [user, setUser] = useState<GeoPoint | null>(null);
    const [locating, setLocating] = useState(false);
    const [geoError, setGeoError] = useState<string | null>(null);
    const [pointsByKey, setPointsByKey] = useState<Record<string, GeoPoint>>({});
    const [geocoding, setGeocoding] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const withLocation = useMemo(
        () => events.filter((e) => e.location.trim().length >= 2).slice(0, MAX_GEOCODE),
        [events]
    );
    const locationFingerprint = useMemo(
        () => withLocation.map((e) => e.location.trim().toLowerCase()).join('|'),
        [withLocation]
    );

    useEffect(() => {
        setPointsByKey(readGeoCache());
    }, []);

    useEffect(() => {
        let cancelled = false;
        const cache = { ...readGeoCache() };

        // Seed coordinate-style locations immediately
        const seed: Record<string, GeoPoint> = {};
        for (const ev of withLocation) {
            const key = ev.location.trim().toLowerCase();
            const parsed = parseCoordLocation(ev.location);
            if (parsed && !cache[key]) {
                seed[key] = parsed;
                cache[key] = parsed;
            }
        }
        if (Object.keys(seed).length) {
            writeGeoCache(cache);
            setPointsByKey((prev) => ({ ...prev, ...seed }));
        }

        const pending = withLocation.filter((ev) => {
            const key = ev.location.trim().toLowerCase();
            if (cache[key]) return false;
            if (parseCoordLocation(ev.location)) return false;
            return true;
        });

        if (pending.length === 0) return;

        setGeocoding(true);
        (async () => {
            const next = { ...cache };
            for (const ev of pending) {
                if (cancelled) break;
                const key = ev.location.trim().toLowerCase();
                const point = await geocodeLocationQuery(ev.location);
                if (point) next[key] = point;
                // Be gentle with Nominatim
                await new Promise((r) => setTimeout(r, 350));
            }
            if (cancelled) return;
            writeGeoCache(next);
            setPointsByKey(next);
            setGeocoding(false);
        })().catch(() => {
            if (!cancelled) setGeocoding(false);
        });

        return () => {
            cancelled = true;
        };
    }, [locationFingerprint, withLocation]);

    const located: Located[] = useMemo(() => {
        const rows: Located[] = [];
        for (const ev of withLocation) {
            const key = ev.location.trim().toLowerCase();
            const point = pointsByKey[key] || parseCoordLocation(ev.location);
            if (!point) continue;
            const distanceKm =
                user != null ? distanceMeters(user, point) / 1000 : null;
            rows.push({ ...ev, point, distanceKm });
        }
        rows.sort((a, b) => {
            if (a.distanceKm == null && b.distanceKm == null) return a.name.localeCompare(b.name);
            if (a.distanceKm == null) return 1;
            if (b.distanceKm == null) return -1;
            return a.distanceKm - b.distanceKm;
        });
        return rows;
    }, [withLocation, pointsByKey, user]);

    const nearby = useMemo(() => {
        if (!user) return located.slice(0, 8);
        // Prefer within ~80 km, else still show closest
        const close = located.filter((e) => e.distanceKm != null && e.distanceKm <= 80);
        return (close.length ? close : located).slice(0, 8);
    }, [located, user]);

    const findNearMe = async () => {
        setLocating(true);
        setGeoError(null);
        try {
            const me = await getBrowserPosition();
            setUser(me);
        } catch (e) {
            setGeoError(e instanceof Error ? e.message : 'Could not read your location.');
        } finally {
            setLocating(false);
        }
    };

    const mapEvents = nearby.map((e) => ({
        id: e.id,
        name: e.name,
        location: e.location,
        point: e.point,
        distanceKm: e.distanceKm,
    }));

    return (
        <div id="events-near-me" className="space-y-4 scroll-mt-28 w-full min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white">Events near me</p>
                    <p className="text-[8px] font-mono text-white/35 tracking-wider mt-1">
                        {user
                            ? `${nearby.length} closest with a mapped location`
                            : geocoding
                              ? 'Mapping venues…'
                              : 'Share location to sort by distance'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void findNearMe()}
                    disabled={locating}
                    className="shrink-0 px-3 py-1.5 border border-white/15 text-[8px] font-black uppercase tracking-[0.18em] text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-50"
                >
                    {locating ? 'Locating…' : user ? 'Refresh location' : 'Use my location'}
                </button>
            </div>

            {geoError ? (
                <p className="text-[9px] text-amber-400/90 font-mono">{geoError}</p>
            ) : null}

            <EventsNearMeMapLazy
                user={user}
                events={mapEvents}
                selectedId={selectedId}
                onSelectEvent={(id) => {
                    setSelectedId(id);
                    onSelectEvent(id);
                }}
            />

            <div className="border border-white/5 bg-white/[0.01] backdrop-blur-3xl overflow-hidden">
                {withLocation.length === 0 ? (
                    <div className="p-6 text-center">
                        <p className="text-[10px] tracking-[0.25em] uppercase text-white/30">
                            No events with locations yet
                        </p>
                    </div>
                ) : nearby.length === 0 ? (
                    <div className="p-6 text-center space-y-2">
                        <p className="text-[10px] tracking-[0.25em] uppercase text-white/30">
                            {geocoding ? 'Finding venues on the map…' : 'Could not map event locations'}
                        </p>
                        {!user ? (
                            <button
                                type="button"
                                onClick={() => void findNearMe()}
                                className="text-[8px] font-bold uppercase tracking-widest text-accent/90 hover:text-accent"
                            >
                                Use my location
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <div className="divide-y divide-white/[0.05]">
                        {nearby.map((ev) => (
                            <button
                                key={ev.id}
                                type="button"
                                onClick={() => {
                                    setSelectedId(ev.id);
                                    onSelectEvent(ev.id);
                                }}
                                className={`w-full text-left p-4 hover:bg-white/[0.03] transition-colors ${
                                    selectedId === ev.id ? 'bg-white/[0.04]' : ''
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 space-y-1">
                                        <p className="text-[11px] font-bold tracking-tight truncate uppercase">
                                            {ev.name}
                                        </p>
                                        <p className="text-[8px] tracking-[0.15em] uppercase text-secondary/45 font-bold truncate">
                                            {ev.location}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0 space-y-0.5">
                                        <p className="text-[9px] font-mono text-accent/90">
                                            {user ? formatDistanceKm(ev.distanceKm) : 'On map'}
                                        </p>
                                        <p className="text-[8px] font-mono text-secondary/40">
                                            {formatDate(ev.date)}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
