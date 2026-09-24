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
  surfaceSoilMoisture: number | null;
  rootZoneSoilMoisture: number | null;
  validCells?: number;
  grid?: ISmapGridCell[];
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
  resolution: string;
  temporalResolution: string;
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
