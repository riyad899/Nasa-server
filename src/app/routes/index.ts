import { Router } from "express";
import { AuthRoute } from "../module/Auth/auth.route.js";
import { AdminRoute } from "../module/admin/admin.route.js";
import { RagRoute } from "../module/Rag/rag.route.js";
import { NasaPowerRoute } from "../module/NasaPower/nasaPower.route.js";
import { ImergRoute } from "../module/IMERG/imerg.route.js";
import { SmapRoute } from "../module/SMAP/smap.route.js";
import { AnalyzeAiRoute } from "../module/AnalyzeAi/analyzeAi.route.js";
import { AmanOnsetRoute } from "../module/AmanOnset/amanOnset.route.js";
import { AnalysisTransparencyRoute } from "../module/AnalysisTransparency/analysisTransparency.route.js";
import { DeviceRoute } from "../module/Device/device.route.js";
import { CropWiseAiRoute } from "../module/CropWiseAi/cropwise.route.js";

const router = Router();

router.use("/auth", AuthRoute);
router.use("/admin", AdminRoute);
router.use("/rag", RagRoute);
router.use("/data", NasaPowerRoute);
router.use("/data", ImergRoute);
router.use("/data", SmapRoute);
router.use("/ai", AnalyzeAiRoute);
router.use("/ai", AmanOnsetRoute);
router.use("/analyses", AnalysisTransparencyRoute);
router.use("/device", DeviceRoute);
router.use("/cropwise", CropWiseAiRoute);
router.use("/cropwise-ai", CropWiseAiRoute);
router.use("/proboy", CropWiseAiRoute);

export const IndexRoute = router;