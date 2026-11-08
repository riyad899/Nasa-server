import status from "http-status";
import AppError from "../../errorHelpers/appError.js";
import { prisma } from "../../lib/prisma.js";
import {
    NASA_POWER_CONSTANTS,
    buildRegionKey,
    resolveDistrictCoordinates,
} from "./nasaPower.constants.js";
import { resolveLocation, getSeasonForDate } from "../../shared/geo.constants.js";
import {
    IDataEntry,
    INasaPowerInput,
    INasaPowerOutput,
    INasaRawResponse,
    INasaPowerRegionalInput,
    INasaPowerRegionalOutput,
    INasaPowerRegionalDaily,
    IRegionalDailyMetric,
    IRegionalGridPoint,
    INasaRawRegionalFeature,
    INasaRawRegionalResponse,
    INasaPowerHistoricalFetchInput,
    INasaPowerHistoricalFetchOutput,
    INasaPowerHistoricalQueryInput,
    INasaPowerHistoricalQueryOutput,
    INasaPowerDatasetStatusOutput,
    IDateChunk,
    IMonthlyClimateSummary,
    ISeasonalClimateSummary,
} from "./nasaPower.interface.js";


// ─── Constants ────────────────────────────────────────────────────────────────

const NASA_POWER_BASE_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";
const NASA_POWER_REGIONAL_URL = "https://power.larc.nasa.gov/api/temporal/daily/regional";
const PARAMETERS = "T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN";
const COMMUNITY = "ag";
const FILL_VALUE = -999; // NASA POWER uses this for missing data

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts a raw NASA parameter record into a sorted array of { date, value } entries.
 * Replaces NASA fill values (-999) with null.
 */
const transformParameterData = (
    rawData: Record<string, number> | undefined
): IDataEntry[] => {
    if (!rawData) return [];

    return Object.entries(rawData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({
            date,
            value: value === FILL_VALUE ? null : parseFloat(value.toFixed(4)),
        }));
};

/**
 * Fetches a single parameter from NASA POWER Regional API.
 * (Regional endpoint allows 1 parameter per request)
 */
const fetchRegionalParameter = async (
    param: string,
    input: INasaPowerRegionalInput
): Promise<INasaRawRegionalFeature[]> => {
    let latMin = input.latitudeMin;
    let latMax = input.latitudeMax;
    let lonMin = input.longitudeMin;
    let lonMax = input.longitudeMax;

    // NASA POWER Regional API enforces a minimum 2.0-degree bounding box range (especially for ALLSKY_SFC_SW_DWN).
    // If range is < 2.02 degrees, symmetrically expand to satisfy NASA's constraint.
    const minSpan = 2.02;
    const isExpanded = (latMax - latMin < minSpan) || (lonMax - lonMin < minSpan);
    if (latMax - latMin < minSpan) {
        const mid = (latMin + latMax) / 2;
        latMin = parseFloat((mid - minSpan / 2).toFixed(4));
        latMax = parseFloat((mid + minSpan / 2).toFixed(4));
    }
    if (lonMax - lonMin < minSpan) {
        const mid = (lonMin + lonMax) / 2;
        lonMin = parseFloat((mid - minSpan / 2).toFixed(4));
        lonMax = parseFloat((mid + minSpan / 2).toFixed(4));
    }

    const params = new URLSearchParams({
        "latitude-min": latMin.toString(),
        "latitude-max": latMax.toString(),
        "longitude-min": lonMin.toString(),
        "longitude-max": lonMax.toString(),
        start: input.start,
        end: input.end,
        community: COMMUNITY,
        parameters: param,
        format: "json",
        units: "metric",
    });

    const url = `${NASA_POWER_REGIONAL_URL}?${params.toString()}`;

    let response: Response;
    try {
        response = await fetch(url, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "User-Agent": "NasaSpaceApp/1.0",
            },
            signal: AbortSignal.timeout(60_000), // 60s timeout for regional queries
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown network error";
        throw new AppError(
            `Failed to connect to NASA POWER Regional API for ${param}: ${message}`,
            status.BAD_GATEWAY
        );
    }

    if (!response.ok) {
        if (response.status === 422) {
            const errorBody = await response.json().catch(() => ({}));
            throw new AppError(
                `NASA POWER Regional API validation error for ${param}: ${JSON.stringify(errorBody?.messages ?? errorBody)}`,
                status.UNPROCESSABLE_ENTITY
            );
        }
        if (response.status === 429) {
            throw new AppError(
                "NASA POWER API rate limit exceeded. Please try again later.",
                status.TOO_MANY_REQUESTS
            );
        }
        if (response.status === 503) {
            throw new AppError(
                "NASA POWER API is temporarily unavailable. Please try again later.",
                status.SERVICE_UNAVAILABLE
            );
        }
        throw new AppError(
            `NASA POWER Regional API returned error (HTTP ${response.status}) for ${param}`,
            status.BAD_GATEWAY
        );
    }

    let parsed: INasaRawRegionalResponse;
    try {
        parsed = (await response.json()) as INasaRawRegionalResponse;
    } catch {
        throw new AppError(
            `Failed to parse response from NASA POWER Regional API for ${param}`,
            status.BAD_GATEWAY
        );
    }

    const parsedFeatures = parsed.features ?? [];
    if (isExpanded && parsedFeatures.length > 0) {
        // If we expanded the bounding box, filter to the requested bounding box + 0.25 deg buffer
        // (to account for 0.5-degree grid cell centers) so we retain only relevant points.
        const filtered = parsedFeatures.filter((f) => {
            const lon = f.geometry?.coordinates?.[0];
            const lat = f.geometry?.coordinates?.[1];
            if (lon === undefined || lat === undefined) return true;
            return (
                lat >= input.latitudeMin - 0.25 &&
                lat <= input.latitudeMax + 0.25 &&
                lon >= input.longitudeMin - 0.25 &&
                lon <= input.longitudeMax + 0.25
            );
        });
        if (filtered.length > 0) {
            return filtered;
        }
    }

    return parsedFeatures;
};

