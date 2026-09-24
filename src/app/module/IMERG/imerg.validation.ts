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
    const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10).replaceAll("-", "") !== value ? null : date;
}
