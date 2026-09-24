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
