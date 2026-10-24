import { Router } from "express";
import { optionalAuth } from "../../../middleware/checkAuth.js";
import { validateZodSchema } from "../../../middleware/validateReq.js";
import { AnalyzeAiValidation } from "./analyzeAi.validation.js";
import { AnalyzeAiController } from "./analyzeAi.controller.js";

const router = Router();

router.post(
  "/analyze",
  optionalAuth(),
  validateZodSchema(AnalyzeAiValidation.analyzeRequestSchema),
  AnalyzeAiController.runAnalysis
);

export const AnalyzeAiRoute = router;

