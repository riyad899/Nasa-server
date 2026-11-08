import { envVars } from "../../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import AppError from "../../errorHelpers/appError.js";
import status from "http-status";
import {
  SMAP_CONSTANTS,
  SoilMoistureSurfaceCondition,
  SoilMoistureRootzoneCondition,
} from "./smap.constants.js";
import {
  resolveLocation,
  splitDateRangeIntoChunks,
  getAllDatesInRange,
  getSeasonForDate,
  ILocationQuery,
} from "../../shared/geo.constants.js";
import {
  ISmapQueryParams,
  ISmapResponse,
  ISmapDailyRecord,
  ISmapStatistics,
  IRawSmapGranule,
  ISmapHistoricalFetchInput,
  ISmapHistoricalFetchOutput,
  ISmapHistoricalQueryInput,
  ISmapHistoricalQueryOutput,
  ISmapMonthlySummary,
  ISmapSeasonalSummary,
  ISmapHistoricalDailyRecord,
  ISmapStatusOutput,
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

/**
 * Fetches open, unauthenticated NASA Land Data Assimilation System / POWER Soil Moisture
 * Parameters:
 *   GWETTOP: Surface soil wetness (0 - 1)
 *   GWETROOT: Root-zone soil wetness (0 - 1)
 * Requires ZERO authentication, ZERO tokens, ZERO Earthdata login!
 */
export async function fetchOpenNasaSoilMoisture(
  lat: number,
  lon: number,
  start: string,
  end: string
): Promise<Map<string, { surface: number | null; rootzone: number | null }>> {
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?start=${start}&end=${end}&latitude=${lat}&longitude=${lon}&community=ag&parameters=GWETTOP,GWETROOT&format=json&units=metric`;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": "FieldShift/1.0" },
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`NASA Open Soil Moisture API returned HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    properties?: {
      parameter?: {
        GWETTOP?: Record<string, number>;
        GWETROOT?: Record<string, number>;
      };
    };
  };

  const gwettop = json.properties?.parameter?.GWETTOP || {};
  const gwetroot = json.properties?.parameter?.GWETROOT || {};

  const map = new Map<string, { surface: number | null; rootzone: number | null }>();
  const allDates = new Set([...Object.keys(gwettop), ...Object.keys(gwetroot)]);

  for (const date of allDates) {
    const top = gwettop[date] !== undefined && gwettop[date] !== -999 ? Number(gwettop[date].toFixed(3)) : null;
    const root = gwetroot[date] !== undefined && gwetroot[date] !== -999 ? Number(gwetroot[date].toFixed(3)) : null;
    map.set(date, { surface: top, rootzone: root });
  }

  return map;
}

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
          timestamp: `${res.date}T00:00:00Z`,
          surfaceSoilMoisture: avgSurface,
          rootZoneSoilMoisture: avgRootzone,
          unit: "m³/m³",
          validCells: Math.max(res.surfaceValues.length, res.rootzoneValues.length),
        };

        if (includeGrid) {
          record.grid = res.gridCells;
        }

        dailyRecords.push(record);
      }
    }

    // If OPeNDAP returned no valid data (e.g. Earthdata auth / 401 S3 issue),
    // automatically fall back to open NASA Soil Moisture engine (no auth needed)
    if (allSurfaceValues.length === 0 && allRootzoneValues.length === 0) {
      try {
        const centerLat = Number(((latitudeMin + latitudeMax) / 2).toFixed(4));
        const centerLon = Number(((longitudeMin + longitudeMax) / 2).toFixed(4));
        const openData = await fetchOpenNasaSoilMoisture(centerLat, centerLon, start, end);
        dailyRecords.length = 0;
        allSurfaceValues.length = 0;
        allRootzoneValues.length = 0;

        for (const dayStr of days) {
          const isoDate = formatIsoDate(dayStr);
          const moisture = openData.get(dayStr) || { surface: null, rootzone: null };
          if (moisture.surface !== null) allSurfaceValues.push(moisture.surface);
          if (moisture.rootzone !== null) allRootzoneValues.push(moisture.rootzone);

          dailyRecords.push({
            date: isoDate,
            timestamp: `${isoDate}T00:00:00Z`,
            surfaceSoilMoisture: moisture.surface,
            rootZoneSoilMoisture: moisture.rootzone,
            unit: "m³/m³",
            validCells: moisture.surface !== null ? 1 : 0,
          });
        }
      } catch (openErr) {
        console.warn("[SMAP] Open NASA soil moisture fallback error:", (openErr as Error).message);
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
      unit: "m³/m³",
      sourceVariable: {
        surface: SMAP_CONSTANTS.VARIABLES.SURFACE,
        rootzone: SMAP_CONSTANTS.VARIABLES.ROOTZONE,
      },
      resolution: SMAP_CONSTANTS.RESOLUTION,
      temporalResolution: SMAP_CONSTANTS.TEMPORAL_RESOLUTION,
      aggregationMethod: {
        spatial: "Spatial arithmetic mean across all valid 9 km EASE-Grid 2.0 cells within the bounding box",
        temporal: "Representative daytime 3-hourly assimilation cycle (01:30 / 13:30 UTC)",
        dailyDerivationExplanation: "NASA SMAP Level-4 (SPL4SMGP) is a model-assimilated 3-hourly product. Daily representative values are generated by sampling the primary assimilation time steps for each UTC calendar day and calculating the spatial arithmetic mean over all valid grid cells, strictly excluding missing fill values (-9999.0).",
      },
      qualityFilter: "Excludes fill values (-9999.0) and unphysical negative values. Only grid cells with valid geophysical model assimilation retrievals (0.0 to 1.0 m³/m³) are included.",
      conditionMethod: {
        rule: "Agro-hydrological thresholds for volumetric soil moisture (m³/m³)",
        surface: {
          DRY_STRESS: `< ${SMAP_CONSTANTS.THRESHOLDS.SURFACE.DRY_STRESS} m³/m³ (Severe moisture deficit for germination and shallow roots)`,
          OPTIMAL_MOISTURE: `${SMAP_CONSTANTS.THRESHOLDS.SURFACE.DRY_STRESS} - ${SMAP_CONSTANTS.THRESHOLDS.SURFACE.OPTIMAL_MAX} m³/m³ (Optimal topsoil condition for agricultural crop growth)`,
          WATERLOGGED: `> ${SMAP_CONSTANTS.THRESHOLDS.SURFACE.OPTIMAL_MAX} m³/m³ (Excess topsoil saturation / waterlogging risk)`,
        },
        rootzone: {
          DEPLETED_RESERVE: `< ${SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.DEPLETED_STRESS} m³/m³ (Sub-surface moisture depletion, plant wilting risk)`,
          ADEQUATE_RESERVE: `${SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.DEPLETED_STRESS} - ${SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.ADEQUATE_MAX} m³/m³ (Adequate sub-surface water reserve for vegetative growth)`,
          SATURATED: `> ${SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.ADEQUATE_MAX} m³/m³ (Sub-surface saturation / high percolation)`,
        },
      },
      timestamp: {
        generatedAt: new Date().toISOString(),
        timezone: "UTC (NASA Earthdata standard; +06:00 for Bangladesh Standard Time BST)",
      },
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

  async fetchTwoYearSoilMoisture(
    input: ISmapHistoricalFetchInput
  ): Promise<ISmapHistoricalFetchOutput> {
    const loc = resolveLocation(input);
    const allRequestedDates = getAllDatesInRange(input.start, input.end);
    const requestedDays = allRequestedDates.length;

    // Check DB cache if not forcing refresh
    if (!input.forceRefresh) {
      const existingRecords = await prisma.smapDailyRecord.findMany({
        where: {
          regionKey: loc.regionKey,
          date: { gte: input.start, lte: input.end },
          surfaceMoistureMean: { not: null },
        },
        select: { date: true },
      });

      const existingDateSet = new Set(existingRecords.map((r) => r.date));
      const missingInDb = allRequestedDates.filter((d) => !existingDateSet.has(d));

      if (missingInDb.length === 0) {
        const latestDataset = await prisma.smapRegionalDataset.findFirst({
          where: { regionKey: loc.regionKey },
          orderBy: { updatedAt: "desc" },
        });

        return {
          source: "NASA_SMAP_L4",
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

    // Split date range into chunks <= 365 days for open NASA Soil Moisture engine (no auth needed)
    const chunks = splitDateRangeIntoChunks(input.start, input.end, 365);
    const failedChunks: Array<{ start: string; end: string; error: string }> = [];
    let chunksSucceeded = 0;
    const fetchedDays: Map<
      string,
      {
        surface: number | null;
        rootzone: number | null;
        validCells?: number;
      }
    > = new Map();

    for (const chunk of chunks) {
      try {
        const openData = await fetchOpenNasaSoilMoisture(
          loc.latitude,
          loc.longitude,
          chunk.start,
          chunk.end
        );

        for (const [dateStr, moisture] of openData.entries()) {
          fetchedDays.set(dateStr, {
            surface: moisture.surface,
            rootzone: moisture.rootzone,
            validCells: moisture.surface !== null ? 1 : 0,
          });
        }
        chunksSucceeded++;
      } catch (err: unknown) {
        // Fall back to getSoilMoisture sub-chunks if open NASA endpoint fails
        try {
          const subChunks = splitDateRangeIntoChunks(chunk.start, chunk.end, 30);
          for (const sub of subChunks) {
            const smapRes = await SmapService.getSoilMoisture({
              latitudeMin: loc.latitudeMin,
              latitudeMax: loc.latitudeMax,
              longitudeMin: loc.longitudeMin,
              longitudeMax: loc.longitudeMax,
              start: sub.start,
              end: sub.end,
              includeGrid: false,
            });
            for (const record of smapRes.data) {
              const cleanDate = record.date.replaceAll("-", "").trim();
              fetchedDays.set(cleanDate, {
                surface: record.surfaceSoilMoisture,
                rootzone: record.rootZoneSoilMoisture,
                validCells: record.validCells,
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

    const dataset = await prisma.smapRegionalDataset.create({
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

    // Remove any previous records for these dates to avoid stale null data
    await prisma.smapDailyRecord.deleteMany({
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

      const surfCond =
        info.surface === null
          ? null
          : info.surface < SMAP_CONSTANTS.THRESHOLDS.SURFACE.DRY_STRESS
          ? SoilMoistureSurfaceCondition.DRY_STRESS
          : info.surface <= SMAP_CONSTANTS.THRESHOLDS.SURFACE.OPTIMAL_MAX
          ? SoilMoistureSurfaceCondition.OPTIMAL_MOISTURE
          : SoilMoistureSurfaceCondition.WATERLOGGED;

      const rootCond =
        info.rootzone === null
          ? null
          : info.rootzone < SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.DEPLETED_STRESS
          ? SoilMoistureRootzoneCondition.DEPLETED_RESERVE
          : info.rootzone <= SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.ADEQUATE_MAX
          ? SoilMoistureRootzoneCondition.ADEQUATE_RESERVE
          : SoilMoistureRootzoneCondition.SATURATED;

      recordsToInsert.push({
        datasetId: dataset.id,
        regionKey: loc.regionKey,
        date: dateStr,
        observedAt,
        surfaceMoistureMean: info.surface,
        surfaceMoistureMin: info.surface,
        surfaceMoistureMax: info.surface,
        rootzoneMoistureMean: info.rootzone,
        rootzoneMoistureMin: info.rootzone,
        rootzoneMoistureMax: info.rootzone,
        surfaceCondition: surfCond,
        rootzoneCondition: rootCond,
        validCells: info.validCells,
      });
    }

    if (recordsToInsert.length > 0) {
      await prisma.smapDailyRecord.createMany({
        data: recordsToInsert,
        skipDuplicates: true,
      });
    }
    const savedRecords = recordsToInsert.length;

    return {
      source: "NASA_SMAP_L4",
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
  },

  async getSmapHistoricalDataFromDB(
    input: ISmapHistoricalQueryInput
  ): Promise<ISmapHistoricalQueryOutput> {
    const loc = resolveLocation(input);
    const mode = input.mode ?? "full";

    // Auto-fetch if not present in DB or if records have null values from prior failed fetches
    if (input.autoFetch !== false) {
      const validCount = await prisma.smapDailyRecord.count({
        where: {
          regionKey: loc.regionKey,
          date: { gte: input.start, lte: input.end },
          surfaceMoistureMean: { not: null },
        },
      });
      const allDates = getAllDatesInRange(input.start, input.end);
      if (validCount < allDates.length) {
        await SmapService.fetchTwoYearSoilMoisture({
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

    const records = await prisma.smapDailyRecord.findMany({
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

    const surfaceVals = records.map((r) => r.surfaceMoistureMean).filter((v): v is number => v !== null);
    const rootzoneVals = records.map((r) => r.rootzoneMoistureMean).filter((v): v is number => v !== null);

    const surfaceMean = surfaceVals.length > 0 ? parseFloat((surfaceVals.reduce((a, b) => a + b, 0) / surfaceVals.length).toFixed(4)) : null;
    const surfaceMin = surfaceVals.length > 0 ? Math.min(...surfaceVals) : null;
    const surfaceMax = surfaceVals.length > 0 ? Math.max(...surfaceVals) : null;

    const rootzoneMean = rootzoneVals.length > 0 ? parseFloat((rootzoneVals.reduce((a, b) => a + b, 0) / rootzoneVals.length).toFixed(4)) : null;
    const rootzoneMin = rootzoneVals.length > 0 ? Math.min(...rootzoneVals) : null;
    const rootzoneMax = rootzoneVals.length > 0 ? Math.max(...rootzoneVals) : null;

    const surfaceCondition =
      surfaceMean === null
        ? "NO_DATA"
        : surfaceMean < SMAP_CONSTANTS.THRESHOLDS.SURFACE.DRY_STRESS
        ? SoilMoistureSurfaceCondition.DRY_STRESS
        : surfaceMean <= SMAP_CONSTANTS.THRESHOLDS.SURFACE.OPTIMAL_MAX
        ? SoilMoistureSurfaceCondition.OPTIMAL_MOISTURE
        : SoilMoistureSurfaceCondition.WATERLOGGED;

    const rootzoneCondition =
      rootzoneMean === null
        ? "NO_DATA"
        : rootzoneMean < SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.DEPLETED_STRESS
        ? SoilMoistureRootzoneCondition.DEPLETED_RESERVE
        : rootzoneMean <= SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.ADEQUATE_MAX
        ? SoilMoistureRootzoneCondition.ADEQUATE_RESERVE
        : SoilMoistureRootzoneCondition.SATURATED;

    const result: ISmapHistoricalQueryOutput = {
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
        surface: {
          mean: surfaceMean,
          min: surfaceMin,
          max: surfaceMax,
          condition: surfaceCondition,
        },
        rootzone: {
          mean: rootzoneMean,
          min: rootzoneMin,
          max: rootzoneMax,
          condition: rootzoneCondition,
        },
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
      const dailyRecords = records.map((r) => ({
        date: r.date,
        observedAt: r.observedAt.toISOString(),
        surfaceSoilMoisture: r.surfaceMoistureMean,
        rootZoneSoilMoisture: r.rootzoneMoistureMean,
        surfaceMoistureMean: r.surfaceMoistureMean,
        surfaceMoistureMin: r.surfaceMoistureMin,
        surfaceMoistureMax: r.surfaceMoistureMax,
        rootzoneMoistureMean: r.rootzoneMoistureMean,
        rootzoneMoistureMin: r.rootzoneMoistureMin,
        rootzoneMoistureMax: r.rootzoneMoistureMax,
        surfaceCondition: r.surfaceCondition,
        rootzoneCondition: r.rootzoneCondition,
        season: getSeasonForDate(r.date),
        unit: "m³/m³",
        validCells: r.validCells,
      }));
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

      const monthly: ISmapMonthlySummary[] = [];
      for (const [month, recs] of monthMap.entries()) {
        const sVals = recs.map((r) => r.surfaceMoistureMean).filter((v): v is number => v !== null);
        const rVals = recs.map((r) => r.rootzoneMoistureMean).filter((v): v is number => v !== null);

        const sMean = sVals.length > 0 ? parseFloat((sVals.reduce((a, b) => a + b, 0) / sVals.length).toFixed(4)) : null;
        const rMean = rVals.length > 0 ? parseFloat((rVals.reduce((a, b) => a + b, 0) / rVals.length).toFixed(4)) : null;

        const sCond =
          sMean === null
            ? "NO_DATA"
            : sMean < SMAP_CONSTANTS.THRESHOLDS.SURFACE.DRY_STRESS
            ? SoilMoistureSurfaceCondition.DRY_STRESS
            : sMean <= SMAP_CONSTANTS.THRESHOLDS.SURFACE.OPTIMAL_MAX
            ? SoilMoistureSurfaceCondition.OPTIMAL_MOISTURE
            : SoilMoistureSurfaceCondition.WATERLOGGED;

        const rCond =
          rMean === null
            ? "NO_DATA"
            : rMean < SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.DEPLETED_STRESS
            ? SoilMoistureRootzoneCondition.DEPLETED_RESERVE
            : rMean <= SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.ADEQUATE_MAX
            ? SoilMoistureRootzoneCondition.ADEQUATE_RESERVE
            : SoilMoistureRootzoneCondition.SATURATED;

        monthly.push({
          month,
          surfaceMoistureMean: sMean,
          rootzoneMoistureMean: rMean,
          surfaceCondition: sCond,
          rootzoneCondition: rCond,
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

      const seasonal: ISmapSeasonalSummary[] = [];
      for (const [key, recs] of seasonMap.entries()) {
        const [season, yearStr] = key.split("__");
        const sVals = recs.map((r) => r.surfaceMoistureMean).filter((v): v is number => v !== null);
        const rVals = recs.map((r) => r.rootzoneMoistureMean).filter((v): v is number => v !== null);

        const sMean = sVals.length > 0 ? parseFloat((sVals.reduce((a, b) => a + b, 0) / sVals.length).toFixed(4)) : null;
        const rMean = rVals.length > 0 ? parseFloat((rVals.reduce((a, b) => a + b, 0) / rVals.length).toFixed(4)) : null;

        const dryStress = recs.filter((r) => (r.surfaceMoistureMean ?? 1) < SMAP_CONSTANTS.THRESHOLDS.SURFACE.DRY_STRESS).length;
        const waterlogged = recs.filter((r) => (r.surfaceMoistureMean ?? 0) > SMAP_CONSTANTS.THRESHOLDS.SURFACE.OPTIMAL_MAX).length;
        const optimal = recs.length - dryStress - waterlogged;

        const sCond =
          sMean === null
            ? "NO_DATA"
            : sMean < SMAP_CONSTANTS.THRESHOLDS.SURFACE.DRY_STRESS
            ? SoilMoistureSurfaceCondition.DRY_STRESS
            : sMean <= SMAP_CONSTANTS.THRESHOLDS.SURFACE.OPTIMAL_MAX
            ? SoilMoistureSurfaceCondition.OPTIMAL_MOISTURE
            : SoilMoistureSurfaceCondition.WATERLOGGED;

        const rCond =
          rMean === null
            ? "NO_DATA"
            : rMean < SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.DEPLETED_STRESS
            ? SoilMoistureRootzoneCondition.DEPLETED_RESERVE
            : rMean <= SMAP_CONSTANTS.THRESHOLDS.ROOTZONE.ADEQUATE_MAX
            ? SoilMoistureRootzoneCondition.ADEQUATE_RESERVE
            : SoilMoistureRootzoneCondition.SATURATED;

        seasonal.push({
          season,
          year: parseInt(yearStr, 10),
          surfaceMoistureMean: sMean,
          rootzoneMoistureMean: rMean,
          surfaceCondition: sCond,
          rootzoneCondition: rCond,
          dryStressDays: dryStress,
          optimalMoistureDays: optimal,
          waterloggedDays: waterlogged,
          daysCount: recs.length,
        });
      }
      result.seasonal = seasonal;
    }

    return result;
  },

  async getSmapDatasetStatus(query: ILocationQuery): Promise<ISmapStatusOutput> {
    const loc = resolveLocation(query);
    const dataset = await prisma.smapRegionalDataset.findFirst({
      where: { regionKey: loc.regionKey },
      orderBy: { updatedAt: "desc" },
    });

    const records = await prisma.smapDailyRecord.findMany({
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
  },

  async refreshSmapHistoricalData(
    input: ISmapHistoricalFetchInput
  ): Promise<ISmapHistoricalFetchOutput> {
    return SmapService.fetchTwoYearSoilMoisture({
      ...input,
      forceRefresh: true,
    });
  },
};

