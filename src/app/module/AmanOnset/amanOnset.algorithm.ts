import { AMAN_ONSET_CONFIG } from "./amanOnset.constants.js";
import type { IAnnualOnset, IDailyRainfall, IOnsetDistribution } from "./amanOnset.interface.js";

const addCalendarDays = (date: Date, days: number): string => {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next.toISOString().slice(0, 10);
};

const dayOfYear = (date: Date): number =>
	Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000);

const percentile = (values: number[], fraction: number): number | null => {
	if (!values.length) return null;
	return [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
};

export const findAnnualOnset = (year: number, daily: IDailyRainfall[]): IAnnualOnset => {
	const entries = new Map(daily.filter((entry) => entry.date.startsWith(`${year}-`)).map((entry) => [entry.date, entry]));
	const candidates = [...entries.values()].sort();
	let missingDays = 0;
	for (let month = AMAN_ONSET_CONFIG.seasonStartMonth - 1; month <= AMAN_ONSET_CONFIG.seasonEndMonth - 1; month += 1) {
		const start = month === 4 ? AMAN_ONSET_CONFIG.seasonStartDay : 1;
		const end = month === 9 ? AMAN_ONSET_CONFIG.seasonEndDay : new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
		for (let day = start; day <= end; day += 1) {
			const date = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
			if (!entries.get(date) || entries.get(date)?.rainfall === null) missingDays += 1;
		}
	}
	for (const candidate of candidates) {
		const parsed = new Date(`${candidate.date}T00:00:00Z`);
		const accumulation = Array.from({ length: 3 }, (_, offset) => entries.get(addCalendarDays(parsed, offset)));
		const confirmation = Array.from({ length: 15 }, (_, offset) => entries.get(addCalendarDays(parsed, offset + 1)));
		if (accumulation.some((entry) => !entry || entry.rainfall === null) || confirmation.some((entry) => !entry || entry.rainfall === null)) continue;
		const total = accumulation.reduce((sum, entry) => sum + (entry?.rainfall ?? 0), 0);
		const rainyDays = confirmation.filter((entry) => (entry?.rainfall ?? 0) >= AMAN_ONSET_CONFIG.rainyDayMm).length;
		if (total >= AMAN_ONSET_CONFIG.minimumAccumulatedRainfallMm && rainyDays >= AMAN_ONSET_CONFIG.minimumConfirmationRainyDays) {
			return { year, onsetDate: candidate.date, dayOfYear: dayOfYear(parsed), rainfallTotalMm: Number(total.toFixed(1)), missingDays, confidence: "high" };
		}
	}
	return { year, onsetDate: null, dayOfYear: null, rainfallTotalMm: null, missingDays, confidence: "insufficient_data" };
};

export const summarizeDistribution = (startYear: number, endYear: number, annualOnsets: IAnnualOnset[]): IOnsetDistribution => {
	const days = annualOnsets.map((entry) => entry.dayOfYear).filter((value): value is number => value !== null);
	return { startYear, endYear, annualOnsets, validYears: days.length, medianDayOfYear: percentile(days, 0.5), p25DayOfYear: percentile(days, 0.25), p75DayOfYear: percentile(days, 0.75) };
};

export const addDays = (isoDate: string, days: number): string => addCalendarDays(new Date(`${isoDate}T00:00:00Z`), days);
