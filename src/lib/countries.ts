/** ISO 3166-1 alpha-2 for Nominatim countrycodes + map overview. */
export type CountryOption = {
    code: string;
    name: string;
    /** Rough country view when no place is pinned yet. */
    lat: number;
    lon: number;
    zoom: number;
    /** Nominatim viewbox: left,top,right,bottom (lon/lat). */
    viewbox?: string;
};

export const COUNTRIES: CountryOption[] = [
    { code: 'FI', name: 'Finland', lat: 64.0, lon: 26.0, zoom: 5 },
    { code: 'SE', name: 'Sweden', lat: 62.2, lon: 15.5, zoom: 5 },
    { code: 'NO', name: 'Norway', lat: 64.5, lon: 11.0, zoom: 5 },
    { code: 'DK', name: 'Denmark', lat: 56.0, lon: 10.0, zoom: 6 },
    { code: 'EE', name: 'Estonia', lat: 58.6, lon: 25.0, zoom: 7 },
    { code: 'LV', name: 'Latvia', lat: 56.9, lon: 24.1, zoom: 7 },
    { code: 'LT', name: 'Lithuania', lat: 55.2, lon: 24.0, zoom: 7 },
    { code: 'DE', name: 'Germany', lat: 51.2, lon: 10.4, zoom: 5 },
    { code: 'FR', name: 'France', lat: 46.6, lon: 2.2, zoom: 5 },
    { code: 'GB', name: 'United Kingdom', lat: 54.5, lon: -3.4, zoom: 5 },
    { code: 'IE', name: 'Ireland', lat: 53.4, lon: -8.0, zoom: 6 },
    { code: 'NL', name: 'Netherlands', lat: 52.1, lon: 5.3, zoom: 7 },
    { code: 'BE', name: 'Belgium', lat: 50.5, lon: 4.5, zoom: 7 },
    { code: 'ES', name: 'Spain', lat: 40.4, lon: -3.7, zoom: 5 },
    { code: 'PT', name: 'Portugal', lat: 39.4, lon: -8.2, zoom: 6 },
    { code: 'IT', name: 'Italy', lat: 42.5, lon: 12.5, zoom: 5 },
    { code: 'CH', name: 'Switzerland', lat: 46.8, lon: 8.2, zoom: 7 },
    { code: 'AT', name: 'Austria', lat: 47.5, lon: 14.5, zoom: 6 },
    { code: 'PL', name: 'Poland', lat: 52.1, lon: 19.4, zoom: 5 },
    { code: 'CZ', name: 'Czechia', lat: 49.8, lon: 15.5, zoom: 6 },
    { code: 'AE', name: 'United Arab Emirates', lat: 24.0, lon: 54.0, zoom: 7 },
    { code: 'SA', name: 'Saudi Arabia', lat: 23.9, lon: 45.1, zoom: 5 },
    { code: 'QA', name: 'Qatar', lat: 25.3, lon: 51.2, zoom: 8 },
    { code: 'KE', name: 'Kenya', lat: -0.5, lon: 37.9, zoom: 6, viewbox: '33.9,5.0,41.9,-4.7' },
    { code: 'UG', name: 'Uganda', lat: 1.4, lon: 32.3, zoom: 7 },
    { code: 'TZ', name: 'Tanzania', lat: -6.4, lon: 34.9, zoom: 5 },
    { code: 'RW', name: 'Rwanda', lat: -1.9, lon: 29.9, zoom: 8 },
    { code: 'BI', name: 'Burundi', lat: -3.4, lon: 29.9, zoom: 8 },
    {
        code: 'ZM',
        name: 'Zambia',
        lat: -13.1,
        lon: 27.8,
        zoom: 6,
        viewbox: '21.999,-8.224,33.706,-18.079',
    },
    {
        code: 'ZW',
        name: 'Zimbabwe',
        lat: -19.0,
        lon: 29.2,
        zoom: 6,
        viewbox: '25.237,-15.609,33.056,-22.417',
    },
    { code: 'MW', name: 'Malawi', lat: -13.3, lon: 34.3, zoom: 6, viewbox: '32.67,-9.36,35.92,-17.13' },
    { code: 'MZ', name: 'Mozambique', lat: -18.7, lon: 35.5, zoom: 5 },
    { code: 'BW', name: 'Botswana', lat: -22.3, lon: 24.7, zoom: 6 },
    { code: 'NA', name: 'Namibia', lat: -22.9, lon: 18.5, zoom: 5 },
    { code: 'AO', name: 'Angola', lat: -12.3, lon: 17.9, zoom: 5 },
    { code: 'CD', name: 'DR Congo', lat: -2.9, lon: 23.7, zoom: 4 },
    { code: 'CG', name: 'Congo', lat: -0.8, lon: 15.2, zoom: 5 },
    { code: 'NG', name: 'Nigeria', lat: 9.1, lon: 8.7, zoom: 5 },
    { code: 'GH', name: 'Ghana', lat: 7.9, lon: -1.0, zoom: 6 },
    { code: 'CI', name: "Côte d'Ivoire", lat: 7.5, lon: -5.5, zoom: 6 },
    { code: 'SN', name: 'Senegal', lat: 14.5, lon: -14.5, zoom: 6 },
    { code: 'ET', name: 'Ethiopia', lat: 9.1, lon: 40.5, zoom: 5 },
    { code: 'ZA', name: 'South Africa', lat: -30.6, lon: 24.7, zoom: 5 },
    { code: 'EG', name: 'Egypt', lat: 26.8, lon: 30.8, zoom: 5 },
    { code: 'MA', name: 'Morocco', lat: 31.8, lon: -7.1, zoom: 5 },
    { code: 'US', name: 'United States', lat: 39.8, lon: -98.6, zoom: 4 },
    { code: 'CA', name: 'Canada', lat: 56.1, lon: -106.3, zoom: 3 },
    { code: 'MX', name: 'Mexico', lat: 23.6, lon: -102.5, zoom: 4 },
    { code: 'BR', name: 'Brazil', lat: -14.2, lon: -51.9, zoom: 3 },
    { code: 'AR', name: 'Argentina', lat: -38.4, lon: -63.6, zoom: 3 },
    { code: 'IN', name: 'India', lat: 20.6, lon: 78.9, zoom: 4 },
    { code: 'SG', name: 'Singapore', lat: 1.35, lon: 103.8, zoom: 11 },
    { code: 'MY', name: 'Malaysia', lat: 4.2, lon: 101.9, zoom: 5 },
    { code: 'ID', name: 'Indonesia', lat: -2.5, lon: 118.0, zoom: 4 },
    { code: 'PH', name: 'Philippines', lat: 12.9, lon: 121.8, zoom: 5 },
    { code: 'TH', name: 'Thailand', lat: 15.9, lon: 100.9, zoom: 5 },
    { code: 'VN', name: 'Vietnam', lat: 14.1, lon: 108.3, zoom: 5 },
    { code: 'JP', name: 'Japan', lat: 36.2, lon: 138.3, zoom: 5 },
    { code: 'KR', name: 'South Korea', lat: 36.5, lon: 127.9, zoom: 6 },
    { code: 'AU', name: 'Australia', lat: -25.3, lon: 133.8, zoom: 3 },
    { code: 'NZ', name: 'New Zealand', lat: -40.9, lon: 174.9, zoom: 5 },
].sort((a, b) => a.name.localeCompare(b.name));

export function findCountry(code: string): CountryOption | undefined {
    return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

/** Best-effort match from a saved location string (e.g. ends with country name). */
export function guessCountryFromLocation(location: string): string {
    const lower = location.toLowerCase();
    for (const c of COUNTRIES) {
        if (lower.includes(c.name.toLowerCase())) return c.code;
    }
    return '';
}
