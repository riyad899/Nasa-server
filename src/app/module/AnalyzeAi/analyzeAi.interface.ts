export interface IAnalyzeLocation {
  latitude: number;
  longitude: number;
}

export interface IAnalyzePeriod {
  startDate: string; // YYYY-MM-DD or YYYYMMDD
  endDate: string;   // YYYY-MM-DD or YYYYMMDD
}

export interface IAnalyzeCrop {
  currentCrop?: string;
  consideringCrops?: string[];
}

export interface IAnalyzeFarmerPriority {
  waterAvailability?: "low" | "medium" | "high" | string;
  riskTolerance?: "low" | "medium" | "high" | string;
  priority?: "water_saving" | "yield_maximization" | "cost_minimization" | string;
}

export interface IAnalyzeSoil {
  type?: string;
  ph?: number;
}

export interface IAnalyzeAiRequest {
  location: IAnalyzeLocation;
  analysisPeriod: IAnalyzePeriod;
  crop?: IAnalyzeCrop;
  farmerPriority?: IAnalyzeFarmerPriority;
  soil?: IAnalyzeSoil;
}

export interface IPlantingWindow {
  start: string;
  end: string;
}

export interface IRecommendation {
  primaryCrop: string;
  alternativeCrops: string[];
  plantingWindow: IPlantingWindow;
  waterRequirement: "low" | "medium" | "high" | string;
  riskLevel: "low" | "moderate" | "high" | "severe" | string;
}

export interface IWhyThisResult {
  factor: string;
  observation: string;
  impact: string;
}

export interface IClimateSummary {
  temperature: {
    mean: number | null;
    max: number | null;
  };
  rainfall: {
    recent: number | null;
    trend: "low" | "moderate" | "high" | "insufficient_data" | string;
  };
  soilMoisture: {
    surface: number | null;
    rootzone: number | null;
    trend: "decreasing" | "increasing" | "stable" | "insufficient_data" | string;
  };
}

export interface IRiskItem {
  type: string;
  level: "low" | "moderate" | "high" | "critical" | string;
  reason: string;
}

export interface IAnalyzeAiResponse {
  analysisId: string;
  location: IAnalyzeLocation;
  analysisPeriod: IAnalyzePeriod;
  recommendation: IRecommendation;
  whyThisResult: IWhyThisResult[];
  climateSummary: IClimateSummary;
  risks: IRiskItem[];
  farmerAdvice: string[];
  dataSources: string[];
  knowledgeSources: string[];
  generatedBy: {
    provider: string;
    model: string;
  };
}

export interface INormalizedEnvironmentalContext {
  power?: {
    avgTemperature: number | null;
    maxTemperature: number | null;
    totalRainfall: number | null;
    avgSolarRadiation: number | null;
    recordsCount: number;
  };
  imerg?: {
    totalRainfall: number | null;
    averageRainfall: number | null;
    maximumDailyRainfall: number | null;
    rainyDays: number;
    dryDays: number;
  };
  smap?: {
    surfaceMoistureMean: number | null;
    rootzoneMoistureMean: number | null;
    surfaceCondition?: string;
    rootzoneCondition?: string;
  };
  missingSources: string[];
}
