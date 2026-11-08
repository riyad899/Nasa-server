import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { NasaPowerService } from "./nasaPower.service.js";
import {
    INasaPowerInput,
    INasaPowerRegionalInput,
    INasaPowerHistoricalFetchInput,
    INasaPowerHistoricalQueryInput,
} from "./nasaPower.interface.js";

const getNasaPowerData = catchAsync(
    async (req: Request, res: Response) => {
        const input: INasaPowerInput = (res.locals.validatedQuery ?? req.body) as INasaPowerInput;

        const result = await NasaPowerService.getNasaPowerData(input);

        sendResponse(res, {
            httpStatus: status.OK,
            success: true,
            message: "NASA POWER data fetched successfully",
            data: result,
        });
    }
);

const getNasaPowerRegionalData = catchAsync(
    async (req: Request, res: Response) => {
        const input: INasaPowerRegionalInput = (res.locals.validatedQuery ?? req.body) as INasaPowerRegionalInput;

        const result = await NasaPowerService.getNasaPowerRegionalData(input);

        sendResponse(res, {
            httpStatus: status.OK,
            success: true,
            message: "NASA POWER regional data fetched successfully",
            data: result,
        });
    }
);

// API 1: Fetch and Save Multi-Year/Two-Year Regional Data
const fetchHistoricalRegionalData = catchAsync(
    async (req: Request, res: Response) => {
        const input: INasaPowerHistoricalFetchInput = (res.locals.validatedQuery ?? req.body) as INasaPowerHistoricalFetchInput;

        const result = await NasaPowerService.fetchTwoYearRegionalData(input);

        sendResponse(res, {
            httpStatus: status.OK,
            success: true,
            message: "NASA POWER historical data processed",
            data: result,
        });
    }
);

// API 2: Query Saved Historical Data Directly from DB
const getSavedHistoricalData = catchAsync(
    async (req: Request, res: Response) => {
        const input: INasaPowerHistoricalQueryInput = (res.locals.validatedQuery ?? req.query) as INasaPowerHistoricalQueryInput;

        const result = await NasaPowerService.getRegionalHistoricalDataFromDB(input);

        sendResponse(res, {
            httpStatus: status.OK,
            success: true,
            message: "Historical climate data retrieved from database",
            data: result,
        });
    }
);

// API 3: Get Historical Dataset Status
const getHistoricalStatus = catchAsync(
    async (req: Request, res: Response) => {
        const input = (res.locals.validatedQuery ?? req.query) as {
            latitudeMin?: number;
            latitudeMax?: number;
            longitudeMin?: number;
            longitudeMax?: number;
            district?: string;
            start?: string;
            end?: string;
        };

        const result = await NasaPowerService.getHistoricalDatasetStatus(input);

        sendResponse(res, {
            httpStatus: status.OK,
            success: true,
            message: "Historical dataset status retrieved successfully",
            data: result,
        });
    }
);

// API 4: Refresh Missing or Outdated Data
const refreshHistoricalData = catchAsync(
    async (req: Request, res: Response) => {
        const input: INasaPowerHistoricalFetchInput = (res.locals.validatedQuery ?? req.body) as INasaPowerHistoricalFetchInput;

        const result = await NasaPowerService.refreshHistoricalData(input);

        sendResponse(res, {
            httpStatus: status.OK,
            success: true,
            message: "NASA POWER historical data refreshed",
            data: result,
        });
    }
);

export const NasaPowerController = {
    getNasaPowerData,
    getNasaPowerRegionalData,
    fetchHistoricalRegionalData,
    getSavedHistoricalData,
    getHistoricalStatus,
    refreshHistoricalData,
};


