import {
  SoilMoistureSurfaceCondition,
  SoilMoistureRootzoneCondition,
} from "./smap.constants.js";

export interface ISmapQueryParams {
  latitudeMin: number;
  latitudeMax: number;
  longitudeMin: number;
  longitudeMax: number;
  start: string; // YYYYMMDD or YYYY-MM-DD
  end: string;   // YYYYMMDD or YYYY-MM-DD
  includeGrid?: boolean;
}

export interface ISmapBbox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export interface ISmapPeriod {
  start: string;
  end: string;
  days: number;
}

export interface ISmapGridCell {
  latitude: number;
  longitude: number;
  surfaceMoisture: number | null;
  rootzoneMoisture: number | null;
}

export interface ISmapDailyRecord {
  date: string;
  timestamp: string; // ISO 8601 UTC timestamp
  surfaceSoilMoisture: number | null;
  rootZoneSoilMoisture: number | null;
  unit: string;
  validCells?: number;
  grid?: ISmapGridCell[];
}

export interface ISmapAggregationMethod {
  spatial: string;
  temporal: string;
  dailyDerivationExplanation: string;
}

export interface ISmapConditionMethod {
  rule: string;
  surface: {
    DRY_STRESS: string;
    OPTIMAL_MOISTURE: string;
    WATERLOGGED: string;
  };
  rootzone: {
    DEPLETED_RESERVE: string;
    ADEQUATE_RESERVE: string;
    SATURATED: string;
  };
}

export interface ISmapTimestampInfo {
  generatedAt: string;
  timezone: string;
}

export interface ISmapStatistics {
  surface: {
    mean: number | null;
    min: number | null;
    max: number | null;
    condition: SoilMoistureSurfaceCondition | "NO_DATA";
  };
  rootzone: {
    mean: number | null;
    min: number | null;
    max: number | null;
    condition: SoilMoistureRootzoneCondition | "NO_DATA";
  };
}

export interface ISmapResponse {
  source: string;
  dataset: string;
  version: string;
  unit: string;
  sourceVariable: {
    surface: string;
    rootzone: string;
  };
  resolution: string;
  temporalResolution: string;
  aggregationMethod: ISmapAggregationMethod;
  qualityFilter: string;
  conditionMethod: ISmapConditionMethod;
  timestamp: ISmapTimestampInfo;
  bbox: ISmapBbox;
  period?: ISmapPeriod;
  statistics?: ISmapStatistics;
  data: ISmapDailyRecord[];
}


export interface IRawSmapGranule {
  date: string;
  surfaceValues: number[];
  rootzoneValues: number[];
  gridCells: ISmapGridCell[];
}

// ─── Historical & 2-Year Ingestion Interfaces ──────────────────────────────────

export interface ISmapHistoricalFetchInput {
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

export interface ISmapHistoricalFetchOutput {
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

export interface ISmapHistoricalQueryInput {
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

export interface ISmapMonthlySummary {
  month: string; // YYYY-MM
  surfaceMoistureMean: number | null;
  rootzoneMoistureMean: number | null;
  surfaceCondition: string;
  rootzoneCondition: string;
  daysCount: number;
}

export interface ISmapSeasonalSummary {
  season: string;
  year: number;
  surfaceMoistureMean: number | null;
  rootzoneMoistureMean: number | null;
  surfaceCondition: string;
  rootzoneCondition: string;
  dryStressDays: number;
  optimalMoistureDays: number;
  waterloggedDays: number;
  daysCount: number;
}

export interface ISmapHistoricalDailyRecord {
  date: string;
  observedAt: string;
  surfaceSoilMoisture?: number | null;
  rootZoneSoilMoisture?: number | null;
  surfaceMoistureMean: number | null;
  surfaceMoistureMin: number | null;
  surfaceMoistureMax: number | null;
  rootzoneMoistureMean: number | null;
  rootzoneMoistureMin: number | null;
  rootzoneMoistureMax: number | null;
  surfaceCondition: string | null;
  rootzoneCondition: string | null;
  unit?: string;
  validCells: number | null;
}

export interface ISmapHistoricalQueryOutput {
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
    surface: {
      mean: number | null;
      min: number | null;
      max: number | null;
      condition: string;
    };
    rootzone: {
      mean: number | null;
      min: number | null;
      max: number | null;
      condition: string;
    };
  };
  coverage: {
    requestedDays: number;
    availableDays: number;
    missingDays: number;
    coveragePercentage: number;
  };
  data?: ISmapHistoricalDailyRecord[];
  records?: ISmapHistoricalDailyRecord[];
  daily?: ISmapHistoricalDailyRecord[];
  monthly?: ISmapMonthlySummary[];
  seasonal?: ISmapSeasonalSummary[];
}

export interface ISmapStatusOutput {
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

