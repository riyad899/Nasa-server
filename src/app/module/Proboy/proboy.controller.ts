/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { ProboyService } from "./proboy.service.js";

const chat = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const result = await ProboyService.handleChat(req.body, userId);
  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "Proboy AI responded successfully",
    data: result,
  });
});

const getConversations = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    return sendResponse(res, {
      httpStatus: status.OK,
      success: true,
      message: "No conversations for guest",
      data: [],
    });
  }
  const result = await ProboyService.getConversations(userId);
  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "Conversations fetched successfully",
    data: result,
  });
});

const getConversationMessages = catchAsync(async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId;
  const result = await ProboyService.getConversationMessages(conversationId as string, userId);
  if (!result) {
    return sendResponse(res, {
      httpStatus: status.NOT_FOUND,
      success: false,
      message: "Conversation not found",
      data: null,
    });
  }
  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "Conversation messages fetched successfully",
    data: result,
  });
});

const addKnowledge = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    return sendResponse(res, {
      httpStatus: status.UNAUTHORIZED,
      success: false,
      message: "Authentication required to add knowledge",
      data: null,
    });
  }
  const result = await ProboyService.addUserKnowledge(req.body, userId);
  sendResponse(res, {
    httpStatus: status.CREATED,
    success: true,
    message: "User knowledge added successfully",
    data: result,
  });
});

const getKnowledge = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    return sendResponse(res, {
      httpStatus: status.OK,
      success: true,
      message: "No knowledge base for guest",
      data: [],
    });
  }
  const result = await ProboyService.getUserKnowledge(userId);
  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "User knowledge base fetched successfully",
    data: result,
  });
});

export const ProboyController = {
  chat,
  getConversations,
  getConversationMessages,
  addKnowledge,
  getKnowledge,
};
