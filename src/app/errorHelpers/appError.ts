class AppError extends Error {
    statusCode: number;
    code?: string;
    retryAfter?: number;
    constructor(message: string, statusCode: number, stack = '', code?: string, retryAfter?: number) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.retryAfter = retryAfter;
        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }

    }
}

export default AppError;