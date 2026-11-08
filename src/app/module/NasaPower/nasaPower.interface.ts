// ─── Input ───────────────────────────────────────────────────────────────────

export interface INasaPowerInput {
    latitude: number;
    longitude: number;
    start: string; // YYYYMMDD
    end: string;   // YYYYMMDD
}

// ─── Processed Data Entry ────────────────────────────────────────────────────

export interface IDataEntry {
    date: string;
    value: number | null;
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface INasaPowerOutput {
    source: "NASA_POWER";
    location: {
        latitude: number;
        longitude: number;
        boundingBox: {
            latMin: number;
            latMax: number;
            lonMin: number;
            lonMax: number;
        };
    };
    period: {
        start: string;
        end: string;
    };
    data: {
        temperature: IDataEntry[];      // T2M — Temperature at 2 Meters (°C)
        rainfall: IDataEntry[];         // PRECTOTCORR — Precipitation (mm/day)
        solarRadiation: IDataEntry[];   // ALLSKY_SFC_SW_DWN — Solar Radiation (MJ/m²/day)
    };
}

export interface INasaPowerRegionalInput {
    latitudeMin: number;
    latitudeMax: number;
    longitudeMin: number;
    longitudeMax: number;
    start: string; // YYYYMMDD
    end: string;   // YYYYMMDD
    includeGrid?: boolean;
}

export interface IRegionalDailyMetric {
    mean: number | null;
    min: number | null;
    max: number | null;
}

export interface INasaPowerRegionalDaily {
    date: string;
    temperature: IRegionalDailyMetric;     // T2M (°C)
    rainfall: IRegionalDailyMetric;        // PRECTOTCORR (mm/day)
    solarRadiation: IRegionalDailyMetric;  // ALLSKY_SFC_SW_DWN (MJ/m²/day)
}

export interface IRegionalGridPoint {
    latitude: number;
    longitude: number;
    elevation?: number;
    dates: Record<string, number | null>;
}

export interface INasaPowerRegionalOutput {
    source: "NASA_POWER_REGIONAL";
    region: {
        latitudeMin: number;
        latitudeMax: number;
        longitudeMin: number;
        longitudeMax: number;
        boundingBox: {
            latMin: number;
            latMax: number;
            lonMin: number;
            lonMax: number;
        };
    };
    period: {
        start: string;
        end: string;
        days: number;
    };
    summary: {
        averageTemperature: number | null;
        totalRainfall: number | null;
        averageDailyRainfall: number | null;
        averageSolarRadiation: number | null;
        gridCellsCount: {
            temperature: number;
            rainfall: number;
            solarRadiation: number;
        };
    };
    daily: INasaPowerRegionalDaily[];
    grid?: {
        temperature?: IRegionalGridPoint[];
        rainfall?: IRegionalGridPoint[];
        solarRadiation?: IRegionalGridPoint[];
    };
}

// ─── NASA Raw API Shape ───────────────────────────────────────────────────────

export interface INasaRawParameterData {
    [date: string]: number; // e.g. { "20250101": 22.5, ... }
}

export interface INasaRawResponse {
    properties: {
        parameter: {
            T2M?: INasaRawParameterData;
            PRECTOTCORR?: INasaRawParameterData;
            ALLSKY_SFC_SW_DWN?: INasaRawParameterData;
        };
    };
}

export interface INasaRawRegionalFeature {
    type: "Feature";
    geometry: {
        type: "Point";
        coordinates: [number, number, number]; // [lon, lat, elevation]
    };
    properties: {
        parameter: Record<string, Record<string, number>>;
    };
}

export interface INasaRawRegionalResponse {
    features: INasaRawRegionalFeature[];
    messages?: string[];
}

// ─── Historical 2-Year Regional Data Interfaces ──────────────────────────────

export interface INasaPowerHistoricalFetchInput {
    latitudeMin?: number;
    latitudeMax?: number;
    longitudeMin?: number;
    longitudeMax?: number;
    district?: string;
    start: string; // YYYYMMDD
    end: string;   // YYYYMMDD
    forceRefresh?: boolean;
}

export interface IDateChunk {
    chunkIndex: number;
    totalChunks: number;
    start: string; // YYYYMMDD
    end: string;   // YYYYMMDD
    days: number;
}

export interface ICoverageReport {
    requestedDays: number;
    returnedDays: number;
    missingDays: number;
    duplicateDays: number;
    coveragePercentage: number;
    missingDates?: string[];
}

export interface IFetchSummary {
    chunksRequested: number;
    chunksSucceeded: number;
    chunksFailed: number;
    failedChunks?: Array<{ start: string; end: string; error: string }>;
}

export interface INasaPowerHistoricalFetchOutput {
    source: "NASA_POWER_REGIONAL";
    status: "COMPLETED" | "PARTIAL" | "FAILED";
    datasetId?: string;
    regionKey: string;
    region: {
        latitudeMin: number;
        latitudeMax: number;
        longitudeMin: number;
        longitudeMax: number;
        district?: string;
    };
    period: {
        start: string;
        end: string;
        requestedDays: number;
        returnedDays: number;
    };
    storage: {
        savedRecords: number;
        updatedRecords: number;
        database: boolean;
    };
    coverage: ICoverageReport;
    fetchSummary: IFetchSummary;
}

export interface INasaPowerHistoricalQueryInput {
    latitude?: number;
    longitude?: number;
    latitudeMin?: number;
    latitudeMax?: number;
    longitudeMin?: number;
    longitudeMax?: number;
    district?: string;
    start: string; // YYYYMMDD
    end: string;   // YYYYMMDD
    mode?: "summary" | "daily" | "monthly" | "seasonal" | "full";
    autoFetch?: boolean;
}

export interface IMonthlyClimateSummary {
    month: string; // "YYYY-MM"
    temperatureMean: number | null;
    temperatureMin: number | null;
    temperatureMax: number | null;
    totalRainfall: number | null;
    rainyDays: number;
    dryDays: number;
    solarRadiationMean: number | null;
    daysCount: number;
}

export interface ISeasonalClimateSummary {
    season: "Pre-Monsoon (Mar-May)" | "Monsoon (Jun-Sep)" | "Post-Monsoon (Oct-Nov)" | "Winter (Dec-Feb)";
    year: number;
    temperatureMean: number | null;
    totalRainfall: number | null;
    rainyDays: number;
    dryDays: number;
    maxConsecutiveDryDays: number;
    solarRadiationMean: number | null;
    daysCount: number;
}

export interface INasaPowerHistoricalQueryOutput {
    source: "DATABASE";
    regionKey: string;
    district?: string;
    period: {
        start: string;
        end: string;
        days: number;
    };
    totalRecords?: number;
    summary: {
        averageTemperature: number | null;
        minimumTemperature: number | null;
        maximumTemperature: number | null;
        totalRainfall: number | null;
        averageDailyRainfall: number | null;
        rainyDays: number;
        dryDays: number;
        averageSolarRadiation: number | null;
    };
    coverage: {
        requestedDays: number;
        availableDays: number;
        missingDays: number;
        coveragePercentage: number;
    };
    data?: any[];
    records?: any[];
    daily?: any[];
    monthly?: IMonthlyClimateSummary[];
    seasonal?: ISeasonalClimateSummary[];
}

export interface INasaPowerDatasetStatusOutput {
    exists: boolean;
    regionKey: string;
    district?: string;
    datasetId?: string;
    status?: string;
    storedDateRange?: {
        earliest: string;
        latest: string;
        totalRecords: number;
    };
    requestedRangeCoverage?: {
        requestedStart: string;
        requestedEnd: string;
        requestedDays: number;
        availableDays: number;
        missingDays: number;
        coveragePercentage: number;
        isComplete: boolean;
    };
    lastFetchedAt?: string;
    updatedAt?: string;
}

