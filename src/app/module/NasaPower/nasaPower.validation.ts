import z from "zod";

export const nasaPowerZodSchema = z.object({
    latitude: z
        .number({ error: "Latitude is required" })
        .min(-90, "Latitude must be >= -90")
        .max(90, "Latitude must be <= 90"),

    longitude: z
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
);
