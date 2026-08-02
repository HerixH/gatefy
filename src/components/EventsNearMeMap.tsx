'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoPoint } from '@/lib/osm-location';

export type NearMeMapEvent = {
    id: string;
    name: string;
    location: string;
    point: GeoPoint;
    distanceKm?: number | null;
};

type Props = {
    user: GeoPoint | null;
    events: NearMeMapEvent[];
    selectedId?: string | null;
    onSelectEvent?: (id: string) => void;
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
}: {
    user: GeoPoint | null;
    events: NearMeMapEvent[];
}) {
    const map = useMap();
    useEffect(() => {
        const pts: [number, number][] = [];
        if (user) pts.push([user.lat, user.lon]);
        for (const ev of events) pts.push([ev.point.lat, ev.point.lon]);
        if (pts.length === 0) return;
        try {
            if (pts.length === 1) {
                map.setView(pts[0], 13, { animate: false });
                return;
            }
            const bounds = L.latLngBounds(pts);
            map.fitBounds(bounds.pad(0.2), { animate: false, maxZoom: 14 });
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
    }, [map, user?.lat, user?.lon, events]);
    return null;
}

export function EventsNearMeMap({ user, events, selectedId, onSelectEvent, className }: Props) {
    const [userIcon] = useState(() => makePinIcon('#22c55e', 14));
    const [eventIcon] = useState(() => makePinIcon('#3b82f6', 12));
    const [selectedIcon] = useState(() => makePinIcon('#f59e0b', 14, 'rgba(245,158,11,.45)'));

    const center = useMemo((): [number, number] => {
        if (user) return [user.lat, user.lon];
        if (events[0]) return [events[0].point.lat, events[0].point.lon];
        return [-15.3875, 28.3228]; // Lusaka fallback
    }, [user, events]);

    if (!user && events.length === 0) {
        return (
            <div
                className={`h-52 border border-white/10 bg-white/[0.02] flex items-center justify-center ${className ?? ''}`}
            >
                <p className="text-[9px] uppercase tracking-widest text-white/35 text-center px-4">
                    Allow location or wait for event pins to load
                </p>
            </div>
        );
    }

    return (
        <div className={`relative h-52 w-full border border-white/10 overflow-hidden ${className ?? ''}`}>
            <MapContainer
                center={center}
                zoom={12}
                className="h-full w-full"
                scrollWheelZoom={false}
                attributionControl={false}
            >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                <FitBounds user={user} events={events} />
                {user ? (
                    <Marker position={[user.lat, user.lon]} icon={userIcon}>
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
            </MapContainer>
            <div className="absolute bottom-2 left-2 z-[500] flex gap-2 text-[8px] font-mono uppercase tracking-wider text-white/70 bg-black/70 px-2 py-1 border border-white/10">
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> You
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Events
                </span>
            </div>
        </div>
    );
}

function formatDistanceKm(km: number): string {
    if (km < 1) return `${Math.round(km * 1000)} m away`;
    if (km < 10) return `${km.toFixed(1)} km away`;
    return `${Math.round(km)} km away`;
}
