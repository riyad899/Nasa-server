import { envVars } from "../../../config/env.js";
import { ImergError } from "./imerg.errors.js";
import { parseDas, parseDap2Coordinates, parseDap2Precipitation } from "./dap2.util.js";
import { DailyRainfall, GridCell, ImergOutput, ImergQuery } from "./imerg.interface.js";

const OPENDAP_BASE = "https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGDF.07";
const PRODUCT = "GPM_3IMERGDF_07";
const cache = new Map<string, { expires: number; value: DailyRainfall }>();
let coordinatesPromise: Promise<{ lons: number[]; lats: number[] }> | undefined;

const formatDate = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");
const dateLabel = (date: string) => `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
const datesBetween = (start: string, end: string) => {
    const dates: string[] = [];
    for (const cursor = new Date(`${dateLabel(start)}T00:00:00Z`); formatDate(cursor) <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(formatDate(cursor));
    return dates;
};
const fileUrl = (date: string) => `${OPENDAP_BASE}/${date.slice(0, 4)}/${date.slice(4, 6)}/3B-DAY.MS.MRG.3IMERG.${date}-S000000-E235959.V07B.nc4`;

const HARDCODED_TOKEN = "eyJ0eXAiOiJKV1QiLCJvcmlnaW4iOiJFYXJ0aGRhdGEgTG9naW4iLCJzaWciOiJlZGxqd3RwdWJrZXlfb3BzIiwiYWxnIjoiUlMyNTYifQ.eyJ0eXBlIjoiVXNlciIsInVpZCI6InJpeWFkdXM4OTkiLCJleHAiOjE3OTU0NjQyODksImlhdCI6MTc5MDI4MDI4OSwiaXNzIjoiaHR0cHM6Ly91cnMuZWFydGhkYXRhLm5hc2EuZ292IiwiaWRlbnRpdHlfcHJvdmlkZXIiOiJlZGxfb3BzIiwiYWNyIjoiZWRsIiwiYXNzdXJhbmNlX2xldmVsIjozfQ.pS3hnS6d6vf-ZstKA2q_AmavkwnVdSJHy5U9cPp1TGaIJEnzhWKg-u2QaLSZ_nNpkziAbUkw9IJpSVtVznKK74Iwmf2gWhsfR-7a8NAvb_N6M-J6NTXl0XsIF7X6woM_YzgKDw9K3VS_4ahyqlNd_X9Gob7upfnYlabVWkp51Q9xnYU5grzCw2HDn_Ql8uCZc93CSvfqfdj8rv97QFXOPs5ndOROfUgBx8oj6hkig_gv1XbvQup3PqXW3Djtl0akRtpYNHgJG5NjhcLyFSH76wNab69bAlvad4UPGhTDA05ttXGcDKCbIRKJ6cj0vWkFhmIxcfJ7bbVQFf1AdzRmVQ";

const getToken = () => envVars.IMERG.EARTHDATA_TOKEN || process.env.EARTHDATA_TOKEN || process.env.NASA_EARTHDATA_TOKEN || HARDCODED_TOKEN;
const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

async function nasaFetch(url: string): Promise<Response> {
    const token = getToken();
    if (!token) throw new ImergError("EARTHDATA_TOKEN_MISSING", "EARTHDATA_TOKEN is not configured");
    try {
        const response = await fetch(url, { headers: { ...authHeaders(), Accept: "application/octet-stream" }, signal: AbortSignal.timeout(45_000) });
        if (response.status === 401) throw new ImergError("EARTHDATA_AUTH_FAILED", "NASA Earthdata token is invalid or expired");
        if (response.status === 403) throw new ImergError("EARTHDATA_UNAUTHORIZED", "NASA Earthdata application access is not authorized");
        if (response.status === 429) throw new ImergError("NASA_RATE_LIMITED", "NASA rate limit exceeded", 60);
        if (response.status >= 500) throw new ImergError("NASA_SERVER_ERROR", `NASA returned HTTP ${response.status}`);
        return response;
    } catch (error) {
        if (error instanceof ImergError) throw error;
        if (error instanceof DOMException && error.name === "TimeoutError") throw new ImergError("IMERG_TIMEOUT", "NASA request timed out");
        throw new ImergError("NASA_SERVER_ERROR", "Unable to reach NASA GES DISC");
    }
}

async function getMetadata() {
    return {
        units: "mm/day",
        fillValue: -9999.9,
        doi: "10.5067/GPM/IMERGDF/DAY/07",
    };
}

async function getCoordinates() {
    if (!coordinatesPromise) {
        coordinatesPromise = Promise.resolve().then(() => {
            const lons: number[] = [];
            for (let i = 0; i < 3600; i++) lons.push(Number((-179.95 + i * 0.1).toFixed(2)));
            const lats: number[] = [];
            for (let j = 0; j < 1800; j++) lats.push(Number((-89.95 + j * 0.1).toFixed(2)));
            return { lons, lats };
        });
    }
    return coordinatesPromise;
}

function windowFor(values: number[], min: number, max: number) {
    const selected = values.map((value, index) => ({ value, index })).filter(({ value }) => value >= min && value <= max);
    if (!selected.length) throw new ImergError("REQUEST_TOO_LARGE", "Bounding box contains no grid cell centres");
    return { values: selected.map(({ value }) => value), start: selected[0].index, end: selected[selected.length - 1].index };
}

async function fetchDay(date: string, lons: number[], lats: number[], metadata: Awaited<ReturnType<typeof getMetadata>>, query: ImergQuery): Promise<DailyRainfall> {
    const cached = cache.get(`${date}:${query.latitudeMin}:${query.latitudeMax}:${query.longitudeMin}:${query.longitudeMax}`);
    if (cached && cached.expires > Date.now()) return cached.value;
    const lonWindow = windowFor(lons, query.longitudeMin, query.longitudeMax);
    const latWindow = windowFor(lats, query.latitudeMin, query.latitudeMax);
    const url = `${fileUrl(date)}.dods?precipitation[0:0][${lonWindow.start}:${lonWindow.end}][${latWindow.start}:${latWindow.end}]`;
    const response = await nasaFetch(url);
    if (response.status === 404) throw new ImergError("IMERG_DATA_UNAVAILABLE", `No IMERG data for ${date}`);
    const rawBuf = await response.arrayBuffer();
    let values: number[];
    try {
        values = parseDap2Precipitation(rawBuf);
    } catch (e) {
        const preview = new TextDecoder("latin1").decode(new Uint8Array(rawBuf).subarray(0, 500));
        console.error("DAP2 parse failure on URL:", url);
        console.error("Response preview:", preview);
        throw e;
    }
    const grid: GridCell[] = [];
    for (let lonIndex = 0; lonIndex < lonWindow.values.length; lonIndex += 1) {
        for (let latIndex = 0; latIndex < latWindow.values.length; latIndex += 1) {
            const rainfall = values[lonIndex * latWindow.values.length + latIndex];
            grid.push({ latitude: latWindow.values[latIndex], longitude: lonWindow.values[lonIndex], rainfall: !Number.isFinite(rainfall) || Math.abs(rainfall - metadata.fillValue) < 0.01 ? null : Number(rainfall.toFixed(3)) });
        }
    }
    const valid = grid.map((cell) => cell.rainfall).filter((value): value is number => value !== null);
    const weighted = grid.reduce((sum, cell) => sum + (cell.rainfall === null ? 0 : cell.rainfall * Math.cos(cell.latitude * Math.PI / 180)), 0);
    const weight = grid.reduce((sum, cell) => sum + (cell.rainfall === null ? 0 : Math.cos(cell.latitude * Math.PI / 180)), 0);
    const result = { date: dateLabel(date), summary: { meanRainfall: valid.length ? Number((weighted / weight).toFixed(3)) : null, maximumRainfall: valid.length ? Math.max(...valid) : null, minimumRainfall: valid.length ? Math.min(...valid) : null, validCells: valid.length, missingCells: grid.length - valid.length }, grid };
    cache.set(`${date}:${query.latitudeMin}:${query.latitudeMax}:${query.longitudeMin}:${query.longitudeMax}`, { expires: Date.now() + envVars.IMERG.CACHE_TTL_MS, value: result });
    return result;
}

export async function getImergRainfall(query: ImergQuery): Promise<ImergOutput> {
    const dates = datesBetween(query.start, query.end);
    const metadata = await getMetadata();
    const { lons, lats } = await getCoordinates();
    const lonWindow = windowFor(lons, query.longitudeMin, query.longitudeMax);
    const latWindow = windowFor(lats, query.latitudeMin, query.latitudeMax);
    if (dates.length > envVars.IMERG.MAX_DAYS || lonWindow.values.length * latWindow.values.length * dates.length > envVars.IMERG.MAX_CELL_DAYS) throw new ImergError("REQUEST_TOO_LARGE", "Requested period or grid is too large");
    const data: DailyRainfall[] = [];
    const missingDates: string[] = [];
    for (let index = 0; index < dates.length; index += 4) {
        const batch = await Promise.allSettled(dates.slice(index, index + 4).map((date) => fetchDay(date, lons, lats, metadata, query)));
        batch.forEach((result, batchIndex) => result.status === "fulfilled" ? data.push(result.value) : result.reason instanceof ImergError && result.reason.code === "IMERG_DATA_UNAVAILABLE" ? missingDates.push(dates[index + batchIndex]) : (() => { throw result.reason; })());
    }
    if (!data.length) throw new ImergError("IMERG_DATA_UNAVAILABLE", "No IMERG data is available for the requested period");
    data.sort((a, b) => a.date.localeCompare(b.date));
    const means = data.map((day) => day.summary.meanRainfall).filter((value): value is number => value !== null);
    const rainyDays = means.filter((value) => value >= envVars.IMERG.RAINY_DAY_MM).length;
    const heavyRainfallDays = means.filter((value) => value >= envVars.IMERG.HEAVY_RAIN_MM).length;
    const allCells = data.flatMap((day) => day.grid || []);
    const peakCell = allCells.reduce<{ date: string; latitude: number; longitude: number; rainfall: number } | null>((peak, cell, index) => cell.rainfall === null || (peak && peak.rainfall >= cell.rainfall) ? peak : { date: data[Math.floor(index / (lonWindow.values.length * latWindow.values.length))].date, latitude: cell.latitude, longitude: cell.longitude, rainfall: cell.rainfall }, null);
    const wettest = Math.max(...means); const driest = Math.min(...means);
    return { source: "NASA_GPM_IMERG", product: PRODUCT, variable: "precipitation", units: metadata.units, doi: metadata.doi, spatialResolution: `${Math.abs(lons[1] - lons[0])}° x ${Math.abs(lats[1] - lats[0])}°`, period: { start: query.start, end: query.end, days: dates.length, daysWithData: data.length }, region: { latitudeMin: query.latitudeMin, latitudeMax: query.latitudeMax, longitudeMin: query.longitudeMin, longitudeMax: query.longitudeMax }, gridInfo: { cells: lonWindow.values.length * latWindow.values.length, latitudes: latWindow.values.length, longitudes: lonWindow.values.length, cellCentreBounds: { latitudeMin: latWindow.values[0], latitudeMax: latWindow.values.at(-1)!, longitudeMin: lonWindow.values[0], longitudeMax: lonWindow.values.at(-1)! } }, statistics: { totalRainfall: Number(means.reduce((sum, value) => sum + value, 0).toFixed(3)), averageRainfall: Number((means.reduce((sum, value) => sum + value, 0) / means.length).toFixed(3)), maximumDailyRainfall: wettest, minimumDailyRainfall: driest, rainyDays, dryDays: data.length - rainyDays, heavyRainfallDays, heavyRainfallCellDays: allCells.filter((cell) => cell.rainfall !== null && cell.rainfall >= envVars.IMERG.HEAVY_RAIN_MM).length, wettestDay: { date: data.find((day) => day.summary.meanRainfall === wettest)!.date, rainfall: wettest }, driestDay: { date: data.find((day) => day.summary.meanRainfall === driest)!.date, rainfall: driest }, peakCell, thresholds: { rainyDayMm: envVars.IMERG.RAINY_DAY_MM, heavyRainMm: envVars.IMERG.HEAVY_RAIN_MM }, method: "Cosine-latitude weighted mean; fill values excluded" }, data: query.includeGrid ? data : data.map((day) => ({ date: day.date, summary: day.summary })), missingDates, warnings: missingDates.length ? ["Some dates are unavailable from NASA and were skipped"] : [], notes: ["IMERG Final Daily V07 via NASA GES DISC OPeNDAP", "Rainfall anomaly is not returned without a multi-year climatology"] };
}
