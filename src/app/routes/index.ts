import { Router } from "express";
import { AuthRoute } from "../module/Auth/auth.route.js";
import { AdminRoute } from "../module/admin/admin.route.js";
import { RagRoute } from "../module/Rag/rag.route.js";
import { NasaPowerRoute } from "../module/NasaPower/nasaPower.route.js";
import { ImergRoute } from "../module/IMERG/imerg.route.js";
import { SmapRoute } from "../module/SMAP/smap.route.js";
import { AnalyzeAiRoute } from "../module/AnalyzeAi/analyzeAi.route.js";

const router = Router();

router.use("/auth", AuthRoute);
router.use("/admin", AdminRoute);
router.use("/rag", RagRoute);
router.use("/data", NasaPowerRoute);
router.use("/data", ImergRoute);
router.use("/data", SmapRoute);
router.use("/ai", AnalyzeAiRoute);

export const IndexRoute = router;