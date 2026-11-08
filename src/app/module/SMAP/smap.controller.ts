import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import {
  ISmapQueryParams,
  ISmapHistoricalFetchInput,
  ISmapHistoricalQueryInput,
} from "./smap.interface.js";
import { SmapService } from "./smap.service.js";
import { ILocationQuery } from "../../shared/geo.constants.js";

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

const fetchHistorical = catchAsync(async (req: Request, res: Response) => {
  const input = (res.locals.validatedQuery || req.body) as ISmapHistoricalFetchInput;
  const result = await SmapService.fetchTwoYearSoilMoisture(input);

  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "SMAP historical soil moisture data processed and stored",
    data: result,
  });
});

const getHistorical = catchAsync(async (req: Request, res: Response) => {
  const input = (res.locals.validatedQuery || req.query) as ISmapHistoricalQueryInput;
  const result = await SmapService.getSmapHistoricalDataFromDB(input);

  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "SMAP historical soil moisture retrieved from database",
    data: result,
  });
});

const getStatus = catchAsync(async (req: Request, res: Response) => {
  const input = (res.locals.validatedQuery || req.query) as ILocationQuery;
  const result = await SmapService.getSmapDatasetStatus(input);

  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "SMAP historical dataset status retrieved successfully",
    data: result,
  });
});

const refreshHistorical = catchAsync(async (req: Request, res: Response) => {
  const input = (res.locals.validatedQuery || req.body) as ISmapHistoricalFetchInput;
  const result = await SmapService.refreshSmapHistoricalData(input);

  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "SMAP historical soil moisture data refreshed",
    data: result,
  });
});

export const SmapController = {
  getSoilMoisture,
  fetchHistorical,
  getHistorical,
  getStatus,
  refreshHistorical,
};
