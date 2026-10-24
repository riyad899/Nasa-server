import { Router } from "express";
import { optionalAuth } from "../../../middleware/checkAuth.js";
import { CropWiseAiController } from "./cropwise.controller.js";

const router = Router();

router.post("/chat", optionalAuth(), CropWiseAiController.chat);
router.get("/conversations", optionalAuth(), CropWiseAiController.getConversations);
router.get("/conversations/:conversationId", optionalAuth(), CropWiseAiController.getConversationMessages);
router.post("/knowledge", optionalAuth(), CropWiseAiController.addKnowledge);
router.get("/knowledge", optionalAuth(), CropWiseAiController.getKnowledge);

export const CropWiseAiRoute = router;
export const ProboyRoute = router;
