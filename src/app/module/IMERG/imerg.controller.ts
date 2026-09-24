import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { ImergQuery } from "./imerg.interface.js";
import { getImergRainfall } from "./imerg.service.js";

const getRainfall = catchAsync(async (req: Request, res: Response) => {
    const result = await getImergRainfall(res.locals.validatedQuery as ImergQuery);
    sendResponse(res, {
        httpStatus: status.OK,
        success: true,
        message: "IMERG rainfall data fetched successfully",
        data: result,
    });
});

export const ImergController = { getRainfall };
