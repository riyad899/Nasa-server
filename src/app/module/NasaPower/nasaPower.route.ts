import { Router } from "express";
import { validateZodSchema } from "../../../middleware/validateReq.js";
import { nasaPowerZodSchema } from "./nasaPower.validation.js";
import { NasaPowerController } from "./nasaPower.controller.js";

const router = Router();

// GET /api/v1/data/nasa-power
router.get(
    "/nasa-power",
    validateZodSchema(nasaPowerZodSchema),
    NasaPowerController.getNasaPowerData
);

export const NasaPowerRoute = router;
