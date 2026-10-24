import { Router } from "express";
import { optionalAuth } from "../../../middleware/checkAuth.js";
import { validateZodSchema } from "../../../middleware/validateReq.js";
import { AmanOnsetController } from "./amanOnset.controller.js";
import { AmanOnsetValidation } from "./amanOnset.validation.js";

const router = Router();

router.post(
  "/analyze-aman-onset",
  optionalAuth(),
  validateZodSchema(AmanOnsetValidation.amanOnsetRequestSchema),
  AmanOnsetController.runAnalysis,
);

export const AmanOnsetRoute = router;

