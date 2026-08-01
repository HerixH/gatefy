import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Profile = 'driving' | 'walking';

function osrmProfile(mode: Profile): string {
    return mode === 'walking' ? 'foot' : 'driving';
}

export async function GET(request: Request) {
    const sp = new URL(request.url).searchParams;
    const fromLat = parseFloat(sp.get('fromLat') ?? '');
    const fromLon = parseFloat(sp.get('fromLon') ?? '');
    const toLat = parseFloat(sp.get('toLat') ?? '');
    const toLon = parseFloat(sp.get('toLon') ?? '');
    const modeRaw = (sp.get('mode') ?? 'driving').toLowerCase();
    const mode: Profile = modeRaw === 'walking' || modeRaw === 'walk' || modeRaw === 'foot' ? 'walking' : 'driving';

    if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) {
        return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    try {
        const url =
            `https://router.project-osrm.org/route/v1/${osrmProfile(mode)}/` +
            `${fromLon},${fromLat};${toLon},${toLat}` +
            `?overview=full&geometries=geojson`;
        const res = await fetch(url, { next: { revalidate: 0 } });
        if (!res.ok) {
            return NextResponse.json({ error: 'Routing failed' }, { status: 502 });
        }
        const data = (await res.json()) as {
            code?: string;
            routes?: Array<{
                distance: number;
                duration: number;
                geometry?: { coordinates?: [number, number][] };
            }>;
        };
        if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates?.length) {
            return NextResponse.json({ error: 'No route found' }, { status: 404 });
        }
        const route = data.routes[0];
        const coordinates = route.geometry!.coordinates!.map(
            ([lon, lat]) => [lat, lon] as [number, number]
        );
        return NextResponse.json({
            mode,
            coordinates,
            distanceKm: Math.round((route.distance / 1000) * 10) / 10,
            durationMin: Math.max(1, Math.round(route.duration / 60)),
        });
    } catch (e) {
        console.error('geo/route', e);
        return NextResponse.json({ error: 'Routing failed' }, { status: 500 });
    }
}
