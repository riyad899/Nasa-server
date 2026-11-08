export interface ImergQuery {
    latitudeMin: number;
    latitudeMax: number;
    longitudeMin: number;
    longitudeMax: number;
    start: string;
    end: string;
    includeGrid: boolean;
}

export interface GridCell {
    latitude: number;
    longitude: number;
    rainfall: number | null;
}

export interface DailySummary {
    meanRainfall: number | null;
    maximumRainfall: number | null;
    minimumRainfall: number | null;
    validCells: number;
    missingCells: number;
}

export interface DailyRainfall {
    date: string;
    summary: DailySummary;
    grid?: GridCell[];
}

export interface ImergOutput {
    source: "NASA_GPM_IMERG";
    product: "GPM_3IMERGDF_07";
    variable: "precipitation";
    units: string;
    doi: string;
    spatialResolution: string;
    period: {
        start: string;
        end: string;
        days: number;
        daysWithData: number;
    };
    region: Omit<ImergQuery, "start" | "end" | "includeGrid">;
    gridInfo: {
        cells: number;
        latitudes: number;
        longitudes: number;
        cellCentreBounds: {
            latitudeMin: number;
            latitudeMax: number;
            longitudeMin: number;
            longitudeMax: number;
        };
    };
    statistics: {
        totalRainfall: number;
        averageRainfall: number;
        maximumDailyRainfall: number;
        minimumDailyRainfall: number;
        rainyDays: number;
        dryDays: number;
        heavyRainfallDays: number;
        heavyRainfallCellDays: number;
        wettestDay: { date: string; rainfall: number } | null;
        driestDay: { date: string; rainfall: number } | null;
        peakCell: { date: string; latitude: number; longitude: number; rainfall: number } | null;
        thresholds: { rainyDayMm: number; heavyRainMm: number };
        method: string;
    };
    data: DailyRainfall[];
    missingDates: string[];
    warnings: string[];
    notes: string[];
}

export interface DapMetadata {
    units: string;
    fillValue: number;
    doi: string;
}

export interface CoordinateWindow {
    values: number[];
    start: number;
    end: number;
}

// ─── Historical & 2-Year Ingestion Interfaces ──────────────────────────────────

export interface IImergHistoricalFetchInput {
    latitude?: number;
    longitude?: number;
    latitudeMin?: number;
    latitudeMax?: number;
    longitudeMin?: number;
    longitudeMax?: number;
    district?: string;
    start: string; // YYYYMMDD
    end: string;   // YYYYMMDD
    forceRefresh?: boolean;
}

export interface IImergHistoricalFetchOutput {
    source: string;
    status: "COMPLETED" | "PARTIAL" | "FAILED";
    datasetId?: string;
    regionKey: string;
    region: {
        latitudeMin: number;
        latitudeMax: number;
        longitudeMin: number;
        longitudeMax: number;
        latitude?: number;
        longitude?: number;
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
    coverage: {
        requestedDays: number;
        returnedDays: number;
        missingDays: number;
        duplicateDays: number;
        coveragePercentage: number;
        missingDates?: string[];
    };
    fetchSummary: {
        chunksRequested: number;
        chunksSucceeded: number;
        chunksFailed: number;
        failedChunks?: Array<{ start: string; end: string; error: string }>;
    };
}

export interface IImergHistoricalQueryInput {
    latitude?: number;
    longitude?: number;
    latitudeMin?: number;
    latitudeMax?: number;
    longitudeMin?: number;
    longitudeMax?: number;
    district?: string;
    start: string;
    end: string;
    mode?: "summary" | "daily" | "monthly" | "seasonal" | "full";
    autoFetch?: boolean;
}

export interface IImergMonthlySummary {
    month: string; // YYYY-MM
    totalRainfall: number;
    meanDailyRainfall: number;
    maxDailyRainfall: number;
    rainyDays: number;
    dryDays: number;
    heavyRainfallDays: number;
    daysCount: number;
}

export interface IImergSeasonalSummary {
    season: string;
    year: number;
    totalRainfall: number;
    meanDailyRainfall: number;
    rainyDays: number;
    dryDays: number;
    heavyRainfallDays: number;
    maxConsecutiveDryDays: number;
    daysCount: number;
}

export interface IImergHistoricalRecord {
    date: string;
    observedAt: string;
    rainfall?: number | null;
    meanRainfall: number | null;
    minRainfall: number | null;
    maxRainfall: number | null;
    condition?: string;
    season?: string;
    unit?: string;
    validCells: number | null;
    isRainy: boolean;
    isHeavyRain: boolean;
}

export interface IImergHistoricalQueryOutput {
    source: "DATABASE";
    regionKey: string;
    district?: string;
    region: {
        latitudeMin: number;
        latitudeMax: number;
        longitudeMin: number;
        longitudeMax: number;
        latitude?: number;
        longitude?: number;
    };
    period: {
        start: string;
        end: string;
        days: number;
    };
    totalRecords?: number;
    summary: {
        totalRainfall: number;
        averageDailyRainfall: number;
        maximumDailyRainfall: number;
        minimumDailyRainfall: number;
        rainyDays: number;
        dryDays: number;
        heavyRainfallDays: number;
    };
    coverage: {
        requestedDays: number;
        availableDays: number;
        missingDays: number;
        coveragePercentage: number;
    };
    data?: IImergHistoricalRecord[];
    records?: IImergHistoricalRecord[];
    daily?: IImergHistoricalRecord[];
    monthly?: IImergMonthlySummary[];
    seasonal?: IImergSeasonalSummary[];
}

export interface IImergStatusOutput {
    exists: boolean;
    regionKey: string;
    district?: string;
    status?: string;
    storedDateRange?: {
        earliest: string;
        latest: string;
        totalRecords: number;
    };
}
