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

export const AnalysisTransparencyService = { getAnalysis, getObservations, getObservationsCsv };