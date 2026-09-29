export const AMAN_ONSET_CONFIG = {
	seasonStartMonth: 5,
	seasonStartDay: 15,
	seasonEndMonth: 10,
	seasonEndDay: 31,
	minimumAccumulatedRainfallMm: 20,
	accumulationDays: 3,
	confirmationWindowDays: 15,
	minimumConfirmationRainyDays: 3,
	rainyDayMm: 1,
	transplantingOffsetDays: 7,
	transplantingWindowDays: 10,
} as const;

export const CROP_CONFIG = {
	aman_rice: {
		season: "May 15 to October 31",
		analysisRule:
			"Onset is the first date with at least 20 mm cumulative rainfall over 3 consecutive days, followed by at least 3 rainy days in the next 15 calendar days.",
		calendarStatus: "validated",
	},
	boro_rice: {
		season: "Dry season; verified calendar required",
		analysisRule:
			"Rainfall onset is not a planting signal for Boro; irrigation availability, dry-season water status, temperature, and a verified Boro crop calendar are required.",
		calendarStatus: "unavailable",
	},
} as const;

export type AmanCropType = keyof typeof CROP_CONFIG;
