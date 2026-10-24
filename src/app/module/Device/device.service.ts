/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "../../lib/prisma.js";
import AppError from "../../errorHelpers/appError.js";
import status from "http-status";
import { ISubmitTelemetryPayload, IRelayControlPayload } from "./device.interface.js";
import { envVars } from "../../../config/env.js";

const OFFLINE_THRESHOLD_SECONDS = 75; // ESP32 pings every ~15s; offline after 75s

const getUpstreamIotUrl = (): string => {
  return (
    envVars?.ESP32_SERVER_API_URL ||
    envVars?.ESP32_API_URL ||
    process.env.ESP32_SERVER_API_URL ||
    process.env.ESP32_API_URL ||
    "https://esp32-iot-cloude-connect.vercel.app"
  ).replace(/\/+$/, "");
};

export class DeviceService {
  /**
   * Submit device sensor telemetry (from ESP32 or gateway)
   */
  static async submitTelemetry(payload: ISubmitTelemetryPayload) {
    const { deviceId } = payload;
    if (!deviceId || typeof deviceId !== "string" || !deviceId.trim()) {
      throw new AppError("Invalid or missing deviceId", status.BAD_REQUEST);
    }

    const cleanDeviceId = deviceId.trim();
    const now = new Date();

    // 1. Upsert Device in Database
    const device = await prisma.device.upsert({
      where: { deviceId: cleanDeviceId },
      create: {
        deviceId: cleanDeviceId,
        name: `ESP32 (${cleanDeviceId})`,
        deviceType: "ESP32-S3",
        lastSeenAt: now,
        connectionStatus: "online",
        location: payload.latitude && payload.longitude
          ? { latitude: payload.latitude, longitude: payload.longitude }
          : undefined,
      },
      update: {
        lastSeenAt: now,
        connectionStatus: "online",
        location: payload.latitude && payload.longitude
          ? { latitude: payload.latitude, longitude: payload.longitude }
          : undefined,
      },
    });

    // 2. Persist Telemetry Record
    const telemetry = await prisma.deviceTelemetry.create({
      data: {
        deviceId: cleanDeviceId,
        temperature: payload.temperature != null ? Number(payload.temperature) : null,
        humidity: payload.humidity != null ? Number(payload.humidity) : null,
        soilMoistureRaw: payload.soilMoistureRaw != null ? Number(payload.soilMoistureRaw) : null,
        rainSensorRaw: payload.rainSensorRaw != null ? Number(payload.rainSensorRaw) : null,
        gpsValid: Boolean(payload.gpsValid),
        latitude: payload.latitude != null ? Number(payload.latitude) : null,
        longitude: payload.longitude != null ? Number(payload.longitude) : null,
        altitude: payload.altitude != null ? Number(payload.altitude) : null,
        satellites: payload.satellites != null ? Number(payload.satellites) : null,
        rawPayload: payload,
        recordedAt: now,
        receivedAt: now,
      },
    });

    // 3. Best-effort async forward to upstream IoT cloud so third-party hardware mirrors state
    try {
      fetch(`${getUpstreamIotUrl()}/api/device/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {
      // ignore
    }

    return {
      success: true,
      deviceId: cleanDeviceId,
      status: "online",
      recordedAt: telemetry.recordedAt,
    };
  }

  /**
   * Get latest device sensor readings
   */
  static async getLatestTelemetry(deviceId: string, userId?: string) {
    if (!deviceId || !deviceId.trim()) {
      throw new AppError("deviceId is required", status.BAD_REQUEST);
    }
    const cleanId = deviceId.trim();

    // Verification if user is authenticated and device has an owner
    const device = await prisma.device.findUnique({
      where: { deviceId: cleanId },
      include: {
        telemetries: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
    });

    if (device?.ownerUserId && userId && device.ownerUserId !== userId) {
      throw new AppError("Access denied! You do not own this device.", status.FORBIDDEN);
    }

    let latestDb = device?.telemetries?.[0] || null;

    // If local DB doesn't have readings, fall back to upstream gateway
    if (!latestDb) {
      try {
        const resp = await fetch(`${getUpstreamIotUrl()}/api/device/data/latest?deviceId=${encodeURIComponent(cleanId)}`, {
          signal: AbortSignal.timeout(4000),
        });
        if (resp.ok) {
          const upstream = await resp.json();
          if (upstream?.success && upstream?.data) {
            return {
              success: true,
              data: upstream.data,
              relay1: device?.relay1State || "OFF",
              relay2: device?.relay2State || "OFF",
              source: "upstream_gateway",
            };
          }
        }
      } catch {
        // ignore
      }
    }

    const recordedAt = latestDb?.recordedAt || device?.lastSeenAt;
    const secondsSinceLastSeen = recordedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(recordedAt).getTime()) / 1000))
      : null;

    const isOnline = secondsSinceLastSeen !== null && secondsSinceLastSeen <= OFFLINE_THRESHOLD_SECONDS;

    return {
      success: true,
      data: latestDb
        ? {
            deviceId: cleanId,
            temperature: latestDb.temperature,
            humidity: latestDb.humidity,
            soilMoistureRaw: latestDb.soilMoistureRaw,
            rainSensorRaw: latestDb.rainSensorRaw,
            gpsValid: latestDb.gpsValid,
            latitude: latestDb.latitude,
            longitude: latestDb.longitude,
            altitude: latestDb.altitude,
            satellites: latestDb.satellites,
            recordedAt: latestDb.recordedAt,
            secondsAgo: secondsSinceLastSeen,
            isOnline,
          }
        : null,
      relay1: device?.relay1State || "OFF",
      relay2: device?.relay2State || "OFF",
      connectionStatus: isOnline ? "online" : "offline",
    };
  }

  /**
   * Get device online/offline status
   */
  static async getDeviceStatus(deviceId: string, userId?: string) {
    if (!deviceId || !deviceId.trim()) {
      throw new AppError("deviceId is required", status.BAD_REQUEST);
    }
    const cleanId = deviceId.trim();

    const device = await prisma.device.findUnique({
      where: { deviceId: cleanId },
    });

    if (device?.ownerUserId && userId && device.ownerUserId !== userId) {
      throw new AppError("Access denied! You do not own this device.", status.FORBIDDEN);
    }

    let lastSeenAt = device?.lastSeenAt;
    let relay1State = device?.relay1State || "OFF";
    let relay2State = device?.relay2State || "OFF";

    // Also check upstream gateway status for fallback
    try {
      const resp = await fetch(`${getUpstreamIotUrl()}/api/device/status?deviceId=${encodeURIComponent(cleanId)}`, {
        signal: AbortSignal.timeout(3500),
      });
      if (resp.ok) {
        const upstream = await resp.json();
        if (upstream?.success && upstream?.lastSeen) {
          const upstreamTime = new Date(upstream.lastSeen);
          if (!lastSeenAt || upstreamTime > new Date(lastSeenAt)) {
            lastSeenAt = upstreamTime;
          }
        }
      }
    } catch {
      // ignore
    }

    const secondsSinceLastSeen = lastSeenAt
      ? Math.max(0, Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 1000))
      : null;

    const isOnline = secondsSinceLastSeen !== null && secondsSinceLastSeen <= OFFLINE_THRESHOLD_SECONDS;

    return {
      success: true,
      deviceId: cleanId,
      status: isOnline ? ("online" as const) : ("offline" as const),
      active: isOnline,
      lastSeen: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
      secondsSinceLastSeen,
      relay1: relay1State,
      relay2: relay2State,
    };
  }

  /**
   * Relay command polling for ESP32 firmware
   */
  static async getRelayCommand(deviceId: string) {
    if (!deviceId || !deviceId.trim()) {
      throw new AppError("deviceId is required", status.BAD_REQUEST);
    }
    const cleanId = deviceId.trim();

    const device = await prisma.device.findUnique({
      where: { deviceId: cleanId },
    });

    let relay1 = device?.relay1State || "OFF";
    let relay2 = device?.relay2State || "OFF";
    let updatedAt = device?.updatedAt ? device.updatedAt.toISOString() : new Date().toISOString();

    // Check upstream for any external updates
    try {
      const resp = await fetch(`${getUpstreamIotUrl()}/api/device/relay/command?deviceId=${encodeURIComponent(cleanId)}`, {
        signal: AbortSignal.timeout(3500),
      });
      if (resp.ok) {
        const upstream = await resp.json();
        if (upstream?.success) {
          relay1 = upstream.relay1 ?? relay1;
          relay2 = upstream.relay2 ?? relay2;
          updatedAt = upstream.updatedAt ?? updatedAt;
        }
      }
    } catch {
      // ignore
    }

    const isRelay1On = String(relay1).toUpperCase() === "ON" || String(relay1).toLowerCase() === "true";
    const isRelay2On = String(relay2).toUpperCase() === "ON" || String(relay2).toLowerCase() === "true";


    return {
      success: true,
      deviceId: cleanId,
      relay1: isRelay1On,
      relay2: isRelay2On,
      relay1State: isRelay1On ? "ON" : "OFF",
      relay2State: isRelay2On ? "ON" : "OFF",
      updatedAt,
    };

  }

  /**
   * Execute or request Relay Control change
   */
  static async controlRelay(payload: IRelayControlPayload, userId?: string) {
    const { deviceId, relay, state, source = "Manual" } = payload;
    if (!deviceId || !deviceId.trim()) {
      throw new AppError("deviceId is required", status.BAD_REQUEST);
    }
    if (relay !== 1 && relay !== 2) {
      throw new AppError("relay must be 1 or 2", status.BAD_REQUEST);
    }

    const cleanId = deviceId.trim();
    const normalizedState = (state === true || state === "ON") ? "ON" : "OFF";
    const relayKey = relay === 1 ? "relay1State" : "relay2State";
    const relayName = relay === 1 ? "Relay 1" : "Relay 2";

    // Verify ownership if device has an owner
    const existingDevice = await prisma.device.findUnique({
      where: { deviceId: cleanId },
    });

    if (existingDevice?.ownerUserId && userId && existingDevice.ownerUserId !== userId) {
      throw new AppError("Access denied! You do not have permission to control this device.", status.FORBIDDEN);
    }

    const updatedDevice = await prisma.device.upsert({
      where: { deviceId: cleanId },
      create: {
        deviceId: cleanId,
        ownerUserId: userId || null,
        name: `ESP32 (${cleanId})`,
        [relayKey]: normalizedState,
      },
      update: {
        [relayKey]: normalizedState,
      },
    });

    // Record Activity Log
    await prisma.deviceActivityLog.create({
      data: {
        deviceId: cleanId,
        userId: userId || null,
        relay: relayName,
        action: normalizedState,
        source,
        triggerDetails: `${source} switched ${relayName} to ${normalizedState}`,
        status: "Success",
      },
    });

    // Dispatch to upstream gateway so physical ESP32 polling Vercel gets the update
    try {
      fetch(`${getUpstreamIotUrl()}/api/device/relay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: cleanId,
          relay,
          state: normalizedState === "ON",
        }),
      }).catch(() => {});
    } catch {
      // ignore
    }

    return {
      success: true,
      deviceId: cleanId,
      relay,
      state: normalizedState,
      relay1: updatedDevice.relay1State,
      relay2: updatedDevice.relay2State,
      updatedAt: updatedDevice.updatedAt,
    };
  }

  /**
   * Authenticate and Connect Device (POST /api/device/auth or /api/device/connect)
   */
  static async authenticateDevice(payload: any, userId?: string) {
    const deviceId = (payload?.deviceId || "esp32-001").trim();
    const name = (payload?.name || payload?.deviceName || "ESP32 Master Agro").trim();
    const key = (payload?.key || payload?.deviceKey || "").trim();

    const expectedKey = process.env.DEVICE_KEY || "102030";
    if (!key || (key !== expectedKey && key !== "102030")) {
      throw new AppError("Invalid device key! Please provide the correct device secret key (e.g. 102030).", status.UNAUTHORIZED);
    }

    const now = new Date();
    let upstreamRes: any = null;

    // Call upstream IoT cloud gateway to authenticate device globally
    try {
      const resp = await fetch(`${getUpstreamIotUrl()}/api/device/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          name,
          key,
        }),
      });
      if (resp.ok) {
        upstreamRes = await resp.json();
      }
    } catch {
      // ignore upstream connectivity failure, fallback to local DB registration
    }

    // Persist or update device in local PostgreSQL DB
    const device = await prisma.device.upsert({
      where: { deviceId },
      create: {
        deviceId,
        name,
        deviceType: "ESP32-S3",
        ownerUserId: userId || null,
        connectionStatus: "online",
        lastSeenAt: now,
      },
      update: {
        name,
        connectionStatus: "online",
        lastSeenAt: now,
        ...(userId ? { ownerUserId: userId } : {}),
      },
    });

    const token =
      upstreamRes?.device?.token ||
      `tok_${Buffer.from(`${deviceId}_${Date.now()}`).toString("hex")}`;

    return {
      success: true,
      connected: true,
      status: "online",
      message: "Device authenticated and connected successfully! (ডিভাইস সফলভাবে কানেক্ট হয়েছে)",
      device: {
        deviceId: device.deviceId,
        name: device.name,
        status: "online",
        connected: true,
        lastConnectedAt: now.toISOString(),
        token,
      },
      permissions: {
        telemetryUpload: true,
        telemetryRead: true,
        relayControl: true,
        relayCommandPoll: true,
      },
      apis: {
        sendTelemetry: {
          method: "POST",
          endpoint: "/api/device/data",
          description: "ESP32 sends sensor telemetry every 5 mins",
        },
        getLatestData: {
          method: "GET",
          endpoint: `/api/device/data/latest?deviceId=${deviceId}`,
          description: "Get latest sensor readings and GPS location",
        },
        getDeviceStatus: {
          method: "GET",
          endpoint: `/api/device/status?deviceId=${deviceId}`,
          description: "Check device online/offline heartbeat status",
        },
        pollRelayCommand: {
          method: "GET",
          endpoint: `/api/device/relay/command?deviceId=${deviceId}`,
          description: "Poll relay command for water pump and solenoid valve",
        },
        controlRelay: {
          method: "POST",
          endpoint: "/api/device/relay",
          description: "Turn relay1 (pump) or relay2 ON/OFF",
        },
      },
    };
  }

  /**
   * Check Device Auth & Connection Status (GET /api/device/auth or /api/device/connect)
   */
  static async getAuthStatus(deviceIdParam = "esp32-001") {
    const cleanId = (deviceIdParam || "esp32-001").trim();

    // Check upstream gateway first
    try {
      const resp = await fetch(`${getUpstreamIotUrl()}/api/device/auth?deviceId=${encodeURIComponent(cleanId)}`, {
        signal: AbortSignal.timeout(3500),
      });
      if (resp.ok) {
        const upstream = await resp.json();
        if (upstream?.success) {
          return upstream;
        }
      }
    } catch {
      // fallback
    }

    const device = await prisma.device.findUnique({
      where: { deviceId: cleanId },
    });

    const isConnected = Boolean(device);
    const lastSeen = device?.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : null;
    const secondsSinceLastSeen = device?.lastSeenAt
      ? Math.max(0, Math.floor((Date.now() - new Date(device.lastSeenAt).getTime()) / 1000))
      : null;
    const isOnline = secondsSinceLastSeen !== null && secondsSinceLastSeen <= OFFLINE_THRESHOLD_SECONDS;

    return {
      success: true,
      deviceId: cleanId,
      name: device?.name || "ESP32 Master Agro",
      connected: isConnected,
      status: isOnline ? "online" : "offline",
      lastConnectedAt: lastSeen,
      secondsSinceLastSeen,
    };
  }

  /**
   * Health Check
   */
  static async getHealth() {
    let dbStatus = "connected";
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
    } catch (err: any) {
      dbStatus = `disconnected: ${err?.message || "error"}`;
    }

    return {
      status: "healthy",
      service: "CropWise AI (FieldShift) IoT & API Service",
      timestamp: new Date().toISOString(),
      database: dbStatus,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
