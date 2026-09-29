import { z } from "zod";

const year = z.number().int().min(2000).max(new Date().getUTCFullYear());
const cropType = z.preprocess((value) => typeof value === "string" ? value.trim().toLowerCase().replace(/[-\s]+/g, "_") : value, z.enum(["aman_rice", "boro_rice"]));

const amanOnsetRequestSchema = z.object({
	location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), district: z.string().trim().min(1).optional() }),
	crop: z.object({ cropType, farmingMethod: z.enum(["rainfed", "supplemental_irrigation"]) }),
	analysis: z.object({ type: z.literal("usable_rain_onset_shift"), baselineStartYear: year, baselineEndYear: year, recentStartYear: year, recentEndYear: year }).superRefine((value, context) => {
		if (value.baselineStartYear > value.baselineEndYear) context.addIssue({ code: "custom", path: ["baselineStartYear"], message: "Baseline start year must not be after end year" });
		if (value.recentStartYear > value.recentEndYear) context.addIssue({ code: "custom", path: ["recentStartYear"], message: "Recent start year must not be after end year" });
		if (value.baselineEndYear >= value.recentStartYear) context.addIssue({ code: "custom", path: ["recentStartYear"], message: "Baseline and recent periods must not overlap" });
	}),
	language: z.enum(["bn", "en"]).default("bn"),
});

export const AmanOnsetValidation = { amanOnsetRequestSchema };
