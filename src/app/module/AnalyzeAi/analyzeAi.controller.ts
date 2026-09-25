import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { AnalyzeAiService } from "./analyzeAi.service.js";

const runAnalysis = catchAsync(async (req: Request, res: Response) => {
  const result = await AnalyzeAiService.runAnalysis(req.body);

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
