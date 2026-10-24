import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { AnalyzeAiService } from "./analyzeAi.service.js";
import { AnalysisTransparencyService } from "../AnalysisTransparency/analysisTransparency.service.js";

const runAnalysis = catchAsync(async (req: Request, res: Response) => {
  const result = await AnalyzeAiService.runAnalysis(req.body);

  if (req.user?.userId) {
    try {
      await AnalysisTransparencyService.saveAnalysisHistory({
        analysisId: result.analysisId,
        location: result.location,
        crop: req.body.crop || { currentCrop: result.recommendation?.primaryCrop },
        farmingMethod: "rainfed_or_irrigated",
        farmerPriority: req.body.farmerPriority,
        results: result,
        plantingWindowStart: result.recommendation?.plantingWindow?.start,
        plantingWindowEnd: result.recommendation?.plantingWindow?.end,
        confidence: "high",
        dataSources: result.dataSources,
        recommendationText: `Primary: ${result.recommendation?.primaryCrop}. Alternatives: ${result.recommendation?.alternativeCrops?.join(", ") || "None"}`,
        cropType: result.recommendation?.primaryCrop,
        farmerGuidance: result.farmerAdvice,
        whyThisResult: result.whyThisResult,
      }, req.user.userId);
    } catch (saveErr) {
      console.warn("Failed to auto-save analysis history:", saveErr);
    }
  }

  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "FieldShift agricultural analysis completed successfully",
    data: result,
  });
});

export const AnalyzeAiController = {
  runAnalysis,
};

