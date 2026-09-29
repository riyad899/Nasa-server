CREATE TABLE "analyses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "algorithmVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "location" JSONB NOT NULL,
    "crop" JSONB NOT NULL,
    "farmingMethod" TEXT NOT NULL,
    "farmerPriority" JSONB,
    "baselinePeriod" JSONB NOT NULL,
    "recentPeriod" JSONB NOT NULL,
    "methodology" JSONB NOT NULL,
    "recommendation" JSONB,
    "aiExplanation" JSONB,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "analysis_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL REFERENCES "analyses"("id") ON DELETE CASCADE,
    "source" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestParameters" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "units" JSONB NOT NULL,
    "temporalResolution" TEXT,
    "spatialResolution" TEXT,
    "fetchStatus" TEXT NOT NULL,
    "responseTimeMs" INTEGER,
    "requestedStart" TEXT,
    "requestedEnd" TEXT,
    "recordCount" INTEGER,
    "coverage" JSONB,
    "missingData" JSONB,
    "sourceLink" TEXT,
    "sourceVersion" TEXT,
    "errorMessage" TEXT
);
CREATE INDEX "analysis_sources_analysisId_source_idx" ON "analysis_sources"("analysisId", "source");

CREATE TABLE "analysis_observations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL REFERENCES "analyses"("id") ON DELETE CASCADE,
    "source" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "variable" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "isValid" BOOLEAN NOT NULL,
    "qualityNote" TEXT,
    "raw" JSONB
);
CREATE INDEX "analysis_observations_analysisId_source_observedAt_idx" ON "analysis_observations"("analysisId", "source", "observedAt");

CREATE TABLE "analysis_yearly_calculations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL REFERENCES "analyses"("id") ON DELETE CASCADE,
    "periodType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "onsetDate" TEXT,
    "dayOfYear" INTEGER,
    "rainfallTotal" DOUBLE PRECISION,
    "valid" BOOLEAN NOT NULL,
    "missingDays" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "calculation" JSONB NOT NULL
);
CREATE UNIQUE INDEX "analysis_yearly_calculations_analysisId_periodType_year_key" ON "analysis_yearly_calculations"("analysisId", "periodType", "year");

CREATE TABLE "analysis_audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL REFERENCES "analyses"("id") ON DELETE CASCADE,
    "event" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "analysis_audit_logs_analysisId_createdAt_idx" ON "analysis_audit_logs"("analysisId", "createdAt");