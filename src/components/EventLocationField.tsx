'use client';

import { useEffect, useRef, useState } from 'react';
import { EventLocationMapLazy } from '@/components/EventLocationMapLazy';
import { COUNTRIES, findCountry, guessCountryFromLocation } from '@/lib/countries';
import { fillLocationFromGps, searchLocationQuery, type GeoPoint } from '@/lib/osm-location';

type Props = {
    value: string;
    onChange: (location: string) => void;
    variant?: 'create' | 'manage';
    id?: string;
};

/**
 * Country → place search (restricted) → map pin / GPS.
 * Custom country menu — native select renders as a blank white panel on Windows dark UI.
 */
export function EventLocationField({ value, onChange, variant = 'create', id }: Props) {
    const [countryCode, setCountryCode] = useState(() => guessCountryFromLocation(value));
    const [countryOpen, setCountryOpen] = useState(false);
    const [countryFilter, setCountryFilter] = useState('');
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<GeoPoint[]>([]);
    const [searchHint, setSearchHint] = useState('');
    const [searchBusy, setSearchBusy] = useState(false);
    const [gpsBusy, setGpsBusy] = useState(false);
    const [error, setError] = useState('');
    const [mapOpen, setMapOpen] = useState(true);
    const countryMenuRef = useRef<HTMLDivElement | null>(null);
    const searchSeq = useRef(0);

    const labelCls =
        variant === 'create'
            ? 'text-[9px] tracking-[0.3em] uppercase text-white/40 font-bold block'
            : 'text-[9px] uppercase tracking-widest text-white/35 font-bold';

    const inputClass =
        variant === 'create'
            ? 'w-full bg-neutral-950 border border-white/15 px-4 py-3.5 text-white text-sm font-mono placeholder:text-white/25 focus:outline-none focus:border-white/30 transition-all rounded-sm'
            : 'w-full bg-neutral-950 border border-white/15 px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/25';

    const country = countryCode ? findCountry(countryCode) : undefined;

    const filteredCountries = COUNTRIES.filter((c) =>
        !countryFilter.trim()
            ? true
            : c.name.toLowerCase().includes(countryFilter.trim().toLowerCase()) ||
              c.code.toLowerCase().includes(countryFilter.trim().toLowerCase())
    );

    useEffect(() => {
        if (!value.trim() || countryCode) return;
        const guess = guessCountryFromLocation(value);
        if (guess) setCountryCode(guess);
    }, [value, countryCode]);

    useEffect(() => {
        if (!countryOpen) return;
        const onDoc = (e: MouseEvent) => {
            if (!countryMenuRef.current?.contains(e.target as Node)) setCountryOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [countryOpen]);

    const runSearch = async (q: string) => {
        if (!countryCode || q.trim().length < 2) {
            setResults([]);
            setSearchHint('');
            return;
        }
        const seq = ++searchSeq.current;
        setSearchBusy(true);
        setSearchHint('');
        const res = await searchLocationQuery(q, countryCode);
        if (seq !== searchSeq.current) return;
        setResults(res.results);
        setSearchHint(res.results.length ? '' : res.hint || 'No places found.');
        setSearchBusy(false);
    };

    useEffect(() => {
        if (!countryCode || search.trim().length < 2) {
            setResults([]);
            setSearchHint('');
            return;
        }
        const t = window.setTimeout(() => {
            void runSearch(search);
        }, 400);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, countryCode]);

    const pickResult = (point: GeoPoint) => {
        onChange(point.label);
        setSearch('');
        setResults([]);
        setSearchHint('');
        setError('');
        setMapOpen(true);
    };

    const handleUseGps = async () => {
        if (!countryCode) {
            setError('Choose a country first.');
            return;
        }
        setGpsBusy(true);
        setError('');
        try {
            const point = await fillLocationFromGps();
            const c = findCountry(countryCode);
            if (c && !point.label.toLowerCase().includes(c.name.toLowerCase())) {
                setError(
                    `Your GPS looks outside ${c.name}. Move into that country, or pin on the map instead.`
                );
                return;
            }
            onChange(point.label);
            setMapOpen(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'GPS failed.');
        } finally {
            setGpsBusy(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <span className={labelCls}>Location</span>
                <span className="text-[8px] uppercase tracking-widest text-white/25 font-bold">
                    Country · Search · Pin
                </span>
            </div>

            <div className="space-y-1.5" ref={countryMenuRef}>
                <label className={labelCls}>Country *</label>
                <button
                    type="button"
                    id={`${id ?? 'loc'}-country`}
                    onClick={() => setCountryOpen((o) => !o)}
                    className={`${inputClass} text-left flex items-center justify-between gap-3`}
                >
                    <span className={country ? 'text-white' : 'text-white/35'}>
                        {country ? country.name : 'Select country…'}
                    </span>
                    <span className="text-[8px] uppercase tracking-widest text-white/35">
                        {countryOpen ? 'Close' : 'Open'}
                    </span>
                </button>
                {countryOpen ? (
                    <div className="border border-white/15 bg-neutral-950 shadow-2xl max-h-56 flex flex-col">
                        <input
                            type="search"
                            value={countryFilter}
                            onChange={(e) => setCountryFilter(e.target.value)}
                            placeholder="Filter countries…"
                            className="w-full bg-black border-b border-white/10 px-3 py-2.5 text-white text-sm font-mono placeholder:text-white/25 focus:outline-none"
                            autoFocus
                        />
                        <ul className="overflow-y-auto max-h-44">
                            {filteredCountries.map((c) => (
                                <li key={c.code}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCountryCode(c.code);
                                            setCountryOpen(false);
                                            setCountryFilter('');
                                            setResults([]);
                                            setSearch('');
                                            setError('');
                                            setMapOpen(true);
                                        }}
                                        className={`w-full text-left px-3 py-2.5 text-sm font-mono hover:bg-white/10 ${
                                            c.code === countryCode ? 'text-blue-300 bg-white/[0.04]' : 'text-white/75'
                                        }`}
                                    >
                                        {c.name}
                                    </button>
                                </li>
                            ))}
                            {filteredCountries.length === 0 ? (
                                <li className="px-3 py-4 text-[10px] text-white/35 text-center">No countries match</li>
                            ) : null}
                        </ul>
                    </div>
                ) : null}
            </div>

            <div className="space-y-1.5">
                <label htmlFor={id} className={labelCls}>
                    Search place
                </label>
                <div className="flex gap-2">
                    <input
                        id={id}
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void runSearch(search);
                            }
                        }}
                        disabled={!countryCode}
                        placeholder={
                            countryCode
                                ? `e.g. East Park, Lusaka — only in ${country?.name ?? 'country'}`
                                : 'Select a country first'
                        }
                        className={`${inputClass} disabled:opacity-40`}
                        autoComplete="off"
                    />
                    <button
                        type="button"
                        disabled={!countryCode || search.trim().length < 2 || searchBusy}
                        onClick={() => void runSearch(search)}
                        className="shrink-0 px-3 py-2 border border-blue-400/40 text-blue-200 text-[8px] font-black uppercase tracking-widest hover:bg-blue-500/10 disabled:opacity-40"
                    >
                        {searchBusy ? '…' : 'Search'}
                    </button>
                </div>
                {searchBusy ? (
                    <p className="text-[8px] uppercase tracking-widest text-white/30">Searching in {country?.name}…</p>
                ) : null}
                {results.length > 0 ? (
                    <ul className="border border-white/15 bg-neutral-950 divide-y divide-white/[0.06] max-h-48 overflow-y-auto">
                        {results.map((r) => (
                            <li key={`${r.lat}-${r.lon}-${r.label}`}>
                                <button
                                    type="button"
                                    onClick={() => pickResult(r)}
                                    className="w-full text-left px-3 py-2.5 text-[11px] text-white/80 hover:bg-white/[0.08] hover:text-white"
                                >
                                    {r.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : search.trim().length >= 2 && !searchBusy && searchHint ? (
                    <p className="text-[10px] text-amber-200/80 leading-relaxed border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
                        {searchHint}
                    </p>
                ) : null}
                {value.trim() ? (
                    <p className="text-[10px] font-mono text-emerald-200/70 leading-relaxed break-words" title={value}>
                        Selected · {value}
                    </p>
                ) : (
                    <p className="text-[9px] text-white/30">
                        Type a place, tap Search, pick a result — or pin on the map.
                    </p>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={gpsBusy || !countryCode}
                    onClick={handleUseGps}
                    className="px-3 py-2 border border-emerald-400/35 text-emerald-200/90 text-[8px] font-black uppercase tracking-widest hover:bg-emerald-500/10 disabled:opacity-40"
                >
                    {gpsBusy ? 'Getting GPS…' : 'Use my GPS'}
                </button>
                <button
                    type="button"
                    disabled={!countryCode}
                    onClick={() => setMapOpen((o) => !o)}
                    className="px-3 py-2 border border-blue-400/35 text-blue-200/90 text-[8px] font-black uppercase tracking-widest hover:bg-blue-500/10 disabled:opacity-40"
                >
                    {mapOpen ? 'Hide map' : 'Show map'}
                </button>
                {value.trim() ? (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        className="px-3 py-2 border border-white/15 text-white/45 text-[8px] font-black uppercase tracking-widest hover:text-white"
                    >
                        Clear place
                    </button>
                ) : null}
            </div>

            {error ? <p className="text-[9px] text-red-300/90 font-mono">{error}</p> : null}

            {!countryCode ? (
                <div className="h-36 border border-dashed border-white/15 bg-neutral-950/80 flex flex-col items-center justify-center gap-2 px-4">
                    <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Country first</p>
                    <p className="text-[10px] text-white/35 text-center leading-relaxed max-w-xs">
                        Choose a country, then search a place or open the map and tap to pin the GPS location.
                    </p>
                </div>
            ) : mapOpen ? (
                <EventLocationMapLazy
                    location={value}
                    countryCode={countryCode}
                    allowPin
                    onPinned={(point) => {
                        onChange(point.label);
                        setError('');
                    }}
                />
            ) : (
                <p className="text-[9px] text-white/30">Map hidden — tap Show map to search / pin.</p>
            )}
        </div>
    );
}
