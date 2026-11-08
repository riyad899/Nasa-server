import { z } from "zod";

const normalizeDate = (val: unknown): string => {
  if (typeof val !== "string") return "";
  const cleaned = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned.replace(/-/g, "");
  }
  return cleaned;
};

export const smapQuerySchema = z
  .object({
    // Latitude aliases
    latitudeMin: z.coerce.number().min(-90).max(90).optional(),
    latMin: z.coerce.number().min(-90).max(90).optional(),
    bottomLeftLat: z.coerce.number().min(-90).max(90).optional(),
    "Bottom-Left Lat": z.coerce.number().min(-90).max(90).optional(),

    latitudeMax: z.coerce.number().min(-90).max(90).optional(),
    latMax: z.coerce.number().min(-90).max(90).optional(),
    upperRightLat: z.coerce.number().min(-90).max(90).optional(),
    "Upper-Right Lat": z.coerce.number().min(-90).max(90).optional(),

    // Longitude aliases
    longitudeMin: z.coerce.number().min(-180).max(180).optional(),
    lonMin: z.coerce.number().min(-180).max(180).optional(),
    bottomLeftLon: z.coerce.number().min(-180).max(180).optional(),
    "Bottom-Left Lon": z.coerce.number().min(-180).max(180).optional(),

    longitudeMax: z.coerce.number().min(-180).max(180).optional(),
    lonMax: z.coerce.number().min(-180).max(180).optional(),
    upperRightLon: z.coerce.number().min(-180).max(180).optional(),
    "Upper-Right Lon": z.coerce.number().min(-180).max(180).optional(),

    // Date aliases
    start: z.string().optional(),
    startDate: z.string().optional(),

    end: z.string().optional(),
    endDate: z.string().optional(),

    // Options
    includeGrid: z
      .union([
        z.boolean(),
        z.enum(["true", "false"]).transform((v) => v === "true"),
      ])
      .default(false),
  })
  .transform((data) => {
    const latMin =
      data.latitudeMin ??
      data.latMin ??
      data.bottomLeftLat ??
      data["Bottom-Left Lat"];
    const latMax =
      data.latitudeMax ??
      data.latMax ??
      data.upperRightLat ??
      data["Upper-Right Lat"];
    const lonMin =
      data.longitudeMin ??
      data.lonMin ??
      data.bottomLeftLon ??
      data["Bottom-Left Lon"];
    const lonMax =
      data.longitudeMax ??
      data.lonMax ??
      data.upperRightLon ??
      data["Upper-Right Lon"];

    const rawStart = data.start ?? data.startDate ?? "";
    const rawEnd = data.end ?? data.endDate ?? "";

    const start = normalizeDate(rawStart);
    const end = normalizeDate(rawEnd);

    return {
      latitudeMin: latMin as number,
      latitudeMax: latMax as number,
      longitudeMin: lonMin as number,
      longitudeMax: lonMax as number,
      start,
      end,
      includeGrid: Boolean(data.includeGrid),
    };
  })
  .superRefine((data, ctx) => {
    if (data.latitudeMin === undefined || Number.isNaN(data.latitudeMin)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "latitudeMin (or latMin) is required and must be a number",
        path: ["latitudeMin"],
      });
    }
    if (data.latitudeMax === undefined || Number.isNaN(data.latitudeMax)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "latitudeMax (or latMax) is required and must be a number",
        path: ["latitudeMax"],
      });
    }
    if (data.longitudeMin === undefined || Number.isNaN(data.longitudeMin)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "longitudeMin (or lonMin) is required and must be a number",
        path: ["longitudeMin"],
      });
    }
    if (data.longitudeMax === undefined || Number.isNaN(data.longitudeMax)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "longitudeMax (or lonMax) is required and must be a number",
        path: ["longitudeMax"],
      });
    }

    if (data.latitudeMin >= data.latitudeMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "latitudeMin must be strictly less than latitudeMax",
        path: ["latitudeMin"],
      });
    }
    if (data.longitudeMin >= data.longitudeMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "longitudeMin must be strictly less than longitudeMax",
        path: ["longitudeMin"],
      });
    }

    if (!/^\d{8}$/.test(data.start)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "start (or startDate) must be in YYYYMMDD or YYYY-MM-DD format",
        path: ["start"],
      });
    }
    if (!/^\d{8}$/.test(data.end)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "end (or endDate) must be in YYYYMMDD or YYYY-MM-DD format",
        path: ["end"],
      });
    }

    if (data.start && data.end && /^\d{8}$/.test(data.start) && /^\d{8}$/.test(data.end)) {
      const startDate = new Date(
        `${data.start.slice(0, 4)}-${data.start.slice(4, 6)}-${data.start.slice(6, 8)}T00:00:00Z`
      );
      const endDate = new Date(
        `${data.end.slice(0, 4)}-${data.end.slice(4, 6)}-${data.end.slice(6, 8)}T00:00:00Z`
      );
      const smapStartBoundary = new Date("2015-03-31T00:00:00Z");

      if (startDate < smapStartBoundary) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SMAP dataset SPL4SMGP began on 2015-03-31",
          path: ["start"],
        });
      }
      if (startDate > endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "start date cannot be after end date",
          path: ["start"],
        });
      }
    }
  });

