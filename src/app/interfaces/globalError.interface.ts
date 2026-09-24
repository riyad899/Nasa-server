export interface IError {
   path: string;
   message: string;
}
export interface IErrorResponse {
    success: boolean;
    statusCode?: number;
    code?: string;
    message: string;
    stack? : string | undefined;
    errorSource?: IError[];
    error?: any;
}