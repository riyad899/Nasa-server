import { Router } from "express";
import { validateZodQuery } from "../../../middleware/validateReq.js";
import { ImergController } from "./imerg.controller.js";
import {
    imergQuerySchema,
    imergHistoricalFetchSchema,
    imergHistoricalQuerySchema,
    imergHistoricalStatusSchema,
} from "./imerg.validation.js";

const router = Router();

// ─── Historical & 2-Year Ingestion Routes ─────────────────────────────────────
router
    .route(["/imerg/historical/fetch", "/imerg/historical-fetch"])
    .get(validateZodQuery(imergHistoricalFetchSchema), ImergController.fetchHistorical)
    .post(validateZodQuery(imergHistoricalFetchSchema), ImergController.fetchHistorical);

router
    .route("/imerg/historical/status")
    .get(validateZodQuery(imergHistoricalStatusSchema), ImergController.getStatus);

router
    .route("/imerg/historical/refresh")
    .post(validateZodQuery(imergHistoricalFetchSchema), ImergController.refreshHistorical);

router
    .route("/imerg/historical")
    .get(validateZodQuery(imergHistoricalQuerySchema), ImergController.getHistorical);

// ─── Standard Daily Live Endpoints ────────────────────────────────────────────
router
    .route(["/imerg", "/imerg/rainfall"])
    .get(validateZodQuery(imergQuerySchema), ImergController.getRainfall)
    .post(validateZodQuery(imergQuerySchema), ImergController.getRainfall);

export const ImergRoute = router;
