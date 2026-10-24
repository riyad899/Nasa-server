import { Request, Response } from "express";
import status from "http-status";
import catchAsync from "../../shared/catchAsync.js";
import { sendResponse } from "../../shared/sendResponse.js";
import { DeviceService } from "./device.service.js";

const submitTelemetry = catchAsync(async (req: Request, res: Response) => {
  const result = await DeviceService.submitTelemetry(req.body);
  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "Device telemetry recorded successfully",
    data: result,
  });
});

const getLatestTelemetry = catchAsync(async (req: Request, res: Response) => {
  const deviceId = (req.query.deviceId as string) || "esp32-001";
  const userId = req.user?.userId;
  const result = await DeviceService.getLatestTelemetry(deviceId, userId);
  res.status(status.OK).json(result);
});

const getDeviceStatus = catchAsync(async (req: Request, res: Response) => {
  const deviceId = (req.query.deviceId as string) || "esp32-001";
  const userId = req.user?.userId;
  const result = await DeviceService.getDeviceStatus(deviceId, userId);
  res.status(status.OK).json(result);
});

const getRelayCommand = catchAsync(async (req: Request, res: Response) => {
  const deviceId = (req.query.deviceId as string) || "esp32-001";
  const result = await DeviceService.getRelayCommand(deviceId);
  // Match expected firmware response contract exactly
  res.status(status.OK).json(result);
});

const controlRelay = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const result = await DeviceService.controlRelay(req.body, userId);
  sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "Relay state updated successfully",
    data: result,
  });
});

const authenticateDevice = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  const result = await DeviceService.authenticateDevice(req.body, userId);
  res.status(status.OK).json(result);
});

const getAuthStatus = catchAsync(async (req: Request, res: Response) => {
  const deviceId = (req.query.deviceId as string) || "esp32-001";
  const result = await DeviceService.getAuthStatus(deviceId);
  res.status(status.OK).json(result);
});

const getHealth = catchAsync(async (_req: Request, res: Response) => {
  const result = await DeviceService.getHealth();
  res.status(status.OK).json(result);
});

export const DeviceController = {
  submitTelemetry,
  getLatestTelemetry,
  getDeviceStatus,
  getRelayCommand,
  controlRelay,
  authenticateDevice,
  getAuthStatus,
  getHealth,
};
