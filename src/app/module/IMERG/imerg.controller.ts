import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import {
    ImergQuery,
    IImergHistoricalFetchInput,
    IImergHistoricalQueryInput,
} from "./imerg.interface.js";
import {
    getImergRainfall,
    fetchTwoYearImergData,
    getImergHistoricalDataFromDB,
    getImergDatasetStatus,
    refreshImergHistoricalData,
} from "./imerg.service.js";
import { ILocationQuery } from "../../shared/geo.constants.js";

const getRainfall = catchAsync(async (req: Request, res: Response) => {
    const result = await getImergRainfall(res.locals.validatedQuery as ImergQuery);
    sendResponse(res, {
        httpStatus: status.OK,
        success: true,
        message: "IMERG rainfall data fetched successfully",
        data: result,
    });
});

const fetchHistorical = catchAsync(async (req: Request, res: Response) => {
    const input = (res.locals.validatedQuery || req.body) as IImergHistoricalFetchInput;
    const result = await fetchTwoYearImergData(input);
    sendResponse(res, {
        httpStatus: status.OK,
        success: true,
        message: "IMERG historical rainfall data processed and stored",
        data: result,
    });
});

const getHistorical = catchAsync(async (req: Request, res: Response) => {
    const input = (res.locals.validatedQuery || req.query) as IImergHistoricalQueryInput;
    const result = await getImergHistoricalDataFromDB(input);
    sendResponse(res, {
        httpStatus: status.OK,
        success: true,
        message: "IMERG historical rainfall retrieved from database",
        data: result,
    });
});

const getStatus = catchAsync(async (req: Request, res: Response) => {
    const input = (res.locals.validatedQuery || req.query) as ILocationQuery;
    const result = await getImergDatasetStatus(input);
    sendResponse(res, {
        httpStatus: status.OK,
        success: true,
        message: "IMERG historical dataset status retrieved successfully",
        data: result,
    });
});

const refreshHistorical = catchAsync(async (req: Request, res: Response) => {
    const input = (res.locals.validatedQuery || req.body) as IImergHistoricalFetchInput;
    const result = await refreshImergHistoricalData(input);
    sendResponse(res, {
        httpStatus: status.OK,
        success: true,
        message: "IMERG historical rainfall data refreshed",
        data: result,
    });
});

export const ImergController = {
    getRainfall,
    fetchHistorical,
    getHistorical,
    getStatus,
    refreshHistorical,
};