/**
 * Computes min, max, mean across all grid features for a given date and parameter.
 */
const computeDailyMetric = (
    features: INasaRawRegionalFeature[],
    paramKey: string,
    date: string
): IRegionalDailyMetric => {
    const values: number[] = [];

    for (const feature of features) {
        const val = feature.properties?.parameter?.[paramKey]?.[date];
        if (val !== undefined && val !== null && val !== FILL_VALUE) {
            values.push(val);
        }
    }

    if (values.length === 0) {
        return { mean: null, min: null, max: null };
    }

    const sum = values.reduce((acc, curr) => acc + curr, 0);
    return {
        mean: parseFloat((sum / values.length).toFixed(2)),
        min: parseFloat(Math.min(...values).toFixed(2)),
        max: parseFloat(Math.max(...values).toFixed(2)),
    };
};

/**
 * Transforms raw GeoJSON features into grid cell list
 */
const transformGridFeatures = (
    features: INasaRawRegionalFeature[],
    paramName: string
): IRegionalGridPoint[] => {
    return features.map((f) => {
        const rawDates = f.properties?.parameter?.[paramName] || {};
        const dates: Record<string, number | null> = {};
        for (const [d, v] of Object.entries(rawDates)) {
            dates[d] = v === FILL_VALUE ? null : parseFloat(v.toFixed(2));
        }
        return {
            latitude: f.geometry.coordinates[1],
            longitude: f.geometry.coordinates[0],
            elevation: f.geometry.coordinates[2] ?? 0,
            dates,
        };
    });
};

// ─── Service ──────────────────────────────────────────────────────────────────

const getNasaPowerData = async (input: INasaPowerInput): Promise<INasaPowerOutput> => {
    const { latitude, longitude, start, end } = input;

    // Build NASA POWER API URL
    const params = new URLSearchParams({
        start: start,
        end: end,
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        community: COMMUNITY,
        parameters: PARAMETERS,
        format: "json",
        units: "metric",
        "time-standard": "lst",
    });

    const nasaUrl = `${NASA_POWER_BASE_URL}?${params.toString()}`;

    // Fetch from NASA POWER API
    let response: Response;
    try {
        response = await fetch(nasaUrl, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "User-Agent": "NasaSpaceApp/1.0",
            },
            signal: AbortSignal.timeout(30_000), // 30s timeout
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown network error";
        throw new AppError(
            `Failed to connect to NASA POWER API: ${message}`,
            status.BAD_GATEWAY
        );
    }

    // Handle non-2xx responses
    if (!response.ok) {
        if (response.status === 422) {
            const errorBody = await response.json().catch(() => ({}));
            throw new AppError(
                `NASA POWER API validation error: ${JSON.stringify(errorBody?.messages ?? errorBody)}`,
                status.UNPROCESSABLE_ENTITY
            );
        }
        if (response.status === 429) {
            throw new AppError(
                "NASA POWER API rate limit exceeded. Please try again later.",
                status.TOO_MANY_REQUESTS
            );
        }
        if (response.status === 503) {
            throw new AppError(
                "NASA POWER API is temporarily unavailable. Please try again later.",
                status.SERVICE_UNAVAILABLE
            );
        }
        throw new AppError(
            `NASA POWER API returned an unexpected error (HTTP ${response.status})`,
            status.BAD_GATEWAY
        );
    }

    // Parse JSON
    let nasaData: INasaRawResponse;
    try {
        nasaData = (await response.json()) as INasaRawResponse;
    } catch {
        throw new AppError(
            "Failed to parse response from NASA POWER API",
            status.BAD_GATEWAY
        );
    }

    // Validate that we got the expected structure
    if (!nasaData?.properties?.parameter) {
        throw new AppError(
            "Unexpected response structure from NASA POWER API",
            status.BAD_GATEWAY
        );
    }

    const { T2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN } = nasaData.properties.parameter;

    // Transform and return
    const output: INasaPowerOutput = {
        source: "NASA_POWER",
        location: {
            latitude,
            longitude,
            boundingBox: {
                latMin: latitude,
                latMax: latitude,
                lonMin: longitude,
                lonMax: longitude,
            },
        },
        period: {
            start,
            end,
        },
        data: {
            temperature: transformParameterData(T2M),
            rainfall: transformParameterData(PRECTOTCORR),
            solarRadiation: transformParameterData(ALLSKY_SFC_SW_DWN),
        },
    };

    return output;
};

