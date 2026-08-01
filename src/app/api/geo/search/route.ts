import { NextResponse } from 'next/server';
import { GEO_COUNTRIES } from '@/lib/country-geo';

export const dynamic = 'force-dynamic';

const UA = 'GateProtocol/1.0 (https://gatefy.app; event geocoding)';

type Hit = { lat: number; lon: number; label: string };

async function nominatimSearch(params: URLSearchParams): Promise<Hit[]> {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    if (!Array.isArray(data)) return [];
    return data
        .map((hit) => {
            const lat = parseFloat(hit.lat);
            const lon = parseFloat(hit.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
            return { lat, lon, label: hit.display_name?.trim() || '' };
        })
        .filter((h): h is Hit => !!h && !!h.label);
}

function dedupe(hits: Hit[]): Hit[] {
    const seen = new Set<string>();
    const out: Hit[] = [];
    for (const h of hits) {
        const key = `${h.lat.toFixed(5)},${h.lon.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(h);
        if (out.length >= 8) break;
    }
    return out;
}

export async function GET(request: Request) {
    const sp = new URL(request.url).searchParams;
    const q = sp.get('q')?.trim() ?? '';
    const country = (sp.get('country') ?? '').trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);

    if (q.length < 2) {
        return NextResponse.json({ error: 'Query too short' }, { status: 400 });
    }

    try {
        const meta = country ? GEO_COUNTRIES[country] : undefined;
        const batches: Hit[][] = [];

        // 1) Query + country name (best for short place names like "East")
        if (meta?.name && !q.toLowerCase().includes(meta.name.toLowerCase())) {
            const p = new URLSearchParams({
                format: 'json',
                q: `${q}, ${meta.name}`,
                limit: '8',
                addressdetails: '0',
            });
            if (country) p.set('countrycodes', country);
            batches.push(await nominatimSearch(p));
        }

        // 2) Raw query restricted by countrycodes
        {
            const p = new URLSearchParams({
                format: 'json',
                q,
                limit: '8',
                addressdetails: '0',
            });
            if (country) p.set('countrycodes', country);
            batches.push(await nominatimSearch(p));
        }

        // 3) Viewbox-bounded search (stronger local bias)
        if (meta?.viewbox) {
            const p = new URLSearchParams({
                format: 'json',
                q: meta.name ? `${q}, ${meta.name}` : q,
                limit: '8',
                addressdetails: '0',
                viewbox: meta.viewbox,
                bounded: '1',
            });
            if (country) p.set('countrycodes', country);
            batches.push(await nominatimSearch(p));
        }

        const results = dedupe(batches.flat());
        if (!results.length) {
            return NextResponse.json({
                found: false,
                results: [],
                hint: meta?.name
                    ? `No places found in ${meta.name}. Try a fuller name (city + area) or pin on the map.`
                    : 'No places found. Try a fuller name or pin on the map.',
            });
        }
        return NextResponse.json({
            found: true,
            lat: results[0].lat,
            lon: results[0].lon,
            label: results[0].label,
            results,
        });
    } catch (e) {
        console.error('geo/search', e);
        return NextResponse.json(
            { error: 'Geocoding failed', found: false, results: [], hint: 'Search timed out. Try again or pin on the map.' },
            { status: 502 }
        );
    }
}
