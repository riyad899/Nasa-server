import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { AmanOnsetService } from "./amanOnset.service.js";

const runAnalysis = catchAsync(async (req: Request, res: Response) => {
	const result = await AmanOnsetService.runAnalysis(req.body);
	sendResponse(res, { httpStatus: status.OK, success: true, message: "Aman rainfall onset analysis completed successfully", data: result });
});

export const AmanOnsetController = { runAnalysis };
