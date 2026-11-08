import { Router } from "express";
import { validateZodQuery } from "../../../middleware/validateReq.js";
import { SmapController } from "./smap.controller.js";
import {
  smapQuerySchema,
  smapHistoricalFetchSchema,
  smapHistoricalQuerySchema,
  smapHistoricalStatusSchema,
} from "./smap.validation.js";

const router = Router();

// ─── Historical & 2-Year Ingestion Routes ─────────────────────────────────────
router
  .route(["/smap/historical/fetch", "/smap/historical-fetch"])
  .get(validateZodQuery(smapHistoricalFetchSchema), SmapController.fetchHistorical)
  .post(validateZodQuery(smapHistoricalFetchSchema), SmapController.fetchHistorical);

router
  .route("/smap/historical/status")
  .get(validateZodQuery(smapHistoricalStatusSchema), SmapController.getStatus);

router
  .route("/smap/historical/refresh")
  .post(validateZodQuery(smapHistoricalFetchSchema), SmapController.refreshHistorical);

router
  .route("/smap/historical")
  .get(validateZodQuery(smapHistoricalQuerySchema), SmapController.getHistorical);

// ─── Standard Daily Live Endpoints ────────────────────────────────────────────
// Support /smap and /smap/moisture with GET and POST
router
  .route(["/smap", "/smap/moisture", "/smap/soil-moisture"])
  .get(validateZodQuery(smapQuerySchema), SmapController.getSoilMoisture)
  .post(validateZodQuery(smapQuerySchema), SmapController.getSoilMoisture);

export const SmapRoute = router;
