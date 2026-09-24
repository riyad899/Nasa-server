import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { ISmapQueryParams } from "./smap.interface.js";
import { SmapService } from "./smap.service.js";

const getSoilMoisture = catchAsync(async (req: Request, res: Response) => {
  const queryParams = (res.locals.validatedQuery || req.body || req.query) as ISmapQueryParams;
  const result = await SmapService.getSoilMoisture(queryParams);

  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "SMAP soil moisture data fetched successfully",
    data: result,
  });
});

export const SmapController = {
  getSoilMoisture,
};
