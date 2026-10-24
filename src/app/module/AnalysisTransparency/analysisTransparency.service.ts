import status from "http-status";
import AppError from "../../errorHelpers/appError.js";
import { prisma } from "../../lib/prisma.js";
import type { IObservationPage, IObservationQuery } from "./analysisTransparency.interface.js";

const getAnalysis = async (analysisId: string) => {
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: { sources: true, yearlyCalculations: true, auditLogs: { orderBy: { createdAt: "desc" } } },
  });
  if (!analysis) throw new AppError("Analysis not found", status.NOT_FOUND);
  return analysis;
};

const getObservations = async (analysisId: string, query: IObservationQuery): Promise<IObservationPage> => {
  await getAnalysis(analysisId);
  const where = {
    analysisId,
    ...(query.source ? { source: query.source } : {}),
    ...(query.variable ? { variable: query.variable } : {}),
    ...(query.startDate || query.endDate ? { observedAt: { ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}), ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}) } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.analysisObservation.findMany({ where, orderBy: { observedAt: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, source: true, observedAt: true, variable: true, value: true, unit: true, isValid: true, qualityNote: true } }),
    prisma.analysisObservation.count({ where }),
  ]);
  return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
};

const csvEscape = (value: unknown): string => `"${String(value ?? "").replaceAll('"', '""')}"`;

const getObservationsCsv = async (analysisId: string, query: IObservationQuery): Promise<string> => {
  const pageSize = 500;
  const rows: string[] = ["id,source,observedAt,variable,value,unit,isValid,qualityNote"];
  for (let page = 1; ; page += 1) {
    const result = await getObservations(analysisId, { ...query, page, pageSize });
    rows.push(...result.items.map((item) => [item.id, item.source, item.observedAt.toISOString(), item.variable, item.value, item.unit, item.isValid, item.qualityNote].map(csvEscape).join(",")));
    if (page >= result.pagination.totalPages) break;
  }
  return rows.join("\n");
};

const saveAnalysisHistory = async (data: any, userId: string) => {
  const analysisId = data.analysisId || `analysis_${Date.now()}`;
  
  // 1. Upsert ClimateAnalysisHistory
  const history = await prisma.climateAnalysisHistory.upsert({
    where: { id: analysisId },
    create: {
      id: analysisId,
      userId,
      farmId: data.farmId || null,
      location: data.location || {},
      crop: data.crop || {},
      farmingMethod: data.farmingMethod || null,
      farmerPriority: data.farmerPriority || null,
      baselinePeriod: data.baselinePeriod || null,
      recentPeriod: data.recentPeriod || null,
      methodology: data.methodology || null,
      results: data.results || {},
      shiftDays: data.shiftDays != null ? Number(data.shiftDays) : null,
      plantingWindowStart: data.plantingWindowStart || null,
      plantingWindowEnd: data.plantingWindowEnd || null,
      confidence: data.confidence || "moderate",
      dataSources: Array.isArray(data.dataSources) ? data.dataSources : ["NASA POWER"],
      status: "COMPLETED",
    },
    update: {
      userId,
      farmId: data.farmId || null,
      location: data.location || {},
      crop: data.crop || {},
      results: data.results || {},
      shiftDays: data.shiftDays != null ? Number(data.shiftDays) : null,
      plantingWindowStart: data.plantingWindowStart || null,
      plantingWindowEnd: data.plantingWindowEnd || null,
      confidence: data.confidence || "moderate",
      dataSources: Array.isArray(data.dataSources) ? data.dataSources : ["NASA POWER"],
      status: "COMPLETED",
    },
  });

  // 2. Persist Recommendation if provided
  if (data.recommendationText || data.whyThisResult || data.farmerGuidance) {
    const existingRec = await prisma.recommendationHistory.findFirst({
      where: { climateAnalysisId: analysisId },
    });

    if (existingRec) {
      await prisma.recommendationHistory.update({
        where: { id: existingRec.id },
        data: {
          recommendationText: data.recommendationText || existingRec.recommendationText,
          cropType: data.cropType || data.crop?.cropType || data.crop?.currentCrop,
          plantingWindowStart: data.plantingWindowStart,
          plantingWindowEnd: data.plantingWindowEnd,
          explanation: data.explanation,
          farmerGuidance: data.farmerGuidance,
          whyThisResult: data.whyThisResult,
        },
      });
    } else {
      await prisma.recommendationHistory.create({
        data: {
          userId,
          farmId: data.farmId || null,
          climateAnalysisId: analysisId,
          cropType: data.cropType || data.crop?.cropType || data.crop?.currentCrop,
          plantingWindowStart: data.plantingWindowStart,
          plantingWindowEnd: data.plantingWindowEnd,
          recommendationText: data.recommendationText || "Recommended planting window based on climate analysis",
          explanation: data.explanation,
          farmerGuidance: data.farmerGuidance,
          whyThisResult: data.whyThisResult,
        },
      });
    }
  }

  return history;
};

const getUserHistory = async (userId: string) => {
  return prisma.climateAnalysisHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      recommendations: true,
    },
    take: 20,
  });
};

const getLatestUserAnalysis = async (userId: string) => {
  return prisma.climateAnalysisHistory.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      recommendations: true,
    },
  });
};

const deleteAnalysis = async (analysisId: string, userId: string) => {
  const record = await prisma.climateAnalysisHistory.findUnique({
    where: { id: analysisId },
  });
  if (!record) {
    throw new AppError("Analysis not found", status.NOT_FOUND);
  }
  if (record.userId !== userId) {
    throw new AppError("Forbidden: Cannot delete analysis belonging to another user", status.FORBIDDEN);
  }
  return prisma.climateAnalysisHistory.delete({
    where: { id: analysisId },
  });
};

export const AnalysisTransparencyService = {
  getAnalysis,
  getObservations,
  getObservationsCsv,
  saveAnalysisHistory,
  getUserHistory,
  getLatestUserAnalysis,
  deleteAnalysis,
};