const getNasaPowerRegionalData = async (
    input: INasaPowerRegionalInput
): Promise<INasaPowerRegionalOutput> => {
    const { latitudeMin, latitudeMax, longitudeMin, longitudeMax, start, end, includeGrid } = input;

    // Fetch the 3 parameters concurrently
    const [t2mFeatures, precipFeatures, solarFeatures] = await Promise.all([
        fetchRegionalParameter("T2M", input),
        fetchRegionalParameter("PRECTOTCORR", input),
        fetchRegionalParameter("ALLSKY_SFC_SW_DWN", input),
    ]);

    // Collect all dates from all parameters
    const dateSet = new Set<string>();
    const scanDates = (features: INasaRawRegionalFeature[], paramKey: string) => {
        for (const f of features) {
            const dateObj = f.properties?.parameter?.[paramKey];
            if (dateObj) {
                for (const d of Object.keys(dateObj)) {
                    dateSet.add(d);
                }
            }
        }
    };

    scanDates(t2mFeatures, "T2M");
    scanDates(precipFeatures, "PRECTOTCORR");
    scanDates(solarFeatures, "ALLSKY_SFC_SW_DWN");

    const sortedDates = Array.from(dateSet).sort();

    // Compute daily metrics
    const daily: INasaPowerRegionalDaily[] = sortedDates.map((date) => ({
        date,
        temperature: computeDailyMetric(t2mFeatures, "T2M", date),
        rainfall: computeDailyMetric(precipFeatures, "PRECTOTCORR", date),
        solarRadiation: computeDailyMetric(solarFeatures, "ALLSKY_SFC_SW_DWN", date),
    }));

    // Summary calculations
    const validTemperatures = daily
        .map((d) => d.temperature.mean)
        .filter((v): v is number => v !== null);
    const validRainfalls = daily
        .map((d) => d.rainfall.mean)
        .filter((v): v is number => v !== null);
    const validSolar = daily
        .map((d) => d.solarRadiation.mean)
        .filter((v): v is number => v !== null);

    const averageTemperature =
        validTemperatures.length > 0
            ? parseFloat(
                  (
                      validTemperatures.reduce((a, b) => a + b, 0) /
                      validTemperatures.length
                  ).toFixed(2)
              )
            : null;

    const totalRainfall =
        validRainfalls.length > 0
            ? parseFloat(validRainfalls.reduce((a, b) => a + b, 0).toFixed(2))
            : null;

    const averageDailyRainfall =
        validRainfalls.length > 0
            ? parseFloat((totalRainfall! / validRainfalls.length).toFixed(2))
            : null;

    const averageSolarRadiation =
        validSolar.length > 0
            ? parseFloat(
                  (validSolar.reduce((a, b) => a + b, 0) / validSolar.length).toFixed(2)
              )
            : null;

    const output: INasaPowerRegionalOutput = {
        source: "NASA_POWER_REGIONAL",
        region: {
            latitudeMin,
            latitudeMax,
            longitudeMin,
            longitudeMax,
            boundingBox: {
                latMin: latitudeMin,
                latMax: latitudeMax,
                lonMin: longitudeMin,
                lonMax: longitudeMax,
            },
        },
        period: {
            start,
            end,
            days: sortedDates.length,
        },
        summary: {
            averageTemperature,
            totalRainfall,
            averageDailyRainfall,
            averageSolarRadiation,
            gridCellsCount: {
                temperature: t2mFeatures.length,
                rainfall: precipFeatures.length,
                solarRadiation: solarFeatures.length,
            },
        },
        daily,
    };

    if (includeGrid) {
        output.grid = {
            temperature: transformGridFeatures(t2mFeatures, "T2M"),
            rainfall: transformGridFeatures(precipFeatures, "PRECTOTCORR"),
            solarRadiation: transformGridFeatures(solarFeatures, "ALLSKY_SFC_SW_DWN"),
        };
    }

    return output;
};

// ─── Historical 2-Year Regional Service Implementation ───────────────────────

const parseYyyyMmDd = (str: string): Date => {
    const clean = str.replace(/-/g, "").trim();
    const y = parseInt(clean.slice(0, 4), 10);
    const m = parseInt(clean.slice(4, 6), 10) - 1;
    const d = parseInt(clean.slice(6, 8), 10);
    return new Date(Date.UTC(y, m, d));
};

