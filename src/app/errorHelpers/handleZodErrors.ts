import { IError, IErrorResponse } from "../interfaces/globalError.interface.js";
import status from "http-status";
import z from "zod";

export const handleZodErrors = (err: z.ZodError): IErrorResponse => {
    const message: string = err.issues[0]?.message || "zod validation error";
    const errorSource: IError[] = [];

    err.issues.forEach((issue) => {
    errorSource.push({
            path: issue.path.join(".") || "unknown",
            message: issue.message,
    });
    });

    return {
        success: false,
        message,
        statusCode: status.BAD_REQUEST,
        errorSource: errorSource.length > 0 ? errorSource : undefined,
    };
};
