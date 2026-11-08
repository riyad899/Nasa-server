import { Router } from "express";
import { validateZodQuery } from "../../../middleware/validateReq.js";
import {
    nasaPowerZodSchema,
    nasaPowerRegionalZodSchema,
    nasaPowerHistoricalFetchZodSchema,
    nasaPowerHistoricalQueryZodSchema,
    nasaPowerHistoricalStatusZodSchema,
} from "./nasaPower.validation.js";
import { NasaPowerController } from "./nasaPower.controller.js";

const router = Router();

// Single-Point NASA POWER: GET & POST /api/v1/data/nasa-power
router
    .route("/nasa-power")
    .get(validateZodQuery(nasaPowerZodSchema), NasaPowerController.getNasaPowerData)
    .post(validateZodQuery(nasaPowerZodSchema), NasaPowerController.getNasaPowerData);

// API 1: Fetch and Save Two-Year Regional Data: POST & GET /api/v1/data/nasa-power/regional/historical/fetch
router
    .route(["/nasa-power/regional/historical/fetch", "/nasa-power/historical/fetch"])
    .get(validateZodQuery(nasaPowerHistoricalFetchZodSchema), NasaPowerController.fetchHistoricalRegionalData)
    .post(validateZodQuery(nasaPowerHistoricalFetchZodSchema), NasaPowerController.fetchHistoricalRegionalData);

// API 3: Get Historical Dataset Status: GET /api/v1/data/nasa-power/regional/historical/status
router
    .route(["/nasa-power/regional/historical/status", "/nasa-power/historical/status"])
    .get(validateZodQuery(nasaPowerHistoricalStatusZodSchema), NasaPowerController.getHistoricalStatus);

// API 4: Refresh Missing or Outdated Data: POST /api/v1/data/nasa-power/regional/historical/refresh
router
    .route(["/nasa-power/regional/historical/refresh", "/nasa-power/historical/refresh"])
    .post(validateZodQuery(nasaPowerHistoricalFetchZodSchema), NasaPowerController.refreshHistoricalData);

// API 2: Query Saved Historical Data Directly from DB: GET /api/v1/data/nasa-power/regional/historical
router
    .route(["/nasa-power/regional/historical", "/nasa-power/historical"])
    .get(validateZodQuery(nasaPowerHistoricalQueryZodSchema), NasaPowerController.getSavedHistoricalData);

// Regional / Bounding-Box Live NASA POWER: GET & POST /api/v1/data/nasa-power/regional
router
    .route(["/nasa-power/regional", "/nasa-power-regional"])
    .get(validateZodQuery(nasaPowerRegionalZodSchema), NasaPowerController.getNasaPowerRegionalData)
    .post(validateZodQuery(nasaPowerRegionalZodSchema), NasaPowerController.getNasaPowerRegionalData);

export const NasaPowerRoute = router;


