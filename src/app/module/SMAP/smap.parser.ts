import { SMAP_CONSTANTS } from "./smap.constants.js";
import { ISmapGridCell, IRawSmapGranule } from "./smap.interface.js";

// EASE-Grid 2.0 Global (M09) Geodetic Parameters
const A = 6378137.0; // WGS84 semi-major axis (m)
const E = 0.08181919084262149; // WGS84 eccentricity
const PHI_0 = (30 * Math.PI) / 180; // Standard parallel 30 deg
const COS_PHI_0 = Math.cos(PHI_0);
const Y_0 = 7310037.17138672; // Origin Y top (row 0)
const X_0 = -17367530.44; // Origin X left (col 0)
const CELL_SIZE = 9008.055664; // Cell size in meters

export interface IEaseGridBoundingBox {
  rowMin: number;
  rowMax: number;
  colMin: number;
  colMax: number;
}

/**
 * Convert lat/lon in degrees to EASE-Grid 2.0 Global 9km (row, col)
 */
export const latLonToEase2Grid = (latDeg: number, lonDeg: number): { row: number; col: number } => {
  const phi = (latDeg * Math.PI) / 180;
  const lam = (lonDeg * Math.PI) / 180;

  const x = A * COS_PHI_0 * lam;
  const sinPhi = Math.sin(phi);
  const q =
    (1 - E * E) *
    (sinPhi / (1 - E * E * sinPhi * sinPhi) -
      (1 / (2 * E)) * Math.log((1 - E * sinPhi) / (1 + E * sinPhi)));
  const y = (A * q) / (2 * COS_PHI_0);

  const col = Math.round((x - X_0) / CELL_SIZE);
  const row = Math.round((Y_0 - y) / CELL_SIZE);

  return { row, col };
};

/**
 * Compute EASE-Grid bounding box indices from geographical bbox
 */
export const computeGridBoundingBox = (
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number
): IEaseGridBoundingBox => {
  const northWest = latLonToEase2Grid(latMax, lonMin);
  const southEast = latLonToEase2Grid(latMin, lonMax);

  const rawRowMin = Math.min(northWest.row, southEast.row);
  const rawRowMax = Math.max(northWest.row, southEast.row);
  const rawColMin = Math.min(northWest.col, southEast.col);
  const rawColMax = Math.max(northWest.col, southEast.col);

  return {
    rowMin: Math.max(0, Math.min(1623, rawRowMin)),
    rowMax: Math.max(0, Math.min(1623, rawRowMax)),
    colMin: Math.max(0, Math.min(3855, rawColMin)),
    colMax: Math.max(0, Math.min(3855, rawColMax)),
  };
};

/**
 * Parse OPeNDAP ASCII output into 2D matrices and structured records
 */
export const parseSmapAscii = (
  asciiText: string,
  dateFormatted: string
): IRawSmapGranule => {
  const lines = asciiText.split("\n");
  const dataMap: Record<string, number[][]> = {
    cell_lon: [],
    cell_lat: [],
    sm_rootzone: [],
    sm_surface: [],
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Dataset:")) continue;

    for (const key of ["cell_lon", "cell_lat", "sm_rootzone", "sm_surface"]) {
      if (trimmed.includes(key + "[")) {
        const commaIdx = trimmed.indexOf(",");
        if (commaIdx !== -1) {
          const vals = trimmed
            .slice(commaIdx + 1)
            .split(",")
            .map((v) => parseFloat(v.trim()))
            .filter((v) => !Number.isNaN(v));

          dataMap[key].push(vals);
        }
      }
    }
  }

  const surfaceValues: number[] = [];
  const rootzoneValues: number[] = [];
  const gridCells: ISmapGridCell[] = [];

  const lats = dataMap.cell_lat;
  const lons = dataMap.cell_lon;
  const surf = dataMap.sm_surface;
  const root = dataMap.sm_rootzone;

  const numRows = Math.min(surf.length, root.length);

  for (let r = 0; r < numRows; r++) {
    const rowSurf = surf[r] || [];
    const rowRoot = root[r] || [];
    const rowLat = lats[r] || [];
    const rowLon = lons[r] || [];

    const numCols = Math.min(rowSurf.length, rowRoot.length);

    for (let c = 0; c < numCols; c++) {
      const sVal = rowSurf[c];
      const rVal = rowRoot[c];
      const latVal = rowLat[c] ?? 0;
      const lonVal = rowLon[c] ?? 0;

      const isValidSurface =
        sVal !== undefined && sVal > SMAP_CONSTANTS.FILL_VALUE + 100 && sVal >= 0;
      const isValidRootzone =
        rVal !== undefined && rVal > SMAP_CONSTANTS.FILL_VALUE + 100 && rVal >= 0;

      if (isValidSurface) surfaceValues.push(sVal);
      if (isValidRootzone) rootzoneValues.push(rVal);

      if (isValidSurface || isValidRootzone) {
        gridCells.push({
          latitude: Number(latVal.toFixed(4)),
          longitude: Number(lonVal.toFixed(4)),
          surfaceMoisture: isValidSurface ? Number(sVal.toFixed(4)) : null,
          rootzoneMoisture: isValidRootzone ? Number(rVal.toFixed(4)) : null,
        });
      }
    }
  }

  return {
    date: dateFormatted,
    surfaceValues,
    rootzoneValues,
    gridCells,
  };
};
