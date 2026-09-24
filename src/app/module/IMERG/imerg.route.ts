import { Router } from "express";
import { validateZodQuery } from "../../../middleware/validateReq.js";
import { ImergController } from "./imerg.controller.js";
import { imergQuerySchema } from "./imerg.validation.js";

const router = Router();

// Support both /imerg and /imerg/rainfall with GET and POST
router
    .route(["/imerg", "/imerg/rainfall"])
    .get(validateZodQuery(imergQuerySchema), ImergController.getRainfall)
    .post(validateZodQuery(imergQuerySchema), ImergController.getRainfall);

export const ImergRoute = router;
