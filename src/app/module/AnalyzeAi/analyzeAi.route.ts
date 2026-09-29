import { Router } from "express";
import { validateZodSchema } from "../../../middleware/validateReq.js";
import { AnalyzeAiValidation } from "./analyzeAi.validation.js";
import { AnalyzeAiController } from "./analyzeAi.controller.js";

const router = Router();

router.post(
  "/analyze",
  validateZodSchema(AnalyzeAiValidation.analyzeRequestSchema),
  AnalyzeAiController.runAnalysis
);

export const AnalyzeAiRoute = router;
