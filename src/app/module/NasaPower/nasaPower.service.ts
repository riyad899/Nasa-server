import status from "http-status";
import AppError from "../../errorHelpers/appError.js";
import { IDataEntry, INasaPowerInput, INasaPowerOutput, INasaRawResponse } from "./nasaPower.interface.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const NASA_POWER_BASE_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";
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

export const NasaPowerService = {
    getNasaPowerData,
};
