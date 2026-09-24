import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { RAGService } from "./rag.service.js";

const ragService = new RAGService();

const getStats = catchAsync(async (req: Request, res: Response) => {
  const result = await ragService.getStats();
  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "RAG stats retrieved successfully",
    data: result,
  });
});

const ingestSpaceData = catchAsync(async (req: Request, res: Response) => {
  const result = await ragService.ingestSpaceKnowledge();
  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "NASA space knowledge ingestion completed successfully",
    data: result,
  });
});

const ingestCustomDocument = catchAsync(async (req: Request, res: Response) => {
  const { chunkKey, sourceType, sourceId, sourceLabel, content, metadata } = req.body;

  if (!sourceType || !sourceId || !content) {
    return sendResponse(res, {
      httpStatus: status.BAD_REQUEST,
      success: false,
      message: "sourceType, sourceId, and content are required fields",
    });
  }

  const result = await ragService.ingestCustomDocument({
    chunkKey,
    sourceType,
    sourceId,
    sourceLabel,
    content,
    metadata,
  });

  sendResponse(res, {
    httpStatus: status.CREATED,
    success: true,
    message: "Document indexed successfully",
    data: result,
  });
});

const queryRag = catchAsync(async (req: Request, res: Response) => {
  const { query, limit, sourceType, asJson, customSystemPrompt } = req.body;

  if (!query) {
    return sendResponse(res, {
      httpStatus: status.BAD_REQUEST,
      success: false,
      message: "Query is required",
    });
  }

  const result = await ragService.generateAnswer(
    query,
    limit ?? 5,
    sourceType,
    asJson ?? false,
    customSystemPrompt
  );

  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "RAG answer generated successfully",
    data: result,
  });
});

export const RagController = {
  getStats,
  ingestSpaceData,
  ingestCustomDocument,
  queryRag,
};
