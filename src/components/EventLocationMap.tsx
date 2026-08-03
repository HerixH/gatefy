'use client';

import { useEffect, useRef, useState } from 'react';
import {
    MapContainer,
    TileLayer,
    Marker,
    Polyline,
    Popup,
    useMap,
    useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { findCountry } from '@/lib/countries';
import {
    distanceMeters,
    fetchRoute,
    geocodeLocationQuery,
    getBrowserPosition,
    reverseGeocodePoint,
    watchBrowserPosition,
    type GeoPoint,
    type RouteResult,
    type TravelMode,
} from '@/lib/osm-location';

type Props = {
    location: string;
    /** ISO2 — restricts geocode and sets country overview. */
    countryCode?: string;
    /** Allow tap/click on map to drop the venue pin. */
    allowPin?: boolean;
    onPinned?: (point: GeoPoint) => void;
    compact?: boolean;
    className?: string;
};

type BaseLayer = 'street' | 'satellite';

function safeMapOp(map: L.Map, fn: () => void) {
    try {
        const el = map.getContainer();
        if (!el || !el.isConnected) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(map as any)._loaded) return;
        fn();
    } catch {
        // Ignore teardown races.
    }
}

function MapClickPin({
    enabled,
    onPin,
}: {
    enabled: boolean;
    onPin: (lat: number, lon: number) => void;
}) {
    useMapEvents({
        click(e) {
            if (!enabled) return;
            onPin(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

/** Modal / flex layouts often leave Leaflet at 0×0 → white blank map. */
function FixMapSize() {
    const map = useMap();
    useEffect(() => {
        const run = () => safeMapOp(map, () => map.invalidateSize({ animate: false }));
        run();
        const t1 = window.setTimeout(run, 80);
        const t2 = window.setTimeout(run, 300);
        const t3 = window.setTimeout(run, 700);
        const el = map.getContainer();
        const parent = el?.parentElement;
        let ro: ResizeObserver | undefined;
        if (parent && typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => run());
            ro.observe(parent);
        }
        window.addEventListener('resize', run);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.clearTimeout(t3);
            ro?.disconnect();
            window.removeEventListener('resize', run);
        };
    }, [map]);
    return null;
}

function MapViewport({
    destination,
    origin,
    route,
    follow,
    fallback,
}: {
    destination: GeoPoint | null;
    origin: GeoPoint | null;
    route: RouteResult | null;
    follow: boolean;
    fallback: { lat: number; lon: number; zoom: number };
}) {
    const map = useMap();
    const followRef = useRef(follow);
    followRef.current = follow;

    useEffect(() => {
        const id = window.requestAnimationFrame(() => {
            safeMapOp(map, () => {
                map.invalidateSize({ animate: false });
                if (followRef.current && origin) {
                    map.setView([origin.lat, origin.lon], Math.max(map.getZoom(), 16), { animate: false });
                    return;
                }
                if (route?.coordinates?.length) {
                    map.fitBounds(L.latLngBounds(route.coordinates), { padding: [36, 36], animate: false });
                    return;
                }
                if (origin && destination) {
                    map.fitBounds(
                        L.latLngBounds([
                            [origin.lat, origin.lon],
                            [destination.lat, destination.lon],
                        ]),
                        { padding: [40, 40], animate: false }
                    );
                    return;
                }
                if (destination) {
                    map.setView([destination.lat, destination.lon], 14, { animate: false });
                    return;
                }
                map.setView([fallback.lat, fallback.lon], fallback.zoom, { animate: false });
            });
        });
        return () => window.cancelAnimationFrame(id);
    }, [
        map,
        destination?.lat,
        destination?.lon,
        origin,
        route,
        follow,
        fallback.lat,
        fallback.lon,
        fallback.zoom,
    ]);

    useEffect(() => {
        if (!follow || !origin) return;
        safeMapOp(map, () => {
            map.panTo([origin.lat, origin.lon], { animate: true, duration: 0.35 });
        });
    }, [map, follow, origin?.lat, origin?.lon]);

    return null;
}

function makePinIcon(color: string, size: number) {
    return L.divIcon({
        className: 'gatefy-map-pin',
        html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

function modeLabel(mode: TravelMode) {
    return mode === 'walking' ? 'walk' : 'drive';
}

export function EventLocationMap({
    location,
    countryCode,
    allowPin,
    onPinned,
    compact,
    className,
}: Props) {
    const country = countryCode ? findCountry(countryCode) : undefined;
    const fallback = country
        ? { lat: country.lat, lon: country.lon, zoom: country.zoom }
        : { lat: 20, lon: 0, zoom: 2 };

    const [dest, setDest] = useState<GeoPoint | null>(null);
    const [origin, setOrigin] = useState<GeoPoint | null>(null);
    const [route, setRoute] = useState<RouteResult | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
    const [busy, setBusy] = useState(false);
    const [pinBusy, setPinBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [query, setQuery] = useState(location.trim());
    const [baseLayer, setBaseLayer] = useState<BaseLayer>('street');
    const [travelMode, setTravelMode] = useState<TravelMode>('driving');
    const [following, setFollowing] = useState(false);
    const [pinMode, setPinMode] = useState(!!allowPin);
    const [destIcon] = useState(() => makePinIcon('#3b82f6', 14));
    const [originIcon] = useState(() => makePinIcon('#22c55e', 12));
    const [mapReady, setMapReady] = useState(false);
    const hostRef = useRef<HTMLDivElement | null>(null);
    const lastRouteAt = useRef(0);
    const lastRouteFrom = useRef<GeoPoint | null>(null);
    const destRef = useRef<GeoPoint | null>(null);
    const modeRef = useRef<TravelMode>(travelMode);
    destRef.current = dest;
    modeRef.current = travelMode;

    useEffect(() => {
        setPinMode(!!allowPin);
    }, [allowPin]);

    useEffect(() => {
        const t = window.setTimeout(() => setQuery(location.trim()), 500);
        return () => window.clearTimeout(t);
    }, [location]);

    useEffect(() => {
        let cancelled = false;
        if (query.length < 2) {
            // Country-only view: map stays usable for pin.
            setStatus('ready');
            setDest(null);
            setOrigin(null);
            setRoute(null);
            setMsg(allowPin ? 'Tap the map to pin the venue' : '');
            setFollowing(false);
            return;
        }
        setStatus((s) => (s === 'ready' ? 'ready' : 'loading'));
        setOrigin(null);
        setRoute(null);
        setMsg('');
        setFollowing(false);
        geocodeLocationQuery(query, countryCode)
            .then((point) => {
                if (cancelled) return;
                if (!point) {
                    setStatus(country ? 'ready' : 'missing');
                    setDest(null);
                    setMsg('No match in this country — try another search or pin on the map.');
                    return;
                }
                setDest(point);
                setStatus('ready');
            })
            .catch(() => {
                if (!cancelled) {
                    setStatus(country ? 'ready' : 'error');
                    setDest(null);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [query, countryCode, country, allowPin]);

    useEffect(() => {
        if (!following || !dest) return;
        const stop = watchBrowserPosition(
            (point) => {
                setOrigin(point);
                const to = destRef.current;
                if (!to) return;
                const now = Date.now();
                const movedFar =
                    !lastRouteFrom.current || distanceMeters(lastRouteFrom.current, point) > 35;
                const stale = now - lastRouteAt.current > 20000;
                if (!movedFar && !stale) return;
                lastRouteAt.current = now;
                lastRouteFrom.current = point;
                void fetchRoute(point, to, modeRef.current).then((r) => {
                    if (!r) return;
                    setRoute(r);
                    setMsg(
                        `Following · ${r.distanceKm} km · ~${r.durationMin} min ${modeLabel(r.mode)}`
                    );
                });
            },
            (err) => {
                setMsg(err);
                setFollowing(false);
            }
        );
        return stop;
    }, [following, dest]);

    useEffect(() => {
        if (!origin || !dest || !route) return;
        if (route.mode === travelMode) return;
        let cancelled = false;
        void fetchRoute(origin, dest, travelMode).then((r) => {
            if (cancelled || !r) return;
            setRoute(r);
            lastRouteAt.current = Date.now();
            lastRouteFrom.current = origin;
            setMsg(
                `${following ? 'Following · ' : ''}${r.distanceKm} km · ~${r.durationMin} min ${modeLabel(r.mode)}`
            );
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [travelMode]);

    const height = compact ? 'h-40' : 'h-64 sm:h-72';
    const minHeightPx = compact ? 160 : 208;

    // Wait until the host has real pixels (modal animation / post-geocode mount).
    // Host is not mounted during the early "loading" return — keep polling until it appears.
    useEffect(() => {
        setMapReady(false);
        let cancelled = false;
        const tryReady = () => {
            if (cancelled) return false;
            const el = hostRef.current;
            if (el && el.clientWidth > 40 && el.clientHeight > 40) {
                setMapReady(true);
                return true;
            }
            return false;
        };
        if (tryReady()) return;
        const id = window.setInterval(() => {
            if (tryReady()) window.clearInterval(id);
        }, 50);
        const t = window.setTimeout(() => {
            window.clearInterval(id);
            // Force mount once host exists (even if size probe failed); FixMapSize handles resize.
            if (!cancelled && hostRef.current) setMapReady(true);
        }, 1200);
        return () => {
            cancelled = true;
            window.clearInterval(id);
            window.clearTimeout(t);
        };
    }, [countryCode, location, compact, status]);

    const handleMapPin = async (lat: number, lon: number) => {
        if (!pinMode || pinBusy) return;
        setPinBusy(true);
        setMsg('Pinning…');
        try {
            const named = await reverseGeocodePoint(lat, lon);
            const point: GeoPoint = named ?? {
                lat,
                lon,
                label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
            };
            // Soft country check: if reverse label doesn't include country name, still allow but note.
            if (country && !point.label.toLowerCase().includes(country.name.toLowerCase())) {
                setMsg(`Pinned — confirm this is in ${country.name}.`);
            } else {
                setMsg('Venue pinned');
            }
            setDest(point);
            setOrigin(null);
            setRoute(null);
            setFollowing(false);
            onPinned?.(point);
        } catch {
            setMsg('Could not pin that spot.');
        } finally {
            setPinBusy(false);
        }
    };

    const applyRoute = async (mode: TravelMode, startFollow: boolean) => {
        if (!dest) {
            setMsg('Pin or search a place first.');
            return;
        }
        setBusy(true);
        setMsg('');
        try {
            const me = await getBrowserPosition();
            setOrigin(me);
            const r = await fetchRoute(me, dest, mode);
            if (!r) {
                setMsg(`Could not build a ${modeLabel(mode)} route. The pin is still on the map.`);
                setRoute(null);
                setFollowing(false);
                return;
            }
            setRoute(r);
            lastRouteAt.current = Date.now();
            lastRouteFrom.current = me;
            setMsg(`${r.distanceKm} km · about ${r.durationMin} min ${modeLabel(r.mode)}`);
            setFollowing(startFollow);
        } catch (e) {
            setMsg(e instanceof Error ? e.message : 'Directions failed.');
            setRoute(null);
            setFollowing(false);
        } finally {
            setBusy(false);
        }
    };

    const clearRoute = () => {
        setFollowing(false);
        setOrigin(null);
        setRoute(null);
        setMsg('');
        lastRouteFrom.current = null;
    };

    if (status === 'loading' && !dest && !country) {
        return (
            <div className={`${height} border border-white/10 bg-white/[0.02] flex items-center justify-center ${className ?? ''}`}>
                <p className="text-[9px] uppercase tracking-widest text-white/35 animate-pulse">Loading map…</p>
            </div>
        );
    }

    if (status === 'error' && !dest && !country) {
        return (
            <div className={`${height} border border-white/10 bg-white/[0.02] flex items-center justify-center px-4 ${className ?? ''}`}>
                <p className="text-[10px] text-white/40 text-center leading-relaxed">
                    Map could not load for this location.
                </p>
            </div>
        );
    }

    if (status === 'missing' && !dest && !country) {
        return (
            <div className={`${height} border border-white/10 bg-white/[0.02] flex items-center justify-center px-4 ${className ?? ''}`}>
                <p className="text-[10px] text-white/40 text-center leading-relaxed">
                    Could not place this location on the map. Choose a country, search, or pin on the map.
                </p>
            </div>
        );
    }

    const chip =
        'px-2 py-1.5 bg-black/75 backdrop-blur-sm border text-[7px] sm:text-[8px] font-black uppercase tracking-widest disabled:opacity-50 shadow-lg';

    const mapCenter = dest ?? fallback;

    return (
        <div className={`space-y-1.5 ${className ?? ''}`}>
            <div
                ref={hostRef}
                className={`gatefy-map-host ${height} border border-white/10 overflow-hidden relative isolate bg-neutral-950 ${
                    pinMode ? 'cursor-crosshair' : ''
                }`}
                style={{ minHeight: minHeightPx }}
            >
                {!mapReady ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
                        <p className="text-[9px] uppercase tracking-widest text-white/35 animate-pulse">
                            Preparing map…
                        </p>
                    </div>
                ) : (
                <MapContainer
                    key={`map-${countryCode ?? 'world'}`}
                    center={[mapCenter.lat, mapCenter.lon]}
                    zoom={dest ? 14 : fallback.zoom}
                    scrollWheelZoom={!compact}
                    className="gatefy-leaflet-map h-full w-full"
                    style={{ height: '100%', width: '100%', minHeight: minHeightPx, background: '#0a0a0a' }}
                >
                    <FixMapSize />
                    {baseLayer === 'street' ? (
                        <TileLayer
                            key="street"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    ) : (
                        <TileLayer
                            key="satellite"
                            attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics"
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            maxZoom={19}
                        />
                    )}
                    {dest ? (
                        <Marker position={[dest.lat, dest.lon]} icon={destIcon}>
                            <Popup>
                                <span className="text-xs">{dest.label}</span>
                            </Popup>
                        </Marker>
                    ) : null}
                    {origin ? (
                        <Marker position={[origin.lat, origin.lon]} icon={originIcon}>
                            <Popup>{following ? 'Following you' : 'Your location'}</Popup>
                        </Marker>
                    ) : null}
                    {route?.coordinates?.length ? (
                        <Polyline
                            positions={route.coordinates}
                            pathOptions={{
                                color: travelMode === 'walking' ? '#34d399' : '#3b82f6',
                                weight: 4,
                            }}
                        />
                    ) : null}
                    <MapClickPin enabled={pinMode && !following} onPin={handleMapPin} />
                    <MapViewport
                        destination={dest}
                        origin={origin}
                        route={route}
                        follow={following}
                        fallback={fallback}
                    />
                </MapContainer>
                )}

                {/* Compact (event detail) = map preview only — no chrome that can stack over the modal */}
                {!compact ? (
                    <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col justify-between p-2 sm:p-2.5">
                        <div className="flex items-start justify-end gap-1.5">
                            {following ? (
                                <div className="pointer-events-none shrink-0 self-start px-2 py-1.5 bg-emerald-950/85 border border-emerald-400/50 text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-emerald-200">
                                    Live · {modeLabel(travelMode)}
                                </div>
                            ) : null}
                            <div className="pointer-events-auto flex flex-wrap justify-end gap-1 max-w-[90%]">
                                {allowPin ? (
                                    <button
                                        type="button"
                                        onClick={() => setPinMode((p) => !p)}
                                        className={`${chip} ${
                                            pinMode
                                                ? 'border-fuchsia-400/60 text-fuchsia-100'
                                                : 'border-white/20 text-white/55 hover:text-white'
                                        }`}
                                    >
                                        {pinMode ? 'Pin on' : 'Pin'}
                                    </button>
                                ) : null}
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
                        </div>

                        <div className="pointer-events-auto space-y-1.5">
                            {msg ? (
                                <p className="px-2 py-1 bg-black/75 backdrop-blur-sm border border-white/15 text-[8px] font-mono text-white/80 w-fit max-w-full truncate">
                                    {msg}
                                </p>
                            ) : null}
                            <div className="flex flex-wrap gap-1">
                                <button
                                    type="button"
                                    disabled={busy || !dest}
                                    onClick={() => void applyRoute(travelMode, false)}
                                    className={`${chip} border-blue-400/45 text-blue-100 hover:bg-blue-500/20`}
                                >
                                    {busy && !following ? 'Routing…' : 'Directions'}
                                </button>
                                <button
                                    type="button"
                                    disabled={busy || !dest}
                                    onClick={() => {
                                        if (following) {
                                            setFollowing(false);
                                            setMsg(
                                                route
                                                    ? `${route.distanceKm} km · ~${route.durationMin} min ${modeLabel(route.mode)}`
                                                    : ''
                                            );
                                            return;
                                        }
                                        void applyRoute(travelMode, true);
                                    }}
                                    className={`${chip} ${
                                        following
                                            ? 'border-amber-400/50 text-amber-100 hover:bg-amber-500/20'
                                            : 'border-emerald-400/45 text-emerald-100 hover:bg-emerald-500/20'
                                    }`}
                                >
                                    {following ? 'Stop' : 'Follow'}
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
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
            {!compact ? (
                <p className="text-[8px] text-white/25 leading-relaxed truncate" title={dest?.label ?? country?.name}>
                    {country ? `${country.name} · ` : ''}
                    {baseLayer === 'satellite' ? 'Satellite' : 'Street'}
                    {dest ? ` · ${dest.label}` : pinMode ? ' · tap map to pin' : ''}
                </p>
            ) : null}
        </div>
    );
}