export type SmapQuerySchemaType = z.infer<typeof smapQuerySchema>;

// ─── Historical & 2-Year Ingestion Schemas ─────────────────────────────────────

const flexibleSmapDateQuery = z
  .string({ error: "Date is required" })
  .transform((val) => val.replaceAll("-", "").trim())
  .refine((val) => /^\d{8}$/.test(val), { message: "Date must be YYYYMMDD or YYYY-MM-DD" });

function parseSmapDate(value: string): Date | null {
  const clean = value.replaceAll("-", "").trim();
  if (clean.length !== 8) return null;
  const date = new Date(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10).replaceAll("-", "") !== clean ? null : date;
}

export const smapHistoricalFetchSchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    latitudeMin: z.coerce.number().min(-90).max(90).optional(),
    latitudeMax: z.coerce.number().min(-90).max(90).optional(),
    longitudeMin: z.coerce.number().min(-180).max(180).optional(),
    longitudeMax: z.coerce.number().min(-180).max(180).optional(),
    district: z.string().trim().min(2).optional(),
    start: flexibleSmapDateQuery,
    end: flexibleSmapDateQuery,
    forceRefresh: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).optional().default(false),
  })
  .superRefine((val, ctx) => {
    const start = parseSmapDate(val.start);
    const end = parseSmapDate(val.end);
    if (!start || !end) {
      ctx.addIssue({ code: "custom", message: "Invalid start or end date", path: ["start"] });
      return;
    }
    if (start > end) {
      ctx.addIssue({ code: "custom", message: "start must be before or equal to end", path: ["end"] });
      return;
    }
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 731) {
      ctx.addIssue({ code: "custom", message: "Requested date range exceeds 2 years (maximum 731 days)", path: ["end"] });
    }
    if (val.latitudeMin !== undefined && val.latitudeMax !== undefined && val.latitudeMin >= val.latitudeMax) {
      ctx.addIssue({ code: "custom", message: "latitudeMin must be less than latitudeMax", path: ["latitudeMin"] });
    }
    if (val.longitudeMin !== undefined && val.longitudeMax !== undefined && val.longitudeMin >= val.longitudeMax) {
      ctx.addIssue({ code: "custom", message: "longitudeMin must be less than longitudeMax", path: ["longitudeMin"] });
    }
  });

export const smapHistoricalQuerySchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    latitudeMin: z.coerce.number().min(-90).max(90).optional(),
    latitudeMax: z.coerce.number().min(-90).max(90).optional(),
    longitudeMin: z.coerce.number().min(-180).max(180).optional(),
    longitudeMax: z.coerce.number().min(-180).max(180).optional(),
    district: z.string().trim().min(2).optional(),
    start: flexibleSmapDateQuery,
    end: flexibleSmapDateQuery,
    mode: z.enum(["summary", "daily", "monthly", "seasonal", "full"]).optional().default("full"),
    autoFetch: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).optional().default(true),
  })
  .superRefine((val, ctx) => {
    const start = parseSmapDate(val.start);
    const end = parseSmapDate(val.end);
    if (!start || !end) {
      ctx.addIssue({ code: "custom", message: "Invalid start or end date", path: ["start"] });
      return;
    }
    if (start > end) {
      ctx.addIssue({ code: "custom", message: "start must be before or equal to end", path: ["end"] });
      return;
    }
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 731) {
      ctx.addIssue({ code: "custom", message: "Requested date range exceeds 2 years (maximum 731 days)", path: ["end"] });
    }
  });

export const smapHistoricalStatusSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  latitudeMin: z.coerce.number().min(-90).max(90).optional(),
  latitudeMax: z.coerce.number().min(-90).max(90).optional(),
  longitudeMin: z.coerce.number().min(-180).max(180).optional(),
  longitudeMax: z.coerce.number().min(-180).max(180).optional(),
  district: z.string().trim().min(2).optional(),
});

