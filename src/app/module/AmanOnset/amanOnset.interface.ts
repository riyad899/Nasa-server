import type { AmanCropType } from "./amanOnset.constants.js";

export interface IAmanOnsetRequest {
	location: { latitude: number; longitude: number; district?: string };
	crop: { cropType: AmanCropType; farmingMethod: "rainfed" | "supplemental_irrigation" };
	analysis: {
		type: "usable_rain_onset_shift";
		baselineStartYear: number;
		baselineEndYear: number;
		recentStartYear: number;
		recentEndYear: number;
	};
	language: "bn" | "en";
}

export interface IDailyRainfall { date: string; rainfall: number | null }

export interface IAnnualOnset {
	year: number;
	onsetDate: string | null;
	dayOfYear: number | null;
	rainfallTotalMm: number | null;
	missingDays?: number;
	confidence: "high" | "moderate" | "insufficient_data";
}

export interface IOnsetDistribution {
	startYear: number; endYear: number; annualOnsets: IAnnualOnset[]; validYears: number;
	medianDayOfYear: number | null; p25DayOfYear: number | null; p75DayOfYear: number | null;
}

export interface IAmanOnsetResponse {
	analysisId: string;
	location: IAmanOnsetRequest["location"];
	crop: IAmanOnsetRequest["crop"];
	method: { season: string; minimumAccumulatedRainfallMm: number; accumulationDays: number; confirmationWindowDays: number; minimumConfirmationRainyDays: number };
	baseline: IOnsetDistribution; recent: IOnsetDistribution;
	shift: { medianDays: number | null; direction: "later" | "earlier" | "no_clear_shift" | "insufficient_data"; p25ToP75Days: { lower: number; upper: number } | null };
	transplantingWindow: { start: string | null; end: string | null; confidence: "moderate" | "insufficient_data" };
	explanation: string; farmerGuidance: string[]; dataSources: string[]; warnings: string[];
}
