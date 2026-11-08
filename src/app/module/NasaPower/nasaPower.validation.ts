import z from "zod";
import { NASA_POWER_CONSTANTS, resolveDistrictCoordinates } from "./nasaPower.constants.js";

const cleanDateString = (val: unknown): unknown => {

    if (typeof val === "string") {
        return val.replaceAll("-", "").trim();
    }
    return val;
};

export const nasaPowerZodSchema = z.preprocess(
    (obj: any) => {
        if (!obj || typeof obj !== "object") return obj;
        return {
            ...obj,
            start: cleanDateString(obj.start ?? obj.startDate),
            end: cleanDateString(obj.end ?? obj.endDate),
        };
    },
    z.object({
        latitude: z.coerce
            .number({ error: "Latitude is required" })
            .min(-90, "Latitude must be >= -90")
            .max(90, "Latitude must be <= 90"),

        longitude: z.coerce
            .number({ error: "Longitude is required" })
            .min(-180, "Longitude must be >= -180")
            .max(180, "Longitude must be <= 180"),

        start: z
            .string({ error: "Start date is required" })
            .regex(/^\d{8}$/, "Start date must be in YYYYMMDD format (e.g. 20250101)"),

        end: z
            .string({ error: "End date is required" })
            .regex(/^\d{8}$/, "End date must be in YYYYMMDD format (e.g. 20251231)"),
    }).refine(
        (data) => parseInt(data.start) <= parseInt(data.end),
        {
            message: "Start date must be before or equal to end date",
            path: ["end"],
        }
    ).refine(
        (data) => parseInt(data.start) >= 19810101,
        {
            message: "Start date must be >= 19810101 (NASA POWER data availability)",
            path: ["start"],
        }
    )
);

export const nasaPowerRegionalZodSchema = z.preprocess(
    (obj: any) => {
        if (!obj || typeof obj !== "object") return obj;
        return {
            latitudeMin:
                obj.latitudeMin ??
                obj.bottomLeftLat ??
                obj["Bottom-Left Lat"] ??
                obj.bottom_left_lat ??
                obj.latMin ??
                obj.minLat,
            latitudeMax:
                obj.latitudeMax ??
                obj.upperRightLat ??
                obj["Upper-Right Lat"] ??
                obj.upper_right_lat ??
                obj.latMax ??
                obj.maxLat,
            longitudeMin:
                obj.longitudeMin ??
                obj.bottomLeftLon ??
                obj["Bottom-Left Lon"] ??
                obj.bottom_left_lon ??
                obj.lonMin ??
                obj.minLon,
            longitudeMax:
                obj.longitudeMax ??
                obj.upperRightLon ??
                obj["Upper-Right Lon"] ??
                obj.upper_right_lon ??
                obj.lonMax ??
                obj.maxLon,
            start: cleanDateString(obj.start ?? obj.startDate),
            end: cleanDateString(obj.end ?? obj.endDate),
            includeGrid: obj.includeGrid,
        };
    },
    z.object({
        latitudeMin: z.coerce
            .number({ error: "latitudeMin (Bottom-Left Lat) is required" })
            .min(-90, "latitudeMin must be >= -90")
            .max(90, "latitudeMin must be <= 90"),

        latitudeMax: z.coerce
            .number({ error: "latitudeMax (Upper-Right Lat) is required" })
            .min(-90, "latitudeMax must be >= -90")
            .max(90, "latitudeMax must be <= 90"),

        longitudeMin: z.coerce
            .number({ error: "longitudeMin (Bottom-Left Lon) is required" })
            .min(-180, "longitudeMin must be >= -180")
            .max(180, "longitudeMin must be <= 180"),

        longitudeMax: z.coerce
            .number({ error: "longitudeMax (Upper-Right Lon) is required" })
            .min(-180, "longitudeMax must be >= -180")
            .max(180, "longitudeMax must be <= 180"),

        start: z
            .string({ error: "Start date is required" })
            .regex(/^\d{8}$/, "Start date must be in YYYYMMDD format (e.g. 20250101)"),

        end: z
            .string({ error: "End date is required" })
            .regex(/^\d{8}$/, "End date must be in YYYYMMDD format (e.g. 20251231)"),

        includeGrid: z
            .union([
                z.boolean(),
                z.enum(["true", "false"]).transform((val) => val === "true"),
            ])
            .optional()
            .default(false),
    }).refine(
        (data) => data.latitudeMin <= data.latitudeMax,
        {
            message: "latitudeMin must be less than or equal to latitudeMax",
            path: ["latitudeMin"],
        }
    ).refine(
        (data) => data.longitudeMin <= data.longitudeMax,
        {
            message: "longitudeMin must be less than or equal to longitudeMax",
            path: ["longitudeMin"],
        }
    ).refine(
        (data) => parseInt(data.start) <= parseInt(data.end),
        {
            message: "Start date must be before or equal to end date",
            path: ["end"],
        }
    ).refine(
        (data) => parseInt(data.start) >= 19810101,
        {
            message: "Start date must be >= 19810101 (NASA POWER data availability)",
            path: ["start"],
        }
    )
);

