import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { AmanOnsetService } from "./amanOnset.service.js";
import { AnalysisTransparencyService } from "../AnalysisTransparency/analysisTransparency.service.js";

const runAnalysis = catchAsync(async (req: Request, res: Response) => {
	const result = await AmanOnsetService.runAnalysis(req.body);

	if (req.user?.userId) {
		try {
			await AnalysisTransparencyService.saveAnalysisHistory({
				analysisId: result.analysisId,
				location: result.location,
				crop: result.crop,
				farmingMethod: result.crop?.farmingMethod,
				shiftDays: result.shift?.medianDays,
				plantingWindowStart: result.transplantingWindow?.start,
				plantingWindowEnd: result.transplantingWindow?.end,
				confidence: result.transplantingWindow?.confidence,
				dataSources: result.dataSources,
				results: result,
				recommendationText: `Recommended transplanting window: ${result.transplantingWindow?.start || ""} to ${result.transplantingWindow?.end || ""}`,
				explanation: result.explanation,
				farmerGuidance: result.farmerGuidance,
				whyThisResult: {
					shift: result.shift,
					baseline: result.baseline,
					recent: result.recent,
				},
			}, req.user.userId);
		} catch (saveErr) {
			console.warn("Failed to auto-save analysis history:", saveErr);
		}
	}

	sendResponse(res, { httpStatus: status.OK, success: true, message: "Aman rainfall onset analysis completed successfully", data: result });
});

export const AmanOnsetController = { runAnalysis };

