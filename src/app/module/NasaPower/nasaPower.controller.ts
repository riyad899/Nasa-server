import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { NasaPowerService } from "./nasaPower.service.js";
import { INasaPowerInput } from "./nasaPower.interface.js";

const getNasaPowerData = catchAsync(
    async (req: Request, res: Response) => {
        const input: INasaPowerInput = req.body;

        const result = await NasaPowerService.getNasaPowerData(input);

        sendResponse(res, {
            httpStatus: status.OK,
            success: true,
            message: "NASA POWER data fetched successfully",
            data: result,
        });
    }
);

export const NasaPowerController = {
    getNasaPowerData,
};