// ─── Historical 2-Year Regional Schemas ────────────────────────────────────────

export const nasaPowerHistoricalFetchZodSchema = z.preprocess(
    (obj: any) => {
        if (!obj || typeof obj !== "object") return obj;

        let latMin =
            obj.latitudeMin ??
            obj.bottomLeftLat ??
            obj["Bottom-Left Lat"] ??
            obj.bottom_left_lat ??
            obj.latMin ??
            obj.minLat;
        let latMax =
            obj.latitudeMax ??
            obj.upperRightLat ??
            obj["Upper-Right Lat"] ??
            obj.upper_right_lat ??
            obj.latMax ??
            obj.maxLat;
        let lonMin =
            obj.longitudeMin ??
            obj.bottomLeftLon ??
            obj["Bottom-Left Lon"] ??
            obj.bottom_left_lon ??
            obj.lonMin ??
            obj.minLon;
        let lonMax =
            obj.longitudeMax ??
            obj.upperRightLon ??
            obj["Upper-Right Lon"] ??
            obj.upper_right_lon ??
            obj.lonMax ??
            obj.maxLon;

        const district = typeof obj.district === "string" ? obj.district.trim() : undefined;
        if (district && (latMin === undefined || latMax === undefined || lonMin === undefined || lonMax === undefined)) {
            const resolved = resolveDistrictCoordinates(district);
            if (resolved) {
                latMin = latMin ?? resolved.bbox.latitudeMin;
                latMax = latMax ?? resolved.bbox.latitudeMax;
                lonMin = lonMin ?? resolved.bbox.longitudeMin;
                lonMax = lonMax ?? resolved.bbox.longitudeMax;
            }
        }

        // Default to whole Bangladesh BBox if no coordinates or district given
        if (latMin === undefined && latMax === undefined && lonMin === undefined && lonMax === undefined) {
            latMin = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.latitudeMin;
            latMax = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.latitudeMax;
            lonMin = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.longitudeMin;
            lonMax = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.longitudeMax;
        }

        return {
            latitudeMin: latMin,
            latitudeMax: latMax,
            longitudeMin: lonMin,
            longitudeMax: lonMax,
            district,
            start: cleanDateString(obj.start ?? obj.startDate),
            end: cleanDateString(obj.end ?? obj.endDate),
            forceRefresh: obj.forceRefresh,
        };
    },
    z.object({
        latitudeMin: z.coerce.number().min(-90).max(90),
        latitudeMax: z.coerce.number().min(-90).max(90),
        longitudeMin: z.coerce.number().min(-180).max(180),
        longitudeMax: z.coerce.number().min(-180).max(180),
        district: z.string().optional(),
        start: z
            .string({ error: "Start date is required" })
            .regex(/^\d{8}$/, "Start date must be in YYYYMMDD format (e.g. 20240101)"),
        end: z
            .string({ error: "End date is required" })
            .regex(/^\d{8}$/, "End date must be in YYYYMMDD format (e.g. 20251231)"),
        forceRefresh: z
            .union([
                z.boolean(),
                z.enum(["true", "false"]).transform((val) => val === "true"),
            ])
            .optional()
            .default(false),
    }).refine((data) => data.latitudeMin <= data.latitudeMax, {
        message: "latitudeMin must be <= latitudeMax",
        path: ["latitudeMin"],
    }).refine((data) => data.longitudeMin <= data.longitudeMax, {
        message: "longitudeMin must be <= longitudeMax",
        path: ["longitudeMin"],
    }).refine((data) => parseInt(data.start) <= parseInt(data.end), {
        message: "Start date must be before or equal to end date",
        path: ["end"],
    }).refine((data) => parseInt(data.start) >= 19810101, {
        message: "Start date must be >= 19810101 (NASA POWER data availability)",
        path: ["start"],
    })
);

