import status from "http-status";
import AppError from "../../errorHelpers/appError.js";

export type ImergErrorCode =
    | "EARTHDATA_TOKEN_MISSING" | "EARTHDATA_AUTH_FAILED" | "EARTHDATA_UNAUTHORIZED"
    | "IMERG_DATA_UNAVAILABLE" | "IMERG_TIMEOUT" | "NASA_RATE_LIMITED"
    | "NASA_SERVER_ERROR" | "NASA_MALFORMED_RESPONSE" | "REQUEST_TOO_LARGE";

const codeStatus: Record<ImergErrorCode, number> = {
    EARTHDATA_TOKEN_MISSING: status.INTERNAL_SERVER_ERROR,
    EARTHDATA_AUTH_FAILED: status.BAD_GATEWAY,
    EARTHDATA_UNAUTHORIZED: status.BAD_GATEWAY,
    IMERG_DATA_UNAVAILABLE: status.NOT_FOUND,
    IMERG_TIMEOUT: status.GATEWAY_TIMEOUT,
    NASA_RATE_LIMITED: status.TOO_MANY_REQUESTS,
    NASA_SERVER_ERROR: status.BAD_GATEWAY,
    NASA_MALFORMED_RESPONSE: status.BAD_GATEWAY,
    REQUEST_TOO_LARGE: status.BAD_REQUEST,
};

export class ImergError extends AppError {
    constructor(code: ImergErrorCode, message: string, retryAfter?: number) {
        super(message, codeStatus[code], "", code, retryAfter);
    }
}
