import z from "zod";

const numberQuery = (label: string) => z.coerce.number({ error: `${label} is required` }).finite();
const dateQuery = z.string({ error: "Date is required" }).regex(/^\d{8}$/, "Date must be YYYYMMDD");

export const imergQuerySchema = z.object({
    latitudeMin: numberQuery("latitudeMin").min(-90).max(90),
    latitudeMax: numberQuery("latitudeMax").min(-90).max(90),
    longitudeMin: numberQuery("longitudeMin").min(-180).max(180),
    longitudeMax: numberQuery("longitudeMax").min(-180).max(180),
    start: dateQuery,
    end: dateQuery,
    includeGrid: z.union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")]).default(true),
}).superRefine((value, context) => {
    if (value.latitudeMin >= value.latitudeMax || value.longitudeMin >= value.longitudeMax) {
        context.addIssue({ code: "custom", message: "Minimum coordinates must be less than maximum coordinates", path: ["latitudeMin"] });
    }
    const start = parseDate(value.start);
    const end = parseDate(value.end);
    if (!start || !end || start < new Date("1998-01-01T00:00:00Z") || end > new Date()) {
        context.addIssue({ code: "custom", message: "Date range must be real, from 1998-01-01 through today", path: ["start"] });
    }
    if (start && end && start > end) {
        context.addIssue({ code: "custom", message: "start must be before or equal to end", path: ["end"] });
    }
});

function parseDate(value: string): Date | null {
    const clean = value.replaceAll("-", "").trim();
    if (clean.length !== 8) return null;
    const date = new Date(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10).replaceAll("-", "") !== clean ? null : date;
}

const flexibleDateQuery = z
    .string({ error: "Date is required" })
    .transform((val) => val.replaceAll("-", "").trim())
    .refine((val) => /^\d{8}$/.test(val), { message: "Date must be YYYYMMDD or YYYY-MM-DD" });

export const imergHistoricalFetchSchema = z
    .object({
        latitude: z.coerce.number().min(-90).max(90).optional(),
        longitude: z.coerce.number().min(-180).max(180).optional(),
        latitudeMin: z.coerce.number().min(-90).max(90).optional(),
        latitudeMax: z.coerce.number().min(-90).max(90).optional(),
        longitudeMin: z.coerce.number().min(-180).max(180).optional(),
        longitudeMax: z.coerce.number().min(-180).max(180).optional(),
        district: z.string().trim().min(2).optional(),
        start: flexibleDateQuery,
        end: flexibleDateQuery,
        forceRefresh: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).optional().default(false),
    })
    .superRefine((val, ctx) => {
        const start = parseDate(val.start);
        const end = parseDate(val.end);
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

export const imergHistoricalQuerySchema = z
    .object({
        latitude: z.coerce.number().min(-90).max(90).optional(),
        longitude: z.coerce.number().min(-180).max(180).optional(),
        latitudeMin: z.coerce.number().min(-90).max(90).optional(),
        latitudeMax: z.coerce.number().min(-90).max(90).optional(),
        longitudeMin: z.coerce.number().min(-180).max(180).optional(),
        longitudeMax: z.coerce.number().min(-180).max(180).optional(),
        district: z.string().trim().min(2).optional(),
        start: flexibleDateQuery,
        end: flexibleDateQuery,
        mode: z.enum(["summary", "daily", "monthly", "seasonal", "full"]).optional().default("full"),
        autoFetch: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).optional().default(true),
    })
    .superRefine((val, ctx) => {
        const start = parseDate(val.start);
        const end = parseDate(val.end);
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

export const imergHistoricalStatusSchema = z.object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    latitudeMin: z.coerce.number().min(-90).max(90).optional(),
    latitudeMax: z.coerce.number().min(-90).max(90).optional(),
    longitudeMin: z.coerce.number().min(-180).max(180).optional(),
    longitudeMax: z.coerce.number().min(-180).max(180).optional(),
    district: z.string().trim().min(2).optional(),
});

