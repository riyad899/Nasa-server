import crypto from "crypto";
import { NasaPowerService } from "../NasaPower/nasaPower.service.js";
import { RAGService } from "../Rag/rag.service.js";
import { LLMService } from "../Rag/llm.service.js";
import { AMAN_ONSET_CONFIG, CROP_CONFIG } from "./amanOnset.constants.js";
import { addDays, findAnnualOnset, summarizeDistribution } from "./amanOnset.algorithm.js";
import type { IAmanOnsetRequest, IAmanOnsetResponse, IAnnualOnset, IOnsetDistribution } from "./amanOnset.interface.js";
import { prisma } from "../../lib/prisma.js";

const ragService = new RAGService();
const llmService = new LLMService();

const compactDate = (year: number, month: number, day: number): string =>
	`${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;

const yearsBetween = (start: number, end: number): number[] =>
	Array.from({ length: end - start + 1 }, (_, index) => start + index);

interface IStoredObservation {
	observedAt: Date;
	source: string;
	variable: string;
	value: number | null;
	unit: string;
	isValid: boolean;
	qualityNote: string | null;
	raw: { date: string; value: number | null };
}

const fetchOnsets = async (latitude: number, longitude: number, years: number[], warnings: string[], observations: IStoredObservation[]): Promise<IAnnualOnset[]> => {
	const results: IAnnualOnset[] = [];
	for (let index = 0; index < years.length; index += 2) {
		const batch = years.slice(index, index + 2);
		const batchResults = await Promise.all(batch.map(async (year): Promise<IAnnualOnset> => {
			try {
				const result = await NasaPowerService.getNasaPowerData({ latitude, longitude, start: compactDate(year, 5, 15), end: compactDate(year, 10, 31) });
				const daily = result.data.rainfall.map((entry) => ({
					date: `${entry.date.slice(0, 4)}-${entry.date.slice(4, 6)}-${entry.date.slice(6, 8)}`,
					rainfall: entry.value,
				}));
				observations.push(...daily.map((entry) => ({
					observedAt: new Date(`${entry.date}T00:00:00.000Z`), source: "POWER", variable: "PRECTOTCORR", value: entry.rainfall, unit: "mm/day", isValid: entry.rainfall !== null, qualityNote: entry.rainfall === null ? "NASA POWER fill value" : null, raw: { date: entry.date, value: entry.rainfall },
				})));
				return findAnnualOnset(year, daily);
			} catch (error) {
				warnings.push(`NASA POWER data unavailable for ${year}: ${error instanceof Error ? error.message : "unknown error"}`);
				return { year, onsetDate: null, dayOfYear: null, rainfallTotalMm: null, missingDays: 1, confidence: "insufficient_data" };
			}
		}));
		results.push(...batchResults);
	}
	return results.sort((a, b) => a.year - b.year);
};

const emptyDistribution = (startYear: number, endYear: number): IOnsetDistribution => ({
	startYear, endYear, annualOnsets: [], validYears: 0, medianDayOfYear: null, p25DayOfYear: null, p75DayOfYear: null,
});

const methodFor = (cropType: IAmanOnsetRequest["crop"]["cropType"]) => ({
	season: CROP_CONFIG[cropType].season,
	minimumAccumulatedRainfallMm: AMAN_ONSET_CONFIG.minimumAccumulatedRainfallMm,
	accumulationDays: AMAN_ONSET_CONFIG.accumulationDays,
	confirmationWindowDays: AMAN_ONSET_CONFIG.confirmationWindowDays,
	minimumConfirmationRainyDays: AMAN_ONSET_CONFIG.minimumConfirmationRainyDays,
});

const parseLlmText = (raw: string): { explanation?: string; farmerGuidance?: string[] } => {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return {};
		const record = parsed as Record<string, unknown>;
		return {
			explanation: typeof record.explanation === "string" ? record.explanation : undefined,
			farmerGuidance: Array.isArray(record.farmerGuidance) ? record.farmerGuidance.filter((item): item is string => typeof item === "string") : undefined,
		};
	} catch {
		return {};
	}
};

const persistAnalysis = async (analysisId: string, payload: IAmanOnsetRequest, baseline: IOnsetDistribution, recent: IOnsetDistribution, observations: IStoredObservation[], explanation: string, explanationSource: "llm" | "deterministic_fallback", warnings: string[]): Promise<void> => {
	await prisma.analysis.create({
		data: {
			id: analysisId, algorithmVersion: "aman-onset-v1", status: recent.validYears > 0 ? "completed" : "validation_pending", requestedAt: new Date(), completedAt: new Date(), location: payload.location, crop: payload.crop, farmingMethod: payload.crop.farmingMethod, baselinePeriod: { startYear: baseline.startYear, endYear: baseline.endYear }, recentPeriod: { startYear: recent.startYear, endYear: recent.endYear }, methodology: { rule: "3-day rainfall >= 20 mm plus 3 rainy days in following 15 days", formulas: { shift: "recent.medianDayOfYear - baseline.medianDayOfYear", percentiles: "nearest-rank percentile" }, uncertaintyMethod: "not calculated" }, aiExplanation: { source: explanationSource, explanation, provider: explanationSource === "llm" ? "OpenRouter" : null, model: explanationSource === "llm" ? "configured LLM" : null, promptVersion: explanationSource === "llm" ? "aman-onset-explanation-v1" : null, fallback: explanationSource === "deterministic_fallback" }, warnings,
			sources: { create: { id: crypto.randomUUID(), source: "POWER", provider: "NASA", dataset: "POWER Daily Point", endpoint: "https://power.larc.nasa.gov/api/temporal/daily/point", requestParameters: { latitude: payload.location.latitude, longitude: payload.location.longitude, parameters: "PRECTOTCORR", community: "ag", units: "metric" }, variables: ["PRECTOTCORR"], units: { PRECTOTCORR: "mm/day" }, temporalResolution: "daily", spatialResolution: "point", fetchStatus: observations.length > 0 ? "success" : "partial_failure", recordCount: observations.length, requestedStart: `${baseline.startYear}-05-15`, requestedEnd: `${recent.endYear}-10-31`, sourceLink: "https://power.larc.nasa.gov/data-access-viewer/", sourceVersion: "POWER API" } },
			yearlyCalculations: { create: [...baseline.annualOnsets.map((entry) => ({ id: crypto.randomUUID(), periodType: "baseline", year: entry.year, onsetDate: entry.onsetDate, dayOfYear: entry.dayOfYear, rainfallTotal: entry.rainfallTotalMm, valid: entry.confidence !== "insufficient_data", missingDays: entry.missingDays ?? 0, confidence: entry.confidence, calculation: { ...entry } })), ...recent.annualOnsets.map((entry) => ({ id: crypto.randomUUID(), periodType: "recent", year: entry.year, onsetDate: entry.onsetDate, dayOfYear: entry.dayOfYear, rainfallTotal: entry.rainfallTotalMm, valid: entry.confidence !== "insufficient_data", missingDays: entry.missingDays ?? 0, confidence: entry.confidence, calculation: { ...entry } }))] },
			observations: { createMany: { data: observations.map((observation) => ({ id: crypto.randomUUID(), ...observation })) } },
			auditLogs: { create: { id: crypto.randomUUID(), event: "analysis_completed", details: { algorithmVersion: "aman-onset-v1", persistedObservationCount: observations.length } } },
		},
	});
};

export const AmanOnsetService = {
	async runAnalysis(payload: IAmanOnsetRequest): Promise<IAmanOnsetResponse> {
		const { location, crop, analysis } = payload;
		const warnings: string[] = [];
		const observations: IStoredObservation[] = [];
		const baseline = crop.cropType === "boro_rice" ? emptyDistribution(analysis.baselineStartYear, analysis.baselineEndYear) : summarizeDistribution(analysis.baselineStartYear, analysis.baselineEndYear, await fetchOnsets(location.latitude, location.longitude, yearsBetween(analysis.baselineStartYear, analysis.baselineEndYear), warnings, observations));
		const recent = crop.cropType === "boro_rice" ? emptyDistribution(analysis.recentStartYear, analysis.recentEndYear) : summarizeDistribution(analysis.recentStartYear, analysis.recentEndYear, await fetchOnsets(location.latitude, location.longitude, yearsBetween(analysis.recentStartYear, analysis.recentEndYear), warnings, observations));
		const shiftDays = baseline.medianDayOfYear === null || recent.medianDayOfYear === null ? null : recent.medianDayOfYear - baseline.medianDayOfYear;
		const direction = shiftDays === null ? "insufficient_data" : shiftDays > 0 ? "later" : shiftDays < 0 ? "earlier" : "no_clear_shift";
				const p25ToP75Days = baseline.p25DayOfYear !== null && baseline.p75DayOfYear !== null && recent.p25DayOfYear !== null && recent.p75DayOfYear !== null
					? { lower: recent.p25DayOfYear - baseline.p75DayOfYear, upper: recent.p75DayOfYear - baseline.p25DayOfYear }
					: null;
		const recentOnset = recent.medianDayOfYear === null ? null : new Date(Date.UTC(analysis.recentEndYear, 0, recent.medianDayOfYear)).toISOString().slice(0, 10);
		const transplantingStart = crop.cropType === "aman_rice" && recentOnset ? addDays(recentOnset, AMAN_ONSET_CONFIG.transplantingOffsetDays) : null;
		const transplantingEnd = transplantingStart ? addDays(transplantingStart, AMAN_ONSET_CONFIG.transplantingWindowDays) : null;
		const fallbackExplanation = crop.cropType === "boro_rice" ? "Boro Rice-এর জন্য যাচাইকৃত crop calendar এবং irrigation data প্রয়োজন; rainfall onset planting signal হিসেবে ব্যবহার করা হয়নি।" : shiftDays === null ? "পর্যাপ্ত historical rainfall data না পাওয়ায় onset shift নির্ভরযোগ্যভাবে নির্ণয় করা যায়নি।" : `Median usable-rain onset ${Math.abs(shiftDays)} দিন ${direction === "later" ? "পরে" : direction === "earlier" ? "আগে" : "একই সময়ে"} হয়েছে। এটি climate change-এর একক প্রমাণ নয়।`;
		let explanation = fallbackExplanation;
		let explanationSource: "llm" | "deterministic_fallback" = "deterministic_fallback";
		let farmerGuidance = ["বৃষ্টির onset-কে সরাসরি transplanting date ধরে নেবেন না; nursery seedling age ও জমির moisture যাচাই করুন।", "প্রস্তাবিত window-এর আগে ও পরে স্থানীয় কৃষি কর্মকর্তার পরামর্শ এবং field condition মিলিয়ে নিন।"];
		if (crop.cropType === "aman_rice") {
			try {
				const retrieved = await ragService.retieveRelevantDocuments(`Bangladesh Aman rice rainfed crop calendar and transplanting guidance for ${location.district ?? "the selected location"}`, 4);
				const knowledge = retrieved.filter((item) => item.content).map((item) => item.content).join("\n\n");
				const llmResult = await llmService.generateResponse(JSON.stringify({ payload, baseline, recent, shiftDays, transplantingStart, transplantingEnd, knowledge }), [], true, "You are an agricultural scientist. Return only JSON with explanation (string) and farmerGuidance (string array). Use only supplied data and mention uncertainty.");
				const parsed = parseLlmText(llmResult);
				if (parsed.explanation) { explanation = parsed.explanation; explanationSource = "llm"; }
				if (parsed.farmerGuidance?.length) farmerGuidance = parsed.farmerGuidance;
			} catch {
				warnings.push("Bangla explanation service was unavailable; deterministic explanation returned.");
			}
		}
		const analysisId = `${crop.cropType === "aman_rice" ? "aman" : "boro"}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
		try {
			await persistAnalysis(analysisId, payload, baseline, recent, observations, explanation, explanationSource, warnings);
		} catch (error) {
			warnings.push(`Analysis provenance persistence failed: ${error instanceof Error ? error.message : "unknown error"}`);
		}
		return {
			analysisId,
			location, crop, method: methodFor(crop.cropType), baseline, recent,
			shift: { medianDays: shiftDays, direction, p25ToP75Days },
			transplantingWindow: { start: transplantingStart, end: transplantingEnd, confidence: transplantingStart ? "moderate" : "insufficient_data" },
			explanation, farmerGuidance, dataSources: ["NASA POWER daily precipitation"], warnings: warnings.length ? warnings : ["This comparison is an evidence-based historical analysis, not proof of a single climate cause."],
		};
	},
};
