import { Router } from "express";
import { DeviceController } from "./device.controller.js";

const router = Router();

// API 1: Submit Device Telemetry
router.post("/data", DeviceController.submitTelemetry);

// API 2: Get Latest Device Data
router.get("/data/latest", DeviceController.getLatestTelemetry);

// API 3: Device Online/Offline Status
router.get("/status", DeviceController.getDeviceStatus);

// API 4: Relay Command Polling (for ESP32 firmware)
router.get("/relay/command", DeviceController.getRelayCommand);
router.get("/relay", DeviceController.getRelayCommand);

// API 5: Relay Control
router.post("/relay", DeviceController.controlRelay);

// API 6: Device Authentication & Connection (POST /api/device/auth & /api/device/connect)
router.post("/auth", DeviceController.authenticateDevice);
router.post("/connect", DeviceController.authenticateDevice);

// API 7: Device Connection Check (GET /api/device/auth & /api/device/connect)
router.get("/auth", DeviceController.getAuthStatus);
router.get("/connect", DeviceController.getAuthStatus);

export const DeviceRoute = router;
