export interface ISubmitTelemetryPayload {
  deviceId: string;
  temperature?: number | null;
  humidity?: number | null;
  soilMoistureRaw?: number | null;
  rainSensorRaw?: number | null;
  gpsValid?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  satellites?: number | null;
  [key: string]: any;
}

export interface IRelayControlPayload {
  deviceId: string;
  relay: number; // 1 or 2
  state: boolean | "ON" | "OFF";
  source?: "Manual" | "Timer" | "Automation" | "Voice Assistant";
}

export interface IDeviceStatus {
  success: boolean;
  deviceId: string;
  status: "online" | "offline";
  active: boolean;
  lastSeen: string | null;
  secondsSinceLastSeen: number | null;
  relay1: "ON" | "OFF" | boolean;
  relay2: "ON" | "OFF" | boolean;
}

export interface IDeviceAuthPayload {
  deviceId?: string;
  name?: string;
  deviceName?: string;
  key?: string;
  deviceKey?: string;
}
