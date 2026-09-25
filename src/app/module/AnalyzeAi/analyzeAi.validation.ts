import { z } from "zod";

const analyzeRequestSchema = z.object({
  location: z.object({
    latitude: z
      .number({ message: "Latitude is required and must be a number" })
      .min(-90, "Latitude must be >= -90")
      .max(90, "Latitude must be <= 90"),
    longitude: z
      .number({ message: "Longitude is required and must be a number" })
      .min(-180, "Longitude must be >= -180")
      .max(180, "Longitude must be <= 180"),
  }),
  analysisPeriod: z.object({
    startDate: z
      .string({ message: "Start date is required" })
      .min(8, "Start date must be in YYYYMMDD or YYYY-MM-DD format"),
    endDate: z
      .string({ message: "End date is required" })
      .min(8, "End date must be in YYYYMMDD or YYYY-MM-DD format"),
  }),
  crop: z
    .object({
      currentCrop: z.string().optional(),
      consideringCrops: z.array(z.string()).optional(),
    })
    .optional(),
  farmerPriority: z
    .object({
      waterAvailability: z.string().optional(),
      riskTolerance: z.string().optional(),
      priority: z.string().optional(),
    })
    .optional(),
  soil: z
    .object({
      type: z.string().optional(),
      ph: z.number().min(0).max(14).optional(),
    })
    .optional(),
});

export const AnalyzeAiValidation = {
  analyzeRequestSchema,
};
