export type GeoPoint = { lat: number; lon: number; label: string };

export type TravelMode = 'driving' | 'walking';

export type RouteResult = {
    mode: TravelMode;
    coordinates: [number, number][];
    distanceKm: number;
    durationMin: number;
};

export async function geocodeLocationQuery(
    query: string,
    countryCode?: string
): Promise<GeoPoint | null> {
    const q = query.trim();
    if (q.length < 2) return null;
    const params = new URLSearchParams({ q });
    if (countryCode?.trim()) params.set('country', countryCode.trim().toLowerCase());
    const res = await fetch(`/api/geo/search?${params}`, { cache: 'force-cache' });
    if (!res.ok) return null;
    const data = (await res.json()) as {
        found?: boolean;
        lat?: number;
        lon?: number;
        label?: string;
    };
    if (!data.found || data.lat == null || data.lon == null) return null;
    return { lat: data.lat, lon: data.lon, label: data.label || q };
}

export type PlaceSearchResponse = {
    results: GeoPoint[];
    hint?: string;
    error?: string;
};

export async function searchLocationQuery(
    query: string,
    countryCode?: string
): Promise<PlaceSearchResponse> {
    const q = query.trim();
    if (q.length < 2) return { results: [] };
    const params = new URLSearchParams({ q });
    if (countryCode?.trim()) params.set('country', countryCode.trim().toLowerCase());
    try {
        const res = await fetch(`/api/geo/search?${params}`, { cache: 'no-store' });
        const data = (await res.json()) as {
            found?: boolean;
            results?: GeoPoint[];
            lat?: number;
            lon?: number;
            label?: string;
            hint?: string;
            error?: string;
        };
        if (Array.isArray(data.results) && data.results.length) {
            return { results: data.results, hint: data.hint };
        }
        if (data.found && data.lat != null && data.lon != null) {
            return {
                results: [{ lat: data.lat, lon: data.lon, label: data.label || q }],
                hint: data.hint,
            };
        }
        return {
            results: [],
            hint: data.hint || data.error || 'No places found.',
            error: !res.ok ? data.error : undefined,
        };
    } catch {
        return { results: [], hint: 'Search failed. Try again or pin on the map.', error: 'network' };
    }
}

export async function fetchRoute(
    from: GeoPoint,
    to: GeoPoint,
    mode: TravelMode = 'driving'
): Promise<RouteResult | null> {
    const params = new URLSearchParams({
        fromLat: String(from.lat),
        fromLon: String(from.lon),
        toLat: String(to.lat),
        toLon: String(to.lon),
        mode,
    });
    const res = await fetch(`/api/geo/route?${params}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as RouteResult & { error?: string };
    if (!data.coordinates?.length) return null;
    return {
        mode: data.mode === 'walking' ? 'walking' : 'driving',
        coordinates: data.coordinates,
        distanceKm: data.distanceKm,
        durationMin: data.durationMin,
    };
}

/** @deprecated use fetchRoute */
export async function fetchDrivingRoute(from: GeoPoint, to: GeoPoint): Promise<RouteResult | null> {
    return fetchRoute(from, to, 'driving');
}

export function getBrowserPosition(): Promise<GeoPoint> {
    return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            reject(new Error('Geolocation is not available in this browser.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    label: 'Your location',
                });
            },
            () => reject(new Error('Could not read your location. Allow location access and try again.')),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
        );
    });
}

export function watchBrowserPosition(
    onUpdate: (point: GeoPoint) => void,
    onError?: (message: string) => void
): () => void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        onError?.('Geolocation is not available in this browser.');
        return () => {};
    }
    const id = navigator.geolocation.watchPosition(
        (pos) => {
            onUpdate({
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                label: 'Your location',
            });
        },
        () => onError?.('Could not follow your location. Allow location access and try again.'),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
}

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const x =
        Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

/** GPS → place name for filling the event location field. */
export async function reverseGeocodePoint(lat: number, lon: number): Promise<GeoPoint | null> {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    const res = await fetch(`/api/geo/reverse?${params}`, { cache: 'force-cache' });
    if (!res.ok) return null;
    const data = (await res.json()) as {
        found?: boolean;
        lat?: number;
        lon?: number;
        label?: string;
    };
    if (!data.found || data.lat == null || data.lon == null) return null;
    return {
        lat: data.lat,
        lon: data.lon,
        label: data.label || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    };
}

export async function fillLocationFromGps(): Promise<GeoPoint> {
    const me = await getBrowserPosition();
    const named = await reverseGeocodePoint(me.lat, me.lon);
    return named ?? {
        ...me,
        label: `${me.lat.toFixed(5)}, ${me.lon.toFixed(5)}`,
    };
}
