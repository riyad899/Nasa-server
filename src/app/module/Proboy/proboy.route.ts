import { Router } from "express";
import { optionalAuth } from "../../../middleware/checkAuth.js";
import { ProboyController } from "./proboy.controller.js";

const router = Router();

router.post("/chat", optionalAuth(), ProboyController.chat);
router.get("/conversations", optionalAuth(), ProboyController.getConversations);
router.get("/conversations/:conversationId", optionalAuth(), ProboyController.getConversationMessages);
router.post("/knowledge", optionalAuth(), ProboyController.addKnowledge);
router.get("/knowledge", optionalAuth(), ProboyController.getKnowledge);

export const ProboyRoute = router;
