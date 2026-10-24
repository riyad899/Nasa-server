import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { AnalysisTransparencyService } from "./analysisTransparency.service.js";
import { AnalysisTransparencyValidation } from "./analysisTransparency.validation.js";

const parseQuery = (req: Request) => AnalysisTransparencyValidation.observationQuerySchema.parse(req.query);
const getAnalysisId = (req: Request): string => {
  const analysisId = req.params.analysisId;
  if (Array.isArray(analysisId)) throw new Error("Invalid analysisId");
  return analysisId;
};

const getAnalysis = catchAsync(async (req: Request, res: Response) => {
  const data = await AnalysisTransparencyService.getAnalysis(getAnalysisId(req));
  sendResponse(res, { httpStatus: status.OK, success: true, message: "Analysis transparency fetched successfully", data });
});

const getObservations = catchAsync(async (req: Request, res: Response) => {
  const data = await AnalysisTransparencyService.getObservations(getAnalysisId(req), parseQuery(req));
  sendResponse(res, { httpStatus: status.OK, success: true, message: "Analysis observations fetched successfully", data });
});

const exportObservationsCsv = catchAsync(async (req: Request, res: Response) => {
  const analysisId = getAnalysisId(req);
  const csv = await AnalysisTransparencyService.getObservationsCsv(analysisId, parseQuery(req));
  res.status(status.OK).type("text/csv").setHeader("Content-Disposition", `attachment; filename="${analysisId}-observations.csv"`).send(csv);
});

const getHistory = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    return sendResponse(res, {
      httpStatus: status.OK,
      success: true,
      message: "Guest user has no persistent history",
      data: [],
    });
  }
  const data = await AnalysisTransparencyService.getUserHistory(userId);
  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "Analysis history fetched successfully",
    data,
  });
});

const getLatest = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    return sendResponse(res, {
      httpStatus: status.OK,
      success: true,
      message: "No saved analysis for guest",
      data: null,
    });
  }
  const data = await AnalysisTransparencyService.getLatestUserAnalysis(userId);
  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "Latest analysis fetched successfully",
    data,
  });
});

const saveAnalysis = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    return sendResponse(res, {
      httpStatus: status.UNAUTHORIZED,
      success: false,
      message: "Sign in required to save analysis",
      data: null,
    });
  }
  const data = await AnalysisTransparencyService.saveAnalysisHistory(req.body, userId);
  sendResponse(res, {
    httpStatus: status.CREATED,
    success: true,
    message: "Analysis saved to history successfully",
    data,
  });
});

const deleteAnalysis = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    return sendResponse(res, {
      httpStatus: status.UNAUTHORIZED,
      success: false,
      message: "Sign in required to delete analysis",
      data: null,
    });
  }
  await AnalysisTransparencyService.deleteAnalysis(req.params.analysisId as string, userId);
  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "Analysis removed from history",
    data: null,
  });
});

export const AnalysisTransparencyController = {
  getAnalysis,
  getObservations,
  exportObservationsCsv,
  getHistory,
  getLatest,
  saveAnalysis,
  deleteAnalysis,
};