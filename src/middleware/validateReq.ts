import { NextFunction, Request, Response } from "express";
import z from "zod";

export const validateZodSchema = (zodSchema: z.ZodSchema)=>{
  return (req: Request, res: Response, next: NextFunction) => {
    const validationResult = zodSchema.safeParse(req.body);

    if (!validationResult.success) {
      next(validationResult.error);
    } else {
      req.body = validationResult.data;
      next();
    }

  }

}

export const validateZodQuery = (zodSchema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const dataToValidate = Object.keys(req.query).length > 0 ? req.query : req.body;
    const validationResult = zodSchema.safeParse(dataToValidate);

    if (!validationResult.success) {
      next(validationResult.error);
    } else {
      res.locals.validatedQuery = validationResult.data;
      next();
    }
  };
};