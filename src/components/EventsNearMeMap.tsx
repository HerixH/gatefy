'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
    fetchRoute,
    getBrowserPosition,
    type GeoPoint,
    type RouteResult,
    type TravelMode,
} from '@/lib/osm-location';
import type { CountryOption } from '@/lib/countries';

export type NearMeMapEvent = {
    id: string;
    name: string;
    location: string;
    point: GeoPoint;
    distanceKm?: number | null;
};

type BaseLayer = 'street' | 'satellite';

type Props = {
    user: GeoPoint | null;
    events: NearMeMapEvent[];
    selectedId?: string | null;
    onSelectEvent?: (id: string) => void;
    onUserLocated?: (point: GeoPoint) => void;
    country?: CountryOption | null;
    className?: string;
};

function makePinIcon(color: string, size: number, ring?: string) {
    const ringCss = ring ? `box-shadow:0 0 0 3px ${ring};` : 'box-shadow:0 0 0 1px rgba(0,0,0,.35);';
    return L.divIcon({
        className: 'gatefy-map-pin',
        html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #fff;${ringCss}"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

function FitBounds({
    user,
    events,
    country,
    route,
}: {
    user: GeoPoint | null;
    events: NearMeMapEvent[];
    country?: CountryOption | null;
    route: RouteResult | null;
}) {
    const map = useMap();
    const eventKey = events.map((e) => e.id).join(',');

    useEffect(() => {
        if (route?.coordinates?.length) {
            try {
                const bounds = L.latLngBounds(route.coordinates);
                map.fitBounds(bounds.pad(0.15), { animate: true, maxZoom: 15 });
            } catch {
                /* ignore */
            }
            return;
        }

        const pts: [number, number][] = [];
        if (user) pts.push([user.lat, user.lon]);
        for (const ev of events) pts.push([ev.point.lat, ev.point.lon]);

        try {
            if (pts.length === 0 && country) {
                map.setView([country.lat, country.lon], country.zoom, { animate: true });
                return;
            }
            if (pts.length === 0) return;
            if (pts.length === 1) {
                map.setView(pts[0], 13, { animate: true });
                return;
            }
            const bounds = L.latLngBounds(pts);
            map.fitBounds(bounds.pad(0.2), { animate: true, maxZoom: 14 });
        } catch {
            /* ignore */
        }

        const t = window.setTimeout(() => {
            try {
                map.invalidateSize({ animate: false });
            } catch {
                /* ignore */
            }
        }, 200);
        return () => window.clearTimeout(t);
    }, [map, user?.lat, user?.lon, eventKey, country?.code, route]);

    return null;
}

function formatDistanceKm(km: number): string {
    if (km < 1) return `${Math.round(km * 1000)} m away`;
    if (km < 10) return `${km.toFixed(1)} km away`;
    return `${Math.round(km)} km away`;
}

export function EventsNearMeMap({
    user,
    events,
    selectedId,
    onSelectEvent,
    onUserLocated,
    country,
    className,
}: Props) {
    const [baseLayer, setBaseLayer] = useState<BaseLayer>('street');
    const [travelMode, setTravelMode] = useState<TravelMode>('driving');
    const [route, setRoute] = useState<RouteResult | null>(null);
    const [origin, setOrigin] = useState<GeoPoint | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [userIcon] = useState(() => makePinIcon('#22c55e', 14));
    const [eventIcon] = useState(() => makePinIcon('#3b82f6', 12));
    const [selectedIcon] = useState(() => makePinIcon('#f59e0b', 14, 'rgba(245,158,11,.45)'));

    const selected = useMemo(
        () => events.find((e) => e.id === selectedId) ?? null,
        [events, selectedId]
    );

    const center = useMemo((): [number, number] => {
        if (selected) return [selected.point.lat, selected.point.lon];
        if (user) return [user.lat, user.lon];
        if (events[0]) return [events[0].point.lat, events[0].point.lon];
        if (country) return [country.lat, country.lon];
        return [-15.3875, 28.3228];
    }, [user, events, selected, country]);

    useEffect(() => {
        setRoute(null);
        setMsg('');
    }, [selectedId, travelMode]);

    const applyDirections = async () => {
        if (!selected) {
            setMsg('Select an event first.');
            return;
        }
        setBusy(true);
        setMsg('');
        try {
            const me = user ?? (await getBrowserPosition());
            setOrigin(me);
            onUserLocated?.(me);
            const r = await fetchRoute(me, selected.point, travelMode);
            if (!r) {
                setMsg(`Could not build a ${travelMode} route.`);
                setRoute(null);
                return;
            }
            setRoute(r);
            setMsg(`${r.distanceKm} km · ~${r.durationMin} min ${travelMode === 'walking' ? 'walk' : 'drive'}`);
        } catch (e) {
            setMsg(e instanceof Error ? e.message : 'Directions failed.');
            setRoute(null);
        } finally {
            setBusy(false);
        }
    };

    const clearRoute = () => {
        setRoute(null);
        setOrigin(null);
        setMsg('');
    };

    const chip =
        'px-2 py-1.5 bg-black/75 backdrop-blur-sm border text-[7px] sm:text-[8px] font-black uppercase tracking-widest disabled:opacity-50 shadow-lg';

    const showEmpty = !user && events.length === 0 && !country;

    if (showEmpty) {
        return (
            <div
                className={`h-56 border border-white/10 bg-white/[0.02] flex items-center justify-center ${className ?? ''}`}
            >
                <p className="text-[9px] uppercase tracking-widest text-white/35 text-center px-4">
                    Pick a country, allow location, or wait for event pins
                </p>
            </div>
        );
    }

    const you = origin ?? user;

    return (
        <div className={`space-y-1.5 ${className ?? ''}`}>
            <div className="relative h-56 w-full border border-white/10 overflow-hidden bg-neutral-950">
                <MapContainer
                    center={center}
                    zoom={country?.zoom ?? 12}
                    className="h-full w-full"
                    style={{ height: '100%', width: '100%', minHeight: 224, background: '#0a0a0a' }}
                    scrollWheelZoom={false}
                    attributionControl={false}
                >
                    {baseLayer === 'street' ? (
                        <TileLayer
                            key="street"
                            attribution='&copy; OpenStreetMap'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    ) : (
                        <TileLayer
                            key="satellite"
                            attribution="Tiles &copy; Esri"
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            maxZoom={19}
                        />
                    )}
                    <FitBounds user={you} events={events} country={country} route={route} />
                    {you ? (
                        <Marker position={[you.lat, you.lon]} icon={userIcon}>
                            <Popup>You are here</Popup>
                        </Marker>
                    ) : null}
                    {events.map((ev) => (
                        <Marker
                            key={ev.id}
                            position={[ev.point.lat, ev.point.lon]}
                            icon={ev.id === selectedId ? selectedIcon : eventIcon}
                            eventHandlers={{
                                click: () => onSelectEvent?.(ev.id),
                            }}
                        >
                            <Popup>
                                <div className="text-[11px] font-sans">
                                    <p className="font-bold m-0">{ev.name}</p>
                                    <p className="m-0 opacity-70 text-[10px]">{ev.location}</p>
                                    {ev.distanceKm != null ? (
                                        <p className="m-0 mt-1 text-[10px]">{formatDistanceKm(ev.distanceKm)}</p>
                                    ) : null}
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                    {route?.coordinates?.length ? (
                        <Polyline
                            positions={route.coordinates}
                            pathOptions={{
                                color: travelMode === 'walking' ? '#34d399' : '#3b82f6',
                                weight: 4,
                            }}
                        />
                    ) : null}
                </MapContainer>

                <div className="pointer-events-none absolute inset-0 z-[500] flex flex-col justify-between p-2">
                    <div className="pointer-events-auto flex flex-wrap justify-end gap-1 max-w-full">
                        <button
                            type="button"
                            onClick={() => setBaseLayer('street')}
                            className={`${chip} ${
                                baseLayer === 'street'
                                    ? 'border-white/50 text-white'
                                    : 'border-white/20 text-white/55 hover:text-white'
                            }`}
                        >
                            Street
                        </button>
                        <button
                            type="button"
                            onClick={() => setBaseLayer('satellite')}
                            className={`${chip} ${
                                baseLayer === 'satellite'
                                    ? 'border-amber-300/60 text-amber-100'
                                    : 'border-white/20 text-white/55 hover:text-white'
                            }`}
                        >
                            Satellite
                        </button>
                        <button
                            type="button"
                            onClick={() => setTravelMode('driving')}
                            className={`${chip} ${
                                travelMode === 'driving'
                                    ? 'border-blue-400/60 text-blue-100'
                                    : 'border-white/20 text-white/55 hover:text-white'
                            }`}
                        >
                            Drive
                        </button>
                        <button
                            type="button"
                            onClick={() => setTravelMode('walking')}
                            className={`${chip} ${
                                travelMode === 'walking'
                                    ? 'border-emerald-400/60 text-emerald-100'
                                    : 'border-white/20 text-white/55 hover:text-white'
                            }`}
                        >
                            Walk
                        </button>
                    </div>

                    <div className="pointer-events-auto space-y-1.5">
                        {msg ? (
                            <p className="px-2 py-1 bg-black/75 backdrop-blur-sm border border-white/15 text-[8px] font-mono text-white/80 w-fit max-w-full truncate">
                                {msg}
                            </p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-1">
                            <button
                                type="button"
                                disabled={busy || !selected}
                                onClick={() => void applyDirections()}
                                className={`${chip} border-blue-400/45 text-blue-100 hover:bg-blue-500/20`}
                            >
                                {busy ? 'Routing…' : 'Directions'}
                            </button>
                            {route || origin ? (
                                <button
                                    type="button"
                                    onClick={clearRoute}
                                    className={`${chip} border-white/25 text-white/70 hover:text-white`}
                                >
                                    Clear
                                </button>
                            ) : null}
                            <div className="flex gap-2 text-[8px] font-mono uppercase tracking-wider text-white/70 bg-black/70 px-2 py-1 border border-white/10">
                                <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> You
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Events
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <p className="text-[8px] text-white/25 leading-relaxed">
                {country ? `${country.name} · ` : ''}
                {baseLayer === 'satellite' ? 'Satellite' : 'Street'}
                {selected ? ` · Directions to ${selected.name}` : ' · Select an event for directions'}
            </p>
        </div>
    );
}
