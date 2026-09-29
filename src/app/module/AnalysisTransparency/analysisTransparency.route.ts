import { Router } from "express";
import { AnalysisTransparencyController } from "./analysisTransparency.controller.js";

const router = Router();

router.get("/:analysisId", AnalysisTransparencyController.getAnalysis);
router.get("/:analysisId/observations", AnalysisTransparencyController.getObservations);
router.get("/:analysisId/observations.csv", AnalysisTransparencyController.exportObservationsCsv);

export const AnalysisTransparencyRoute = router;