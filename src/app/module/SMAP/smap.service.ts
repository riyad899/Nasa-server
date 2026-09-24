import { envVars } from "../../../config/env.js";
import AppError from "../../errorHelpers/appError.js";
import status from "http-status";
import {
  SMAP_CONSTANTS,
  SoilMoistureSurfaceCondition,
  SoilMoistureRootzoneCondition,
} from "./smap.constants.js";
import {
  ISmapQueryParams,
  ISmapResponse,
  ISmapDailyRecord,
  ISmapStatistics,
  IRawSmapGranule,
} from "./smap.interface.js";
import { SmapClient } from "./smap.client.js";
import { computeGridBoundingBox, parseSmapAscii } from "./smap.parser.js";

// In-memory cache for SMAP queries
interface ICacheEntry {
  data: IRawSmapGranule;
  expiresAt: number;
}
const smapCache = new Map<string, ICacheEntry>();

const formatIsoDate = (dateStr: string): string => {
  if (dateStr.includes("-")) return dateStr;
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
};

const getDaysList = (startStr: string, endStr: string): string[] => {
  const dates: string[] = [];
  const current = new Date(
    Date.UTC(
      parseInt(startStr.slice(0, 4), 10),
      parseInt(startStr.slice(4, 6), 10) - 1,
      parseInt(startStr.slice(6, 8), 10)
    )
  );
  const end = new Date(
    Date.UTC(
      parseInt(endStr.slice(0, 4), 10),
      parseInt(endStr.slice(4, 6), 10) - 1,
      parseInt(endStr.slice(6, 8), 10)
    )
  );

  while (current <= end) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, "0");
    const d = String(current.getUTCDate()).padStart(2, "0");
    dates.push(`${y}${m}${d}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
};

export const SmapService = {
  async getSoilMoisture(params: ISmapQueryParams): Promise<ISmapResponse> {
    const {
      latitudeMin,
      latitudeMax,
      longitudeMin,
      longitudeMax,
      start,
      end,
      includeGrid = false,
    } = params;

    const days = getDaysList(start, end);
    if (days.length > envVars.SMAP.MAX_DAYS) {
      throw new AppError(
        `Requested date range exceeds maximum allowed of ${envVars.SMAP.MAX_DAYS} days`,
        status.BAD_REQUEST
      );
    }

    const { rowMin, rowMax, colMin, colMax } = computeGridBoundingBox(
      latitudeMin,
      latitudeMax,
      longitudeMin,
      longitudeMax
    );

    const now = Date.now();
    const dailyRecords: ISmapDailyRecord[] = [];
    const allSurfaceValues: number[] = [];
    const allRootzoneValues: number[] = [];

    // Fetch days with concurrency limit of 3
    const concurrency = 3;
    for (let i = 0; i < days.length; i += concurrency) {
      const batch = days.slice(i, i + concurrency);

      const results = await Promise.all(
        batch.map(async (dayStr) => {
          const cacheKey = `smap:${dayStr}:${rowMin}:${rowMax}:${colMin}:${colMax}`;
          const cached = smapCache.get(cacheKey);

          if (cached && cached.expiresAt > now) {
            return cached.data;
          }

          try {
            const granules = await SmapClient.searchGranulesForDate(dayStr);
            if (!granules.length) {
              return {
                date: formatIsoDate(dayStr),
                surfaceValues: [],
                rootzoneValues: [],
                gridCells: [],
              };
            }

            // Pick representative daytime/afternoon or first available granule
            const targetGranule =
              granules.find((g) => g.title.includes("T013000") || g.title.includes("T133000")) ||
              granules[0];

            const asciiText = await SmapClient.fetchOpendapSubset(
              targetGranule.opendapUrl,
              rowMin,
              rowMax,
              colMin,
              colMax
            );

            const parsed = parseSmapAscii(asciiText, formatIsoDate(dayStr));

            smapCache.set(cacheKey, {
              data: parsed,
              expiresAt: now + envVars.SMAP.CACHE_TTL_MS,
            });

            return parsed;
          } catch (error) {
            // If individual day fails, return empty day record without crashing full batch
            console.warn(`[SMAP] Failed to fetch data for ${dayStr}:`, (error as Error).message);
            return {
              date: formatIsoDate(dayStr),
              surfaceValues: [],
              rootzoneValues: [],
              gridCells: [],
            };
          }
        })
      );

      for (const res of results) {
        const hasSurface = res.surfaceValues.length > 0;
        const hasRootzone = res.rootzoneValues.length > 0;

        const avgSurface = hasSurface
          ? Number(
              (
                res.surfaceValues.reduce((a, b) => a + b, 0) /
                res.surfaceValues.length
              ).toFixed(4)
            )
          : null;

        const avgRootzone = hasRootzone
          ? Number(
              (
                res.rootzoneValues.reduce((a, b) => a + b, 0) /
                res.rootzoneValues.length
              ).toFixed(4)
            )
          : null;

        if (hasSurface) allSurfaceValues.push(...res.surfaceValues);
        if (hasRootzone) allRootzoneValues.push(...res.rootzoneValues);

        const record: ISmapDailyRecord = {
          date: res.date,
          surfaceSoilMoisture: avgSurface,
          rootZoneSoilMoisture: avgRootzone,
          validCells: Math.max(res.surfaceValues.length, res.rootzoneValues.length),
        };

        if (includeGrid) {
          record.grid = res.gridCells;
        }

        dailyRecords.push(record);
      }
    }

    // Multi-day statistics calculation
    const calcStats = (values: number[]) => {
      if (!values.length) {
        return { mean: null, min: null, max: null };
      }
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = Number((sum / values.length).toFixed(4));
      const min = Number(Math.min(...values).toFixed(4));
      const max = Number(Math.max(...values).toFixed(4));
      return { mean, min, max };
    };

    const surfStats = calcStats(allSurfaceValues);
    const rootStats = calcStats(allRootzoneValues);

    let surfaceCondition: SoilMoistureSurfaceCondition | "NO_DATA" = "NO_DATA";
    if (surfStats.mean !== null) {
      if (surfStats.mean < SMAP_CONSTANTS.THRESHOLDS.SURFACE.DRY_STRESS) {
        surfaceCondition = SoilMoistureSurfaceCondition.DRY_STRESS;
      } else if (surfStats.mean <= SMAP_CONSTANTS.THRESHOLDS.SURFACE.OPTIMAL_MAX) {
        surfaceCondition = SoilMoistureSurfaceCondition.OPTIMAL_MOISTURE;
      } else {
        surfaceCondition = SoilMoistureSurfaceCondition.WATERLOGGED;
      }
    }

    let rootzoneCondition: SoilMoistureRootzoneCondition | "NO_DATA" = "NO_DATA";
    if (rootStats.mean !== null) {
      if (rootStats.mean < SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.DEPLETED_STRESS) {
        rootzoneCondition = SoilMoistureRootzoneCondition.DEPLETED_RESERVE;
      } else if (rootStats.mean <= SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.ADEQUATE_MAX) {
        rootzoneCondition = SoilMoistureRootzoneCondition.ADEQUATE_RESERVE;
      } else {
        rootzoneCondition = SoilMoistureRootzoneCondition.SATURATED;
      }
    }

    const statistics: ISmapStatistics = {
      surface: {
        ...surfStats,
        condition: surfaceCondition,
      },
      rootzone: {
        ...rootStats,
        condition: rootzoneCondition,
      },
    };

    return {
      source: SMAP_CONSTANTS.SOURCE,
      dataset: SMAP_CONSTANTS.DATASET,
      version: SMAP_CONSTANTS.VERSION,
      resolution: SMAP_CONSTANTS.RESOLUTION,
      temporalResolution: SMAP_CONSTANTS.TEMPORAL_RESOLUTION,
      bbox: {
        latMin: latitudeMin,
        latMax: latitudeMax,
        lonMin: longitudeMin,
        lonMax: longitudeMax,
      },
      period: {
        start: formatIsoDate(start),
        end: formatIsoDate(end),
        days: days.length,
      },
      statistics,
      data: dailyRecords,
    };
  },
};
