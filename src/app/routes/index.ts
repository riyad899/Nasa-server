import { Router } from "express";
import { AuthRoute } from "../module/Auth/auth.route.js";
import { AdminRoute } from "../module/admin/admin.route.js";
import { RagRoute } from "../module/Rag/rag.route.js";
import { NasaPowerRoute } from "../module/NasaPower/nasaPower.route.js";

const router = Router();

router.use("/auth", AuthRoute);
router.use("/admin", AdminRoute);
router.use("/rag", RagRoute);
router.use("/data", NasaPowerRoute);

export const IndexRoute = router;