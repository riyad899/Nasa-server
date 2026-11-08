import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../app/lib/prisma.js";
import {
  resolveLocation,
  splitDateRangeIntoChunks,
  buildRegionKey,
  getSeasonForDate,
} from "../app/shared/geo.constants.js";
import {
  getImergHistoricalDataFromDB,
  getImergDatasetStatus,
} from "../app/module/IMERG/imerg.service.js";
import {
  SmapService,
} from "../app/module/SMAP/smap.service.js";

describe("IMERG & SMAP Historical 2-Year System Tests", () => {
  describe("Location Resolution & Chunking", () => {
    it("should resolve single point latitude and longitude into a buffered region", () => {
      const resolved = resolveLocation({ latitude: 24.37, longitude: 88.6 });
      assert.equal(resolved.latitudeMin, 24.12);
      assert.equal(resolved.latitudeMax, 24.62);
      assert.equal(resolved.longitudeMin, 88.35);
      assert.equal(resolved.longitudeMax, 88.85);
      assert.equal(resolved.regionKey, "bbox:24.12:24.62:88.35:88.85");
    });

    it("should resolve district name into district bounding box", () => {
      const resolved = resolveLocation({ district: "Rajshahi" });
      assert.equal(resolved.district, "Rajshahi");
      assert.equal(resolved.regionKey, "bbox:24.00:24.75:88.20:89.00");
    });

    it("should split a 2-year range into chunks <= 60 days for IMERG", () => {
      const chunks = splitDateRangeIntoChunks("20230101", "20241231", 60);
      assert.ok(chunks.length >= 12, "Should create at least 12 chunks for 731 days");
      for (const chunk of chunks) {
        assert.ok(chunk.daysCount <= 60, `Chunk exceeds 60 days: ${chunk.daysCount}`);
      }
    });

    it("should split a 2-year range into chunks <= 30 days for SMAP", () => {
      const chunks = splitDateRangeIntoChunks("20230101", "20241231", 30);
      assert.ok(chunks.length >= 24, "Should create at least 24 chunks for 731 days");
      for (const chunk of chunks) {
        assert.ok(chunk.daysCount <= 30, `Chunk exceeds 30 days: ${chunk.daysCount}`);
      }
    });
  });

  describe("IMERG Database Persistence & Fast Query", () => {
    const testRegionKey = "bbox:24.00:24.75:88.20:89.00";

    it("should upsert test IMERG daily records without duplication", async () => {
      const testDates = ["20240101", "20240102", "20240103"];
      const rainValues = [5.2, 0.0, 18.4];

      for (let i = 0; i < testDates.length; i++) {
        const d = testDates[i];
        const rain = rainValues[i];
        const observedAt = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);

        await prisma.imergDailyRecord.upsert({
          where: { regionKey_date: { regionKey: testRegionKey, date: d } },
          create: {
            regionKey: testRegionKey,
            date: d,
            observedAt,
            meanRainfall: rain,
            minRainfall: 0.0,
            maxRainfall: rain * 1.5,
            validCells: 100,
            missingCells: 0,
            isRainy: rain >= 1.0,
            isHeavyRain: rain >= 64.5,
          },
          update: {
            meanRainfall: rain,
            isRainy: rain >= 1.0,
            isHeavyRain: rain >= 64.5,
          },
        });
      }

      const count = await prisma.imergDailyRecord.count({
        where: { regionKey: testRegionKey, date: { in: testDates } },
      });
      assert.equal(count, 3, "Expected exactly 3 upserted test IMERG records");
    });

    it("should query IMERG records from DB in full mode with aggregations", async () => {
      const res = await getImergHistoricalDataFromDB({
        district: "Rajshahi",
        start: "20240101",
        end: "20240103",
        mode: "full",
        autoFetch: false,
      });

      assert.equal(res.source, "DATABASE");
      assert.equal(res.period.days, 3);
      assert.equal(res.summary.totalRainfall, 23.6);
      assert.equal(res.summary.rainyDays, 2);
      assert.equal(res.summary.dryDays, 1);
      assert.ok(res.daily && res.daily.length === 3);
      assert.ok(res.monthly && res.monthly.length >= 1);
      assert.ok(res.seasonal && res.seasonal.length >= 1);
    });

    it("should report IMERG dataset status accurately", async () => {
      const status = await getImergDatasetStatus({ district: "Rajshahi" });
      assert.equal(status.exists, true);
      assert.equal(status.regionKey, testRegionKey);
      assert.ok(status.storedDateRange);
      assert.ok(status.storedDateRange.totalRecords >= 3);
    });
  });

  describe("SMAP Database Persistence & Fast Query", () => {
    const testRegionKey = "bbox:24.00:24.75:88.20:89.00";

    it("should upsert test SMAP daily records without duplication", async () => {
      const testDates = ["20240101", "20240102", "20240103"];
      const surfaceVals = [0.22, 0.12, 0.38];
      const rootzoneVals = [0.28, 0.15, 0.35];

      for (let i = 0; i < testDates.length; i++) {
        const d = testDates[i];
        const surf = surfaceVals[i];
        const root = rootzoneVals[i];
        const observedAt = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);

        await prisma.smapDailyRecord.upsert({
          where: { regionKey_date: { regionKey: testRegionKey, date: d } },
          create: {
            regionKey: testRegionKey,
            date: d,
            observedAt,
            surfaceMoistureMean: surf,
            surfaceMoistureMin: surf * 0.9,
            surfaceMoistureMax: surf * 1.1,
            rootzoneMoistureMean: root,
            rootzoneMoistureMin: root * 0.9,
            rootzoneMoistureMax: root * 1.1,
            surfaceCondition: surf < 0.15 ? "DRY_STRESS" : surf <= 0.35 ? "OPTIMAL_MOISTURE" : "WATERLOGGED",
            rootzoneCondition: root < 0.18 ? "DEPLETED_RESERVE" : root <= 0.32 ? "ADEQUATE_RESERVE" : "SATURATED",
            validCells: 50,
          },
          update: {
            surfaceMoistureMean: surf,
            rootzoneMoistureMean: root,
          },
        });
      }

      const count = await prisma.smapDailyRecord.count({
        where: { regionKey: testRegionKey, date: { in: testDates } },
      });
      assert.equal(count, 3, "Expected exactly 3 upserted test SMAP records");
    });

    it("should query SMAP records from DB in full mode with conditions", async () => {
      const res = await SmapService.getSmapHistoricalDataFromDB({
        district: "Rajshahi",
        start: "20240101",
        end: "20240103",
        mode: "full",
        autoFetch: false,
      });

      assert.equal(res.source, "DATABASE");
      assert.equal(res.period.days, 3);
      assert.ok(res.summary.surface.mean !== null);
      assert.ok(res.summary.rootzone.mean !== null);
      assert.ok(res.daily && res.daily.length === 3);
      assert.ok(res.monthly && res.monthly.length >= 1);
      assert.ok(res.seasonal && res.seasonal.length >= 1);
      assert.equal(res.seasonal[0].dryStressDays, 1);
      assert.equal(res.seasonal[0].optimalMoistureDays, 1);
      assert.equal(res.seasonal[0].waterloggedDays, 1);
    });

    it("should report SMAP dataset status accurately", async () => {
      const status = await SmapService.getSmapDatasetStatus({ district: "Rajshahi" });
      assert.equal(status.exists, true);
      assert.equal(status.regionKey, testRegionKey);
      assert.ok(status.storedDateRange);
      assert.ok(status.storedDateRange.totalRecords >= 3);
    });
  });
});
