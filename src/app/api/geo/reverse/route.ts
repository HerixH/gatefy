import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const UA = 'GateProtocol/1.0 (https://gatefy.app; event reverse geocoding)';

export async function GET(request: Request) {
    const sp = new URL(request.url).searchParams;
    const lat = parseFloat(sp.get('lat') ?? '');
    const lon = parseFloat(sp.get('lon') ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({
            format: 'json',
            lat: String(lat),
            lon: String(lon),
            zoom: '16',
        })}`;
        const res = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': UA },
            next: { revalidate: 86400 },
        });
        if (!res.ok) {
            return NextResponse.json({ error: 'Reverse geocoding failed' }, { status: 502 });
        }
        const data = (await res.json()) as { display_name?: string };
        const label = data.display_name?.trim();
        if (!label) {
            return NextResponse.json({
                found: true,
                lat,
                lon,
                label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
            });
        }
        return NextResponse.json({ found: true, lat, lon, label });
    } catch (e) {
        console.error('geo/reverse', e);
        return NextResponse.json({ error: 'Reverse geocoding failed' }, { status: 500 });
    }
}