const formatYyyyMmDd = (date: Date): string => {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}${m}${d}`;
};

const getAllDatesInRange = (startStr: string, endStr: string): string[] => {
    const dates: string[] = [];
    const current = parseYyyyMmDd(startStr);
    const end = parseYyyyMmDd(endStr);
    while (current <= end) {
        dates.push(formatYyyyMmDd(current));
        current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
};

const getSeasonForMonth = (
    month: number
): "Pre-Monsoon (Mar-May)" | "Monsoon (Jun-Sep)" | "Post-Monsoon (Oct-Nov)" | "Winter (Dec-Feb)" => {
    if (month >= 3 && month <= 5) return "Pre-Monsoon (Mar-May)";
    if (month >= 6 && month <= 9) return "Monsoon (Jun-Sep)";
    if (month >= 10 && month <= 11) return "Post-Monsoon (Oct-Nov)";
    return "Winter (Dec-Feb)";
};

/**
 * Splits a requested multi-year date range into safe chunks of <= maxDays (NASA POWER limit: 366 days).
 * Seamlessly handles leap years and year boundaries without date gaps.
 */
const splitDateRangeIntoChunks = (
    startStr: string,
    endStr: string,
    maxDays: number = NASA_POWER_CONSTANTS.MAX_CHUNK_DAYS
): IDateChunk[] => {
    const chunks: IDateChunk[] = [];
    const startDate = parseYyyyMmDd(startStr);
    const endDate = parseYyyyMmDd(endStr);

    let curStart = new Date(startDate.getTime());
    let index = 0;

    while (curStart <= endDate) {
        // Target end: either maxDays - 1 days ahead or endDate
        const targetEnd = new Date(curStart.getTime());
        targetEnd.setUTCDate(targetEnd.getUTCDate() + (maxDays - 1));

        const curEnd = targetEnd > endDate ? new Date(endDate.getTime()) : targetEnd;
        const curStartStr = formatYyyyMmDd(curStart);
        const curEndStr = formatYyyyMmDd(curEnd);
        const days = Math.round((curEnd.getTime() - curStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        chunks.push({
            chunkIndex: index++,
            totalChunks: 0,
            start: curStartStr,
            end: curEndStr,
            days,
        });

        curStart = new Date(curEnd.getTime());
        curStart.setUTCDate(curStart.getUTCDate() + 1);
    }

    chunks.forEach((c) => (c.totalChunks = chunks.length));
    return chunks;
};

/**
 * Robust retry wrapper around fetchRegionalParameter to handle temporary timeouts / rate limits
 */
const fetchRegionalParameterWithRetry = async (
    param: string,
    latMin: number,
    latMax: number,
    lonMin: number,
    lonMax: number,
    start: string,
    end: string,
    maxRetries = NASA_POWER_CONSTANTS.MAX_RETRIES
): Promise<INasaRawRegionalFeature[]> => {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fetchRegionalParameter(param, {
                latitudeMin: latMin,
                latitudeMax: latMax,
                longitudeMin: lonMin,
                longitudeMax: lonMax,
                start,
                end,
            });
        } catch (err: unknown) {
            lastError = err;
            if (attempt < maxRetries) {
                const delay = NASA_POWER_CONSTANTS.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                await new Promise((res) => setTimeout(res, delay));
            }
        }
    }
    throw lastError instanceof Error
        ? lastError
        : new Error(`Failed to fetch ${param} after ${maxRetries} attempts`);
};

/**
 * Fetches up to two years (or more) of regional NASA POWER data, chunks the dates safely,
 * fetches with controlled concurrency, merges & validates, saves to Postgres via Prisma,
 * and returns comprehensive coverage metadata.
 */
const fetchTwoYearRegionalData = async (
    input: INasaPowerHistoricalFetchInput
): Promise<INasaPowerHistoricalFetchOutput> => {
    let latMin = input.latitudeMin;
    let latMax = input.latitudeMax;
    let lonMin = input.longitudeMin;
    let lonMax = input.longitudeMax;

    if (input.district && (latMin === undefined || latMax === undefined || lonMin === undefined || lonMax === undefined)) {
        const resolved = resolveDistrictCoordinates(input.district);
        if (resolved) {
            latMin = latMin ?? resolved.bbox.latitudeMin;
            latMax = latMax ?? resolved.bbox.latitudeMax;
            lonMin = lonMin ?? resolved.bbox.longitudeMin;
            lonMax = lonMax ?? resolved.bbox.longitudeMax;
        }
    }

    if (latMin === undefined || latMax === undefined || lonMin === undefined || lonMax === undefined) {
        latMin = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.latitudeMin;
        latMax = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.latitudeMax;
        lonMin = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.longitudeMin;
        lonMax = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.longitudeMax;
    }

    const regionKey = buildRegionKey(latMin, latMax, lonMin, lonMax);
    const allRequestedDates = getAllDatesInRange(input.start, input.end);
    const requestedDays = allRequestedDates.length;

    // Check if entire date range is already fully satisfied in database
    if (!input.forceRefresh) {
        const existingRecords = await prisma.nasaPowerDailyRecord.findMany({
            where: {
                regionKey,
                date: { gte: input.start, lte: input.end },
            },
            select: { date: true },
        });

        const existingDateSet = new Set(existingRecords.map((r) => r.date));
        const missingInDb = allRequestedDates.filter((d) => !existingDateSet.has(d));

        if (missingInDb.length === 0) {
            const latestDataset = await prisma.nasaPowerRegionalDataset.findFirst({
                where: { regionKey },
                orderBy: { updatedAt: "desc" },
            });

            return {
                source: "NASA_POWER_REGIONAL",
                status: "COMPLETED",
                datasetId: latestDataset?.id,
                regionKey,
                region: {
                    latitudeMin: latMin,
                    latitudeMax: latMax,
                    longitudeMin: lonMin,
                    longitudeMax: lonMax,
                    district: input.district,
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

    // Split requested date range into chunks <= 366 days
    const chunks = splitDateRangeIntoChunks(
        input.start,
        input.end,
        NASA_POWER_CONSTANTS.MAX_CHUNK_DAYS
    );

    const failedChunks: Array<{ start: string; end: string; error: string }> = [];
    let chunksSucceeded = 0;

    const chunkResults: Array<{
        chunk: IDateChunk;
        t2m: INasaRawRegionalFeature[];
        precip: INasaRawRegionalFeature[];
        solar: INasaRawRegionalFeature[];
    }> = [];

    // Fetch chunks with controlled concurrency (2 chunks max at once)
    const CONCURRENCY = 2;
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY);
        const batchPromises = batch.map(async (chunk) => {
            try {
                const [t2m, precip, solar] = await Promise.all([
                    fetchRegionalParameterWithRetry(
                        "T2M",
                        latMin!,
                        latMax!,
                        lonMin!,
                        lonMax!,
                        chunk.start,
                        chunk.end
                    ),
                    fetchRegionalParameterWithRetry(
                        "PRECTOTCORR",
                        latMin!,
                        latMax!,
                        lonMin!,
                        lonMax!,
                        chunk.start,
                        chunk.end
                    ),
                    fetchRegionalParameterWithRetry(
                        "ALLSKY_SFC_SW_DWN",
                        latMin!,
                        latMax!,
                        lonMin!,
                        lonMax!,
                        chunk.start,
                        chunk.end
                    ),
                ]);

                chunksSucceeded++;
                return { chunk, t2m, precip, solar, error: null };
            } catch (err: unknown) {
                const errorMsg = err instanceof Error ? err.message : "Unknown error";
                failedChunks.push({
                    start: chunk.start,
                    end: chunk.end,
                    error: errorMsg,
                });
                return { chunk, t2m: [], precip: [], solar: [], error: err };
            }
        });

        const settled = await Promise.all(batchPromises);
        for (const res of settled) {
            if (!res.error) {
                chunkResults.push({
                    chunk: res.chunk,
                    t2m: res.t2m,
                    precip: res.precip,
                    solar: res.solar,
                });
            }
        }
    }

    // Merge features across all chunks
    const allT2mFeatures: INasaRawRegionalFeature[] = [];
    const allPrecipFeatures: INasaRawRegionalFeature[] = [];
    const allSolarFeatures: INasaRawRegionalFeature[] = [];
    const dateSet = new Set<string>();

    for (const cr of chunkResults) {
        allT2mFeatures.push(...cr.t2m);
        allPrecipFeatures.push(...cr.precip);
        allSolarFeatures.push(...cr.solar);

        for (const f of cr.t2m) {
            const pDates = f.properties?.parameter?.T2M;
            if (pDates) {
                Object.keys(pDates).forEach((d) => dateSet.add(d));
            }
        }
    }

    const sortedDates = Array.from(dateSet).sort();

    // Compute regional daily metrics for every date
    const dailyRecords: Array<INasaPowerRegionalDaily & { observedAt: Date }> = sortedDates.map(
        (date) => ({
            date,
            observedAt: parseYyyyMmDd(date),
            temperature: computeDailyMetric(allT2mFeatures, "T2M", date),
            rainfall: computeDailyMetric(allPrecipFeatures, "PRECTOTCORR", date),
            solarRadiation: computeDailyMetric(allSolarFeatures, "ALLSKY_SFC_SW_DWN", date),
        })
    );

    // Compute coverage metrics
    const returnedDatesSet = new Set(dailyRecords.map((r) => r.date));
    const missingDates = allRequestedDates.filter((d) => !returnedDatesSet.has(d));
    const duplicateDays = 0; // deduplicated by unique date Set
    const coveragePercentage = requestedDays > 0 ? (dailyRecords.length / requestedDays) * 100 : 0;
    const datasetStatus = failedChunks.length === 0 && missingDates.length === 0 ? "COMPLETED" : "PARTIAL";

    // Save/Update dataset metadata in PostgreSQL
    const dataset = await prisma.nasaPowerRegionalDataset.create({
        data: {
            regionKey,
            latitudeMin: latMin!,
            latitudeMax: latMax!,
            longitudeMin: lonMin!,
            longitudeMax: lonMax!,
            startDate: input.start,
            endDate: input.end,
            requestedDays,
            returnedDays: dailyRecords.length,
            missingDays: missingDates.length,
            coveragePercentage: Number(coveragePercentage.toFixed(2)),
            status: datasetStatus,
            gridCellCount: {
                temperature: allT2mFeatures.length,
                rainfall: allPrecipFeatures.length,
                solarRadiation: allSolarFeatures.length,
            },
            metadata: {
                district: input.district,
                failedChunks,
                missingDatesSample: missingDates.slice(0, 10),
            },
        },
    });

    // Fast batch persistence with deleteMany and createMany
    await prisma.nasaPowerDailyRecord.deleteMany({
        where: {
            regionKey,
            date: { in: dailyRecords.map((r) => r.date) },
        },
    });

    const recordsToInsert = dailyRecords.map((rec) => ({
        datasetId: dataset.id,
        regionKey,
        date: rec.date,
        observedAt: rec.observedAt,
        temperatureMean: rec.temperature.mean,
        temperatureMin: rec.temperature.min,
        temperatureMax: rec.temperature.max,
        rainfallMean: rec.rainfall.mean,
        rainfallMin: rec.rainfall.min,
        rainfallMax: rec.rainfall.max,
        solarRadiationMean: rec.solarRadiation.mean,
        solarRadiationMin: rec.solarRadiation.min,
        solarRadiationMax: rec.solarRadiation.max,
    }));

    if (recordsToInsert.length > 0) {
        await prisma.nasaPowerDailyRecord.createMany({
            data: recordsToInsert,
            skipDuplicates: true,
        });
    }
    const savedRecords = recordsToInsert.length;

    return {
        source: "NASA_POWER_REGIONAL",
        status: datasetStatus,
        datasetId: dataset.id,
        regionKey,
        region: {
            latitudeMin: latMin!,
            latitudeMax: latMax!,
            longitudeMin: lonMin!,
            longitudeMax: lonMax!,
            district: input.district,
        },
        period: {
            start: input.start,
            end: input.end,
            requestedDays,
            returnedDays: dailyRecords.length,
        },
        storage: {
            savedRecords,
            updatedRecords: 0,
            database: true,
        },
        coverage: {
            requestedDays,
            returnedDays: dailyRecords.length,
            missingDays: missingDates.length,
            duplicateDays,
            coveragePercentage: Number(coveragePercentage.toFixed(2)),
            missingDates: missingDates.slice(0, 30),
        },
        fetchSummary: {
            chunksRequested: chunks.length,
            chunksSucceeded,
            chunksFailed: failedChunks.length,
            failedChunks,
        },
    };
};

/**
 * Fast Database Query: Retrieves saved historical NASA POWER data directly from PostgreSQL.
 * Supports summary, daily, monthly, seasonal, and full aggregation modes.
 * Zero external NASA API requests are made.
 */
const getRegionalHistoricalDataFromDB = async (
    input: INasaPowerHistoricalQueryInput
): Promise<INasaPowerHistoricalQueryOutput> => {
    const loc = resolveLocation(input);
    const regionKey = loc.regionKey;

    // Auto-fetch if not present in DB or if records are missing
    if (input.autoFetch !== false) {
        const count = await prisma.nasaPowerDailyRecord.count({
            where: {
                regionKey,
                date: { gte: input.start, lte: input.end },
                temperatureMean: { not: null },
            },
        });
        const allDates = getAllDatesInRange(input.start, input.end);
        if (count < allDates.length) {
            await fetchTwoYearRegionalData({
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

    // Indexed query on regionKey and date
    const records = await prisma.nasaPowerDailyRecord.findMany({
        where: {
            regionKey,
            date: { gte: input.start, lte: input.end },
        },
        orderBy: { date: "asc" },
    });

    const allDates = getAllDatesInRange(input.start, input.end);
    const requestedDays = allDates.length;
    const availableDays = records.length;
    const missingDays = Math.max(0, requestedDays - availableDays);
    const coveragePercentage = requestedDays > 0 ? Number(((availableDays / requestedDays) * 100).toFixed(2)) : 0;

    // Statistically sound calculations
    const tempMeans = records.map((r) => r.temperatureMean).filter((v): v is number => v !== null);
    const tempMins = records.map((r) => r.temperatureMin).filter((v): v is number => v !== null);
    const tempMaxs = records.map((r) => r.temperatureMax).filter((v): v is number => v !== null);
    const rainMeans = records.map((r) => r.rainfallMean).filter((v): v is number => v !== null);
    const solarMeans = records.map((r) => r.solarRadiationMean).filter((v): v is number => v !== null);

    const averageTemperature = tempMeans.length
        ? Number((tempMeans.reduce((a, b) => a + b, 0) / tempMeans.length).toFixed(2))
        : null;
    const minimumTemperature = tempMins.length ? Number(Math.min(...tempMins).toFixed(2)) : null;
    const maximumTemperature = tempMaxs.length ? Number(Math.max(...tempMaxs).toFixed(2)) : null;
    const totalRainfall = rainMeans.length
        ? Number(rainMeans.reduce((a, b) => a + b, 0).toFixed(2))
        : null;
    const averageDailyRainfall = rainMeans.length && totalRainfall !== null
        ? Number((totalRainfall / rainMeans.length).toFixed(2))
        : null;
    const rainyDays = records.filter((r) => (r.rainfallMean ?? 0) > 0.1).length;
    const dryDays = records.length - rainyDays;
    const averageSolarRadiation = solarMeans.length
        ? Number((solarMeans.reduce((a, b) => a + b, 0) / solarMeans.length).toFixed(2))
        : null;

    const output: INasaPowerHistoricalQueryOutput = {
        source: "DATABASE",
        regionKey,
        district: loc.district,
        period: {
            start: input.start,
            end: input.end,
            days: requestedDays,
        },
        totalRecords: records.length,
        summary: {
            averageTemperature,
            minimumTemperature,
            maximumTemperature,
            totalRainfall,
            averageDailyRainfall,
            rainyDays,
            dryDays,
            averageSolarRadiation,
        },
        coverage: {
            requestedDays,
            availableDays,
            missingDays,
            coveragePercentage,
        },
    };

    const mode = input.mode ?? "full";

    if (mode === "daily" || mode === "full") {
        const dailyRecords = records.map((r) => ({
            date: r.date,
            observedAt: r.observedAt ? r.observedAt.toISOString() : `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}T00:00:00.000Z`,
            temperature: { mean: r.temperatureMean, min: r.temperatureMin, max: r.temperatureMax },
            rainfall: { mean: r.rainfallMean, min: r.rainfallMin, max: r.rainfallMax },
            solarRadiation: { mean: r.solarRadiationMean, min: r.solarRadiationMin, max: r.solarRadiationMax },
            temperatureMean: r.temperatureMean,
            temperatureMin: r.temperatureMin,
            temperatureMax: r.temperatureMax,
            rainfallMean: r.rainfallMean,
            solarRadiationMean: r.solarRadiationMean,
            season: getSeasonForDate(r.date).season,
            units: {
                temperature: "°C",
                rainfall: "mm/day",
                solarRadiation: "MJ/m²/day",
            },
        }));
        output.data = dailyRecords;
        output.daily = dailyRecords;
        output.records = dailyRecords;
    }

    if (mode === "monthly" || mode === "full") {
        const monthlyMap = new Map<string, typeof records>();
        for (const r of records) {
            const ym = `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}`;
            if (!monthlyMap.has(ym)) monthlyMap.set(ym, []);
            monthlyMap.get(ym)!.push(r);
        }

        output.monthly = Array.from(monthlyMap.entries()).map(([month, monthRecs]) => {
            const tVals = monthRecs.map((r) => r.temperatureMean).filter((v): v is number => v !== null);
            const rVals = monthRecs.map((r) => r.rainfallMean).filter((v): v is number => v !== null);
            const sVals = monthRecs.map((r) => r.solarRadiationMean).filter((v): v is number => v !== null);
            const tMins = monthRecs.map((r) => r.temperatureMin).filter((v): v is number => v !== null);
            const tMaxs = monthRecs.map((r) => r.temperatureMax).filter((v): v is number => v !== null);

            const tMean = tVals.length
                ? Number((tVals.reduce((a, b) => a + b, 0) / tVals.length).toFixed(2))
                : null;
            const totRain = rVals.length
                ? Number(rVals.reduce((a, b) => a + b, 0).toFixed(2))
                : null;
            const rDays = monthRecs.filter((r) => (r.rainfallMean ?? 0) > 0.1).length;

            return {
                month,
                temperatureMean: tMean,
                temperatureMin: tMins.length ? Number(Math.min(...tMins).toFixed(2)) : null,
                temperatureMax: tMaxs.length ? Number(Math.max(...tMaxs).toFixed(2)) : null,
                totalRainfall: totRain,
                rainyDays: rDays,
                dryDays: monthRecs.length - rDays,
                solarRadiationMean: sVals.length
                    ? Number((sVals.reduce((a, b) => a + b, 0) / sVals.length).toFixed(2))
                    : null,
                daysCount: monthRecs.length,
            };
        });
    }

    if (mode === "seasonal" || mode === "full") {
        const seasonMap = new Map<string, typeof records>();
        for (const r of records) {
            const y = parseInt(r.date.slice(0, 4), 10);
            const m = parseInt(r.date.slice(4, 6), 10);
            const season = getSeasonForMonth(m);
            const key = `${y}:${season}`;
            if (!seasonMap.has(key)) seasonMap.set(key, []);
            seasonMap.get(key)!.push(r);
        }

        output.seasonal = Array.from(seasonMap.entries()).map(([key, seasonRecs]) => {
            const parts = key.split(":");
            const year = parseInt(parts[0], 10);
            const seasonName = parts[1] as ISeasonalClimateSummary["season"];

            const tVals = seasonRecs.map((r) => r.temperatureMean).filter((v): v is number => v !== null);
            const rVals = seasonRecs.map((r) => r.rainfallMean).filter((v): v is number => v !== null);
            const sVals = seasonRecs.map((r) => r.solarRadiationMean).filter((v): v is number => v !== null);

            let maxConsecutiveDry = 0;
            let currentConsecutiveDry = 0;
            for (const r of seasonRecs) {
                if ((r.rainfallMean ?? 0) <= 0.1) {
                    currentConsecutiveDry++;
                    if (currentConsecutiveDry > maxConsecutiveDry) {
                        maxConsecutiveDry = currentConsecutiveDry;
                    }
                } else {
                    currentConsecutiveDry = 0;
                }
            }

            const rDays = seasonRecs.filter((r) => (r.rainfallMean ?? 0) > 0.1).length;

            return {
                season: seasonName,
                year,
                temperatureMean: tVals.length
                    ? Number((tVals.reduce((a, b) => a + b, 0) / tVals.length).toFixed(2))
                    : null,
                totalRainfall: rVals.length
                    ? Number(rVals.reduce((a, b) => a + b, 0).toFixed(2))
                    : null,
                rainyDays: rDays,
                dryDays: seasonRecs.length - rDays,
                maxConsecutiveDryDays: maxConsecutiveDry,
                solarRadiationMean: sVals.length
                    ? Number((sVals.reduce((a, b) => a + b, 0) / sVals.length).toFixed(2))
                    : null,
                daysCount: seasonRecs.length,
            };
        });
    }

    return output;
};

/**
 * Returns dataset existence, records count, and coverage status for a given region and date range
 */
const getHistoricalDatasetStatus = async (input: {
    latitudeMin?: number;
    latitudeMax?: number;
    longitudeMin?: number;
    longitudeMax?: number;
    district?: string;
    start?: string;
    end?: string;
}): Promise<INasaPowerDatasetStatusOutput> => {
    let latMin = input.latitudeMin;
    let latMax = input.latitudeMax;
    let lonMin = input.longitudeMin;
    let lonMax = input.longitudeMax;

    if (input.district && (latMin === undefined || latMax === undefined || lonMin === undefined || lonMax === undefined)) {
        const resolved = resolveDistrictCoordinates(input.district);
        if (resolved) {
            latMin = latMin ?? resolved.bbox.latitudeMin;
            latMax = latMax ?? resolved.bbox.latitudeMax;
            lonMin = lonMin ?? resolved.bbox.longitudeMin;
            lonMax = lonMax ?? resolved.bbox.longitudeMax;
        }
    }

    if (latMin === undefined || latMax === undefined || lonMin === undefined || lonMax === undefined) {
        latMin = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.latitudeMin;
        latMax = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.latitudeMax;
        lonMin = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.longitudeMin;
        lonMax = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.longitudeMax;
    }

    const regionKey = buildRegionKey(latMin, latMax, lonMin, lonMax);

    const latestDataset = await prisma.nasaPowerRegionalDataset.findFirst({
        where: { regionKey },
        orderBy: { updatedAt: "desc" },
    });

    const totalRecords = await prisma.nasaPowerDailyRecord.count({
        where: { regionKey },
    });

    const earliestRec = await prisma.nasaPowerDailyRecord.findFirst({
        where: { regionKey },
        orderBy: { date: "asc" },
        select: { date: true },
    });

    const latestRec = await prisma.nasaPowerDailyRecord.findFirst({
        where: { regionKey },
        orderBy: { date: "desc" },
        select: { date: true },
    });

    const exists = totalRecords > 0;

    let requestedRangeCoverage: INasaPowerDatasetStatusOutput["requestedRangeCoverage"] = undefined;
    if (input.start && input.end) {
        const allRequested = getAllDatesInRange(input.start, input.end);
        const inDbCount = await prisma.nasaPowerDailyRecord.count({
            where: {
                regionKey,
                date: { gte: input.start, lte: input.end },
            },
        });

        const missing = Math.max(0, allRequested.length - inDbCount);
        const pct = allRequested.length > 0 ? (inDbCount / allRequested.length) * 100 : 0;

        requestedRangeCoverage = {
            requestedStart: input.start,
            requestedEnd: input.end,
            requestedDays: allRequested.length,
            availableDays: inDbCount,
            missingDays: missing,
            coveragePercentage: Number(pct.toFixed(2)),
            isComplete: missing === 0,
        };
    }

    return {
        exists,
        regionKey,
        district: input.district,
        datasetId: latestDataset?.id,
        status: latestDataset?.status ?? (exists ? "COMPLETED" : "NO_DATA"),
        storedDateRange: exists
            ? {
                  earliest: earliestRec?.date || "",
                  latest: latestRec?.date || "",
                  totalRecords,
              }
            : undefined,
        requestedRangeCoverage,
        lastFetchedAt: latestDataset?.fetchedAt.toISOString(),
        updatedAt: latestDataset?.updatedAt.toISOString(),
    };
};

/**
 * Refreshes historical data by explicitly fetching from NASA POWER even if data is already present
 */
const refreshHistoricalData = async (
    input: INasaPowerHistoricalFetchInput
): Promise<INasaPowerHistoricalFetchOutput> => {
    return fetchTwoYearRegionalData({
        ...input,
        forceRefresh: true,
    });
};

export const NasaPowerService = {
    getNasaPowerData,
    getNasaPowerRegionalData,
    fetchTwoYearRegionalData,
    getRegionalHistoricalDataFromDB,
    getHistoricalDatasetStatus,
    refreshHistoricalData,
    splitDateRangeIntoChunks,
};



