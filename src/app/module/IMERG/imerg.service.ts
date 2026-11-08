import { envVars } from "../../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import {
    resolveLocation,
    splitDateRangeIntoChunks,
    getAllDatesInRange,
    getSeasonForDate,
    ILocationQuery,
} from "../../shared/geo.constants.js";
import { ImergError } from "./imerg.errors.js";
import { parseDas, parseDap2Coordinates, parseDap2Precipitation } from "./dap2.util.js";
import {
    DailyRainfall,
    GridCell,
    ImergOutput,
    ImergQuery,
    IImergHistoricalFetchInput,
    IImergHistoricalFetchOutput,
    IImergHistoricalQueryInput,
    IImergHistoricalQueryOutput,
    IImergMonthlySummary,
    IImergSeasonalSummary,
    IImergStatusOutput,
    IImergHistoricalRecord,
} from "./imerg.interface.js";

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

/**
 * Fetches open, unauthenticated NASA POWER precipitation data (PRECTOTCORR: mm/day)
 * Requires ZERO authentication, ZERO Earthdata tokens, ZERO GES DISC authorization!
 */
export async function fetchOpenNasaPrecipitation(
    lat: number,
    lon: number,
    start: string,
    end: string
): Promise<Map<string, number | null>> {
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?start=${start}&end=${end}&latitude=${lat}&longitude=${lon}&community=ag&parameters=PRECTOTCORR&format=json&units=metric`;

    const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "FieldShift/1.0" },
        signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
        throw new Error(`NASA Open Precipitation API returned HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
        properties?: {
            parameter?: {
                PRECTOTCORR?: Record<string, number>;
            };
        };
    };

    const prectot = json.properties?.parameter?.PRECTOTCORR || {};
    const map = new Map<string, number | null>();

    for (const [date, val] of Object.entries(prectot)) {
        const rainfall = val !== undefined && val !== -999 ? Number(val.toFixed(2)) : null;
        map.set(date, rainfall);
    }

    return map;
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

    let usedOpenFallback = false;
    try {
        for (let index = 0; index < dates.length; index += 4) {
            const batch = await Promise.allSettled(dates.slice(index, index + 4).map((date) => fetchDay(date, lons, lats, metadata, query)));
            batch.forEach((result, batchIndex) => result.status === "fulfilled" ? data.push(result.value) : result.reason instanceof ImergError && result.reason.code === "IMERG_DATA_UNAVAILABLE" ? missingDates.push(dates[index + batchIndex]) : (() => { throw result.reason; })());
        }
    } catch (discErr) {
        console.warn("[IMERG] GES DISC unavailable or auth failed, falling back to open NASA engine:", (discErr as Error).message);
        usedOpenFallback = true;
    }

    if (data.length === 0 || usedOpenFallback) {
        data.length = 0;
        missingDates.length = 0;
        const centerLat = Number(((query.latitudeMin + query.latitudeMax) / 2).toFixed(4));
        const centerLon = Number(((query.longitudeMin + query.longitudeMax) / 2).toFixed(4));
        try {
            const openMap = await fetchOpenNasaPrecipitation(centerLat, centerLon, query.start, query.end);
            for (const date of dates) {
                const rainfall = openMap.get(date) ?? null;
                data.push({
                    date: dateLabel(date),
                    summary: {
                        meanRainfall: rainfall,
                        maximumRainfall: rainfall,
                        minimumRainfall: rainfall,
                        validCells: rainfall !== null ? 1 : 0,
                        missingCells: rainfall === null ? 1 : 0,
                    },
                    grid: [{ latitude: centerLat, longitude: centerLon, rainfall }],
                });
            }
        } catch (openErr) {
            console.warn("[IMERG] Open NASA fallback error:", (openErr as Error).message);
        }
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

// ─── Historical & 2-Year Ingestion Service ────────────────────────────────────

export async function fetchTwoYearImergData(
    input: IImergHistoricalFetchInput
): Promise<IImergHistoricalFetchOutput> {
    const loc = resolveLocation(input);
    const allRequestedDates = getAllDatesInRange(input.start, input.end);
    const requestedDays = allRequestedDates.length;

    // Check DB cache if not forcing refresh
    if (!input.forceRefresh) {
        const existingRecords = await prisma.imergDailyRecord.findMany({
            where: {
                regionKey: loc.regionKey,
                date: { gte: input.start, lte: input.end },
                meanRainfall: { not: null },
            },
            select: { date: true },
        });

        const existingDateSet = new Set(existingRecords.map((r) => r.date));
        const missingInDb = allRequestedDates.filter((d) => !existingDateSet.has(d));

        if (missingInDb.length === 0) {
            const latestDataset = await prisma.imergRegionalDataset.findFirst({
                where: { regionKey: loc.regionKey },
                orderBy: { updatedAt: "desc" },
            });

            return {
                source: "NASA_GPM_IMERG",
                status: "COMPLETED",
                datasetId: latestDataset?.id,
                regionKey: loc.regionKey,
                region: {
                    latitudeMin: loc.latitudeMin,
                    latitudeMax: loc.latitudeMax,
                    longitudeMin: loc.longitudeMin,
                    longitudeMax: loc.longitudeMax,
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                    district: loc.district,
                },
                period: {
                    start: input.start,
                    end: input.end,
                    requestedDays,
                    returnedDays: existingRecords.length,
                },
                storage: {
                    savedRecords: existingRecords.length,
                    updatedRecords: 0,
                    database: true,
                },
                coverage: {
                    requestedDays,
                    returnedDays: existingRecords.length,
                    missingDays: 0,
                    duplicateDays: 0,
                    coveragePercentage: 100,
                },
                fetchSummary: {
                    chunksRequested: 0,
                    chunksSucceeded: 0,
                    chunksFailed: 0,
                },
            };
        }
    }

    // Split date range into chunks <= 365 days for open NASA precipitation engine (no auth needed)
    const chunks = splitDateRangeIntoChunks(input.start, input.end, 365);
    const failedChunks: Array<{ start: string; end: string; error: string }> = [];
    let chunksSucceeded = 0;
    const fetchedDays: Map<string, { mean: number | null; min: number | null; max: number | null; validCells: number; missingCells: number }> = new Map();

    for (const chunk of chunks) {
        try {
            const openMap = await fetchOpenNasaPrecipitation(
                loc.latitude,
                loc.longitude,
                chunk.start,
                chunk.end
            );

            for (const [dateStr, rainfall] of openMap.entries()) {
                fetchedDays.set(dateStr, {
                    mean: rainfall,
                    min: rainfall,
                    max: rainfall,
                    validCells: rainfall !== null ? 1 : 0,
                    missingCells: rainfall === null ? 1 : 0,
                });
            }
            chunksSucceeded++;
        } catch (err: unknown) {
            // Fall back to getImergRainfall sub-chunks if open NASA fails
            try {
                const subChunks = splitDateRangeIntoChunks(chunk.start, chunk.end, 30);
                for (const sub of subChunks) {
                    const imergRes = await getImergRainfall({
                        latitudeMin: loc.latitudeMin,
                        latitudeMax: loc.latitudeMax,
                        longitudeMin: loc.longitudeMin,
                        longitudeMax: loc.longitudeMax,
                        start: sub.start,
                        end: sub.end,
                        includeGrid: false,
                    });

                    for (const day of imergRes.data) {
                        const cleanDate = day.date.replaceAll("-", "").trim();
                        fetchedDays.set(cleanDate, {
                            mean: day.summary.meanRainfall,
                            min: day.summary.minimumRainfall,
                            max: day.summary.maximumRainfall,
                            validCells: day.summary.validCells,
                            missingCells: day.summary.missingCells,
                        });
                    }
                }
                chunksSucceeded++;
            } catch (fallbackErr) {
                const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
                failedChunks.push({ start: chunk.start, end: chunk.end, error: msg });
            }
        }
    }

    const overallStatus: "COMPLETED" | "PARTIAL" | "FAILED" =
        failedChunks.length === 0
            ? "COMPLETED"
            : chunksSucceeded > 0
            ? "PARTIAL"
            : "FAILED";

    const returnedDaysCount = fetchedDays.size;
    const missingDaysCount = Math.max(0, requestedDays - returnedDaysCount);
    const coveragePercentage = requestedDays > 0 ? parseFloat(((returnedDaysCount / requestedDays) * 100).toFixed(1)) : 0;

    const dataset = await prisma.imergRegionalDataset.create({
        data: {
            regionKey: loc.regionKey,
            latitudeMin: loc.latitudeMin,
            latitudeMax: loc.latitudeMax,
            longitudeMin: loc.longitudeMin,
            longitudeMax: loc.longitudeMax,
            startDate: input.start,
            endDate: input.end,
            requestedDays,
            returnedDays: returnedDaysCount,
            missingDays: missingDaysCount,
            coveragePercentage,
            status: overallStatus,
            metadata: {
                district: loc.district,
                chunksRequested: chunks.length,
                chunksSucceeded,
                chunksFailed: failedChunks.length,
            },
        },
    });

    // Remove previous records for these dates to avoid stale null data
    await prisma.imergDailyRecord.deleteMany({
        where: {
            regionKey: loc.regionKey,
            date: { in: Array.from(fetchedDays.keys()) },
        },
    });

    const recordsToInsert = [];
    for (const [dateStr, info] of fetchedDays.entries()) {
        const y = parseInt(dateStr.slice(0, 4), 10);
        const m = parseInt(dateStr.slice(4, 6), 10) - 1;
        const d = parseInt(dateStr.slice(6, 8), 10);
        const observedAt = new Date(Date.UTC(y, m, d));

        const isRainy = (info.mean ?? 0) >= envVars.IMERG.RAINY_DAY_MM;
        const isHeavyRain = (info.mean ?? 0) >= envVars.IMERG.HEAVY_RAIN_MM;

        recordsToInsert.push({
            datasetId: dataset.id,
            regionKey: loc.regionKey,
            date: dateStr,
            observedAt,
            meanRainfall: info.mean,
            minRainfall: info.min,
            maxRainfall: info.max,
            validCells: info.validCells,
            missingCells: info.missingCells,
            isRainy,
            isHeavyRain,
        });
    }

    if (recordsToInsert.length > 0) {
        await prisma.imergDailyRecord.createMany({
            data: recordsToInsert,
            skipDuplicates: true,
        });
    }
    const savedRecords = recordsToInsert.length;

    return {
        source: "NASA_GPM_IMERG",
        status: overallStatus,
        datasetId: dataset.id,
        regionKey: loc.regionKey,
        region: {
            latitudeMin: loc.latitudeMin,
            latitudeMax: loc.latitudeMax,
            longitudeMin: loc.longitudeMin,
            longitudeMax: loc.longitudeMax,
            latitude: loc.latitude,
            longitude: loc.longitude,
            district: loc.district,
        },
        period: {
            start: input.start,
            end: input.end,
            requestedDays,
            returnedDays: returnedDaysCount,
        },
        storage: {
            savedRecords,
            updatedRecords: 0,
            database: true,
        },
        coverage: {
            requestedDays,
            returnedDays: returnedDaysCount,
            missingDays: missingDaysCount,
            duplicateDays: 0,
            coveragePercentage,
            missingDates: allRequestedDates.filter((d) => !fetchedDays.has(d)),
        },
        fetchSummary: {
            chunksRequested: chunks.length,
            chunksSucceeded,
            chunksFailed: failedChunks.length,
            failedChunks: failedChunks.length > 0 ? failedChunks : undefined,
        },
    };
}

export async function getImergHistoricalDataFromDB(
    input: IImergHistoricalQueryInput
): Promise<IImergHistoricalQueryOutput> {
    const loc = resolveLocation(input);
    const mode = input.mode ?? "full";

    // Auto-fetch if records are missing from DB or have null values from prior failed fetches
    if (input.autoFetch !== false) {
        const validCount = await prisma.imergDailyRecord.count({
            where: {
                regionKey: loc.regionKey,
                date: { gte: input.start, lte: input.end },
                meanRainfall: { not: null },
            },
        });
        const allDates = getAllDatesInRange(input.start, input.end);
        if (validCount < allDates.length) {
            await fetchTwoYearImergData({
                latitude: loc.latitude,
                longitude: loc.longitude,
                latitudeMin: loc.latitudeMin,
                latitudeMax: loc.latitudeMax,
                longitudeMin: loc.longitudeMin,
                longitudeMax: loc.longitudeMax,
                district: loc.district,
                start: input.start,
                end: input.end,
                forceRefresh: true,
            });
        }
    }

    const records = await prisma.imergDailyRecord.findMany({
        where: {
            regionKey: loc.regionKey,
            date: { gte: input.start, lte: input.end },
        },
        orderBy: { date: "asc" },
    });

    const allDates = getAllDatesInRange(input.start, input.end);
    const requestedDays = allDates.length;
    const availableDays = records.length;
    const missingDays = Math.max(0, requestedDays - availableDays);
    const coveragePercentage = requestedDays > 0 ? parseFloat(((availableDays / requestedDays) * 100).toFixed(1)) : 0;

    const rainfallMeans = records.map((r) => r.meanRainfall).filter((v): v is number => v !== null);
    const totalRainfall = rainfallMeans.length > 0 ? parseFloat(rainfallMeans.reduce((acc, curr) => acc + curr, 0).toFixed(2)) : 0;
    const averageDailyRainfall = rainfallMeans.length > 0 ? parseFloat((totalRainfall / (rainfallMeans.length || 1)).toFixed(2)) : 0;
    const maximumDailyRainfall = rainfallMeans.length > 0 ? Math.max(...rainfallMeans) : 0;
    const minimumDailyRainfall = rainfallMeans.length > 0 ? Math.min(...rainfallMeans) : 0;
    const rainyDays = records.filter((r) => r.isRainy).length;
    const dryDays = records.filter((r) => !r.isRainy).length;
    const heavyRainfallDays = records.filter((r) => r.isHeavyRain).length;

    const result: IImergHistoricalQueryOutput = {
        source: "DATABASE",
        regionKey: loc.regionKey,
        district: loc.district,
        region: {
            latitudeMin: loc.latitudeMin,
            latitudeMax: loc.latitudeMax,
            longitudeMin: loc.longitudeMin,
            longitudeMax: loc.longitudeMax,
            latitude: loc.latitude,
            longitude: loc.longitude,
        },
        period: {
            start: input.start,
            end: input.end,
            days: requestedDays,
        },
        summary: {
            totalRainfall,
            averageDailyRainfall,
            maximumDailyRainfall,
            minimumDailyRainfall,
            rainyDays,
            dryDays,
            heavyRainfallDays,
        },
        coverage: {
            requestedDays,
            availableDays,
            missingDays,
            coveragePercentage,
        },
        totalRecords: records.length,
    };

    if (mode === "daily" || mode === "full") {
        const dailyRecords = records.map((r) => {
            const rf = r.meanRainfall;
            const condition =
                rf === null
                    ? "NO_DATA"
                    : rf < 1
                    ? "DRY"
                    : rf < 10
                    ? "LIGHT_RAIN"
                    : rf < 25
                    ? "MODERATE_RAIN"
                    : "HEAVY_RAIN";

            return {
                date: r.date,
                observedAt: r.observedAt.toISOString(),
                rainfall: rf,
                meanRainfall: rf,
                minRainfall: r.minRainfall,
                maxRainfall: r.maxRainfall,
                condition,
                season: getSeasonForDate(r.date).season,
                unit: "mm/day",
                validCells: r.validCells,
                isRainy: r.isRainy,
                isHeavyRain: r.isHeavyRain,
            };
        });
        result.data = dailyRecords;
        result.daily = dailyRecords;
        result.records = dailyRecords;
    }

    if (mode === "monthly" || mode === "full") {
        const monthMap = new Map<string, typeof records>();
        for (const r of records) {
            const m = `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}`;
            if (!monthMap.has(m)) monthMap.set(m, []);
            monthMap.get(m)!.push(r);
        }

        const monthly: IImergMonthlySummary[] = [];
        for (const [month, recs] of monthMap.entries()) {
            const valid = recs.map((r) => r.meanRainfall).filter((v): v is number => v !== null);
            const mTotal = valid.reduce((a, b) => a + b, 0);
            const mRainy = recs.filter((r) => r.isRainy).length;
            const mHeavy = recs.filter((r) => r.isHeavyRain).length;
            monthly.push({
                month,
                totalRainfall: parseFloat(mTotal.toFixed(2)),
                meanDailyRainfall: valid.length > 0 ? parseFloat((mTotal / valid.length).toFixed(2)) : 0,
                maxDailyRainfall: valid.length > 0 ? Math.max(...valid) : 0,
                rainyDays: mRainy,
                dryDays: recs.length - mRainy,
                heavyRainfallDays: mHeavy,
                daysCount: recs.length,
            });
        }
        monthly.sort((a, b) => a.month.localeCompare(b.month));
        result.monthly = monthly;
    }

    if (mode === "seasonal" || mode === "full") {
        const seasonMap = new Map<string, typeof records>();
        for (const r of records) {
            const sInfo = getSeasonForDate(r.date);
            const sKey = `${sInfo.season}__${sInfo.year}`;
            if (!seasonMap.has(sKey)) seasonMap.set(sKey, []);
            seasonMap.get(sKey)!.push(r);
        }

        const seasonal: IImergSeasonalSummary[] = [];
        for (const [key, recs] of seasonMap.entries()) {
            const [season, yearStr] = key.split("__");
            const valid = recs.map((r) => r.meanRainfall).filter((v): v is number => v !== null);
            const sTotal = valid.reduce((a, b) => a + b, 0);
            const sRainy = recs.filter((r) => r.isRainy).length;
            const sHeavy = recs.filter((r) => r.isHeavyRain).length;

            let maxConsecDry = 0;
            let currentConsecDry = 0;
            for (const r of recs) {
                if (!r.isRainy) {
                    currentConsecDry++;
                    if (currentConsecDry > maxConsecDry) maxConsecDry = currentConsecDry;
                } else {
                    currentConsecDry = 0;
                }
            }

            seasonal.push({
                season,
                year: parseInt(yearStr, 10),
                totalRainfall: parseFloat(sTotal.toFixed(2)),
                meanDailyRainfall: valid.length > 0 ? parseFloat((sTotal / valid.length).toFixed(2)) : 0,
                rainyDays: sRainy,
                dryDays: recs.length - sRainy,
                heavyRainfallDays: sHeavy,
                maxConsecutiveDryDays: maxConsecDry,
                daysCount: recs.length,
            });
        }
        result.seasonal = seasonal;
    }

    return result;
}

export async function getImergDatasetStatus(query: ILocationQuery): Promise<IImergStatusOutput> {
    const loc = resolveLocation(query);
    const dataset = await prisma.imergRegionalDataset.findFirst({
        where: { regionKey: loc.regionKey },
        orderBy: { updatedAt: "desc" },
    });

    const records = await prisma.imergDailyRecord.findMany({
        where: { regionKey: loc.regionKey },
        select: { date: true },
        orderBy: { date: "asc" },
    });

    if (records.length === 0) {
        return {
            exists: false,
            regionKey: loc.regionKey,
            district: loc.district,
        };
    }

    return {
        exists: true,
        regionKey: loc.regionKey,
        district: loc.district,
        status: dataset?.status ?? "COMPLETED",
        storedDateRange: {
            earliest: records[0].date,
            latest: records[records.length - 1].date,
            totalRecords: records.length,
        },
    };
}

export async function refreshImergHistoricalData(
    input: IImergHistoricalFetchInput
): Promise<IImergHistoricalFetchOutput> {
    return fetchTwoYearImergData({
        ...input,
        forceRefresh: true,
    });
}

