import { Router } from "express";
import { validateZodSchema } from "../../../middleware/validateReq.js";
import { AmanOnsetController } from "./amanOnset.controller.js";
import { AmanOnsetValidation } from "./amanOnset.validation.js";

const router = Router();

router.post(
  "/analyze-aman-onset",
  validateZodSchema(AmanOnsetValidation.amanOnsetRequestSchema),
  AmanOnsetController.runAnalysis,
);

export const AmanOnsetRoute = router;
