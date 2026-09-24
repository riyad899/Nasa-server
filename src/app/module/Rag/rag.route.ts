import { Router } from "express";
import { RagController } from "./rag.controller.js";

const router = Router();

// Retrieve RAG vector stats
router.get("/stats", RagController.getStats);

// Ingest NASA Space Knowledge base
router.post("/ingest", RagController.ingestSpaceData);

// Backward-compatible alias for ingest
router.post("/ingest-doctors", RagController.ingestSpaceData);

// Ingest custom document/data
router.post("/ingest-document", RagController.ingestCustomDocument);

// Query RAG (retrieve documents + generate LLM response)
router.post("/query", RagController.queryRag);

export const RagRoute = router;
