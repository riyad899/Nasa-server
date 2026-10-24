import { Router } from "express";
import { optionalAuth, checkAuth } from "../../../middleware/checkAuth.js";
import { AnalysisTransparencyController } from "./analysisTransparency.controller.js";

const router = Router();

router.get("/history", optionalAuth(), AnalysisTransparencyController.getHistory);
router.get("/latest", optionalAuth(), AnalysisTransparencyController.getLatest);
router.post("/save", optionalAuth(), AnalysisTransparencyController.saveAnalysis);
router.delete("/:analysisId", checkAuth(), AnalysisTransparencyController.deleteAnalysis);

router.get("/:analysisId", AnalysisTransparencyController.getAnalysis);
router.get("/:analysisId/observations", AnalysisTransparencyController.getObservations);
router.get("/:analysisId/observations.csv", AnalysisTransparencyController.exportObservationsCsv);

export const AnalysisTransparencyRoute = router;