export const nasaPowerHistoricalQueryZodSchema = z.preprocess(
    (obj: any) => {
        if (!obj || typeof obj !== "object") return obj;

        let latMin =
            obj.latitudeMin ??
            obj.bottomLeftLat ??
            obj["Bottom-Left Lat"] ??
            obj.bottom_left_lat ??
            obj.latMin ??
            obj.minLat;
        let latMax =
            obj.latitudeMax ??
            obj.upperRightLat ??
            obj["Upper-Right Lat"] ??
            obj.upper_right_lat ??
            obj.latMax ??
            obj.maxLat;
        let lonMin =
            obj.longitudeMin ??
            obj.bottomLeftLon ??
            obj["Bottom-Left Lon"] ??
            obj.bottom_left_lon ??
            obj.lonMin ??
            obj.minLon;
        let lonMax =
            obj.longitudeMax ??
            obj.upperRightLon ??
            obj["Upper-Right Lon"] ??
            obj.upper_right_lon ??
            obj.lonMax ??
            obj.maxLon;

        if ((obj.latitude !== undefined || obj.lat !== undefined) && (obj.longitude !== undefined || obj.lon !== undefined)) {
            const lat = Number(obj.latitude ?? obj.lat);
            const lon = Number(obj.longitude ?? obj.lon);
            latMin = parseFloat((lat - 0.25).toFixed(4));
            latMax = parseFloat((lat + 0.25).toFixed(4));
            lonMin = parseFloat((lon - 0.25).toFixed(4));
            lonMax = parseFloat((lon + 0.25).toFixed(4));
        }

        const district = typeof obj.district === "string" ? obj.district.trim() : undefined;
        if (district && (latMin === undefined || latMax === undefined || lonMin === undefined || lonMax === undefined)) {
            const resolved = resolveDistrictCoordinates(district);
            if (resolved) {
                latMin = latMin ?? resolved.bbox.latitudeMin;
                latMax = latMax ?? resolved.bbox.latitudeMax;
                lonMin = lonMin ?? resolved.bbox.longitudeMin;
                lonMax = lonMax ?? resolved.bbox.longitudeMax;
            }
        }

        if (latMin === undefined && latMax === undefined && lonMin === undefined && lonMax === undefined) {
            latMin = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.latitudeMin;
            latMax = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.latitudeMax;
            lonMin = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.longitudeMin;
            lonMax = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.longitudeMax;
        }

        return {
            latitudeMin: latMin,
            latitudeMax: latMax,
            longitudeMin: lonMin,
            longitudeMax: lonMax,
            district,
            start: cleanDateString(obj.start ?? obj.startDate),
            end: cleanDateString(obj.end ?? obj.endDate),
            mode: obj.mode ?? "full",
            autoFetch: obj.autoFetch,
        };
    },
    z.object({
        latitudeMin: z.coerce.number().min(-90).max(90),
        latitudeMax: z.coerce.number().min(-90).max(90),
        longitudeMin: z.coerce.number().min(-180).max(180),
        longitudeMax: z.coerce.number().min(-180).max(180),
        district: z.string().optional(),
        start: z
            .string({ error: "Start date is required" })
            .regex(/^\d{8}$/, "Start date must be in YYYYMMDD format (e.g. 20240101)"),
        end: z
            .string({ error: "End date is required" })
            .regex(/^\d{8}$/, "End date must be in YYYYMMDD format (e.g. 20251231)"),
        mode: z.enum(["summary", "daily", "monthly", "seasonal", "full"]).default("full"),
        autoFetch: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).optional().default(true),
    }).refine((data) => data.latitudeMin <= data.latitudeMax, {
        message: "latitudeMin must be <= latitudeMax",
        path: ["latitudeMin"],
    }).refine((data) => data.longitudeMin <= data.longitudeMax, {
        message: "longitudeMin must be <= longitudeMax",
        path: ["longitudeMin"],
    }).refine((data) => parseInt(data.start) <= parseInt(data.end), {
        message: "Start date must be before or equal to end date",
        path: ["end"],
    })
);

