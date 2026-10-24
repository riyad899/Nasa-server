export interface IProboyChatRequest {
  conversationId?: string;
  message: string;
  guestSessionId?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    district?: string;
  };
  crop?: string;
  language?: "BN" | "EN" | "bn" | "en";
}

export interface IProboySource {
  type: "device_status" | "device_telemetry" | "climate_analysis" | "recommendation" | "why_this_result" | "user_knowledge" | "nasa_data" | "agricultural_kb";
  title: string;
  timestamp?: string;
  details?: Record<string, unknown> | string;
}

export interface IProboyContextStatus {
  userAuthenticated: boolean;
  deviceDataAvailable: boolean;
  deviceOnline?: boolean;
  analysisDataAvailable: boolean;
  knowledgeBaseCount: number;
}

export interface IProboyChatResponse {
  conversationId: string;
  message: {
    role: "assistant";
    content: string;
  };
  sources: IProboySource[];
  contextStatus: IProboyContextStatus;
}

export interface IUserKnowledgeInput {
  title: string;
  content: string;
  sourceType?: "USER_FACT" | "FARM_NOTE" | "CONVERSATION_MEMORY" | "HISTORICAL_ANALYSIS";
  farmId?: string;
  metadata?: Record<string, unknown>;
}
