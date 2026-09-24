import { Router } from "express";
import { validateZodQuery } from "../../../middleware/validateReq.js";
import { SmapController } from "./smap.controller.js";
import { smapQuerySchema } from "./smap.validation.js";

const router = Router();

// Support /smap and /smap/moisture with GET and POST
router
  .route(["/smap", "/smap/moisture", "/smap/soil-moisture"])
  .get(validateZodQuery(smapQuerySchema), SmapController.getSoilMoisture)
  .post(validateZodQuery(smapQuerySchema), SmapController.getSoilMoisture);

export const SmapRoute = router;