export const nasaPowerHistoricalStatusZodSchema = z.preprocess(
    (obj: any) => {
        if (!obj || typeof obj !== "object") return obj;

        let latMin =
            obj.latitudeMin ??
            obj.bottomLeftLat ??
            obj["Bottom-Left Lat"] ??
            obj.bottom_left_lat ??
            obj.latMin ??
            obj.minLat;
        let latMax =
            obj.latitudeMax ??
            obj.upperRightLat ??
            obj["Upper-Right Lat"] ??
            obj.upper_right_lat ??
            obj.latMax ??
            obj.maxLat;
        let lonMin =
            obj.longitudeMin ??
            obj.bottomLeftLon ??
            obj["Bottom-Left Lon"] ??
            obj.bottom_left_lon ??
            obj.lonMin ??
            obj.minLon;
        let lonMax =
            obj.longitudeMax ??
            obj.upperRightLon ??
            obj["Upper-Right Lon"] ??
            obj.upper_right_lon ??
            obj.lonMax ??
            obj.maxLon;

        const district = typeof obj.district === "string" ? obj.district.trim() : undefined;
        if (district && (latMin === undefined || latMax === undefined || lonMin === undefined || lonMax === undefined)) {
            const resolved = resolveDistrictCoordinates(district);
            if (resolved) {
                latMin = latMin ?? resolved.bbox.latitudeMin;
                latMax = latMax ?? resolved.bbox.latitudeMax;
                lonMin = lonMin ?? resolved.bbox.longitudeMin;
                lonMax = lonMax ?? resolved.bbox.longitudeMax;
            }
        }

        if (latMin === undefined && latMax === undefined && lonMin === undefined && lonMax === undefined) {
            latMin = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.latitudeMin;
            latMax = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.latitudeMax;
            lonMin = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.longitudeMin;
            lonMax = NASA_POWER_CONSTANTS.DEFAULT_BANGLADESH_BBOX.longitudeMax;
        }

        return {
            latitudeMin: latMin,
            latitudeMax: latMax,
            longitudeMin: lonMin,
            longitudeMax: lonMax,
            district,
            start: obj.start ? cleanDateString(obj.start ?? obj.startDate) : undefined,
            end: obj.end ? cleanDateString(obj.end ?? obj.endDate) : undefined,
        };
    },
    z.object({
        latitudeMin: z.coerce.number().min(-90).max(90),
        latitudeMax: z.coerce.number().min(-90).max(90),
        longitudeMin: z.coerce.number().min(-180).max(180),
        longitudeMax: z.coerce.number().min(-180).max(180),
        district: z.string().optional(),
        start: z.string().regex(/^\d{8}$/).optional(),
        end: z.string().regex(/^\d{8}$/).optional(),
    }).refine((data) => data.latitudeMin <= data.latitudeMax, {
        message: "latitudeMin must be <= latitudeMax",
        path: ["latitudeMin"],
    }).refine((data) => data.longitudeMin <= data.longitudeMax, {
        message: "longitudeMin must be <= longitudeMax",
        path: ["longitudeMin"],
    })
);


