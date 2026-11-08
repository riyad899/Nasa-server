import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NasaPowerService } from "../app/module/NasaPower/nasaPower.service.js";
import { resolveDistrictCoordinates, buildRegionKey } from "../app/module/NasaPower/nasaPower.constants.js";
import { prisma } from "../app/lib/prisma.js";

describe("NASA POWER Historical 2-Year System Tests", () => {
  describe("Date Chunking & Leap-Year Handling", () => {
    it("should split a 2-year range across leap year into exact chunks <= 366 days", () => {
      // 2024 is a leap year (366 days), 2025 has 365 days. Total: 731 days.
      const chunks = NasaPowerService.splitDateRangeIntoChunks("20240101", "20251231", 366);
      assert.equal(chunks.length, 2);

      assert.equal(chunks[0].chunkIndex, 0);
      assert.equal(chunks[0].start, "20240101");
      assert.equal(chunks[0].end, "20241231");
      assert.equal(chunks[0].days, 366);

      assert.equal(chunks[1].chunkIndex, 1);
      assert.equal(chunks[1].start, "20250101");
      assert.equal(chunks[1].end, "20251231");
      assert.equal(chunks[1].days, 365);

      assert.equal(chunks[0].days + chunks[1].days, 731);
    });

    it("should handle a full leap year as a single 366-day chunk", () => {
      const chunks = NasaPowerService.splitDateRangeIntoChunks("20240101", "20241231", 366);
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].days, 366);
      assert.equal(chunks[0].start, "20240101");
      assert.equal(chunks[0].end, "20241231");
    });

    it("should handle short date ranges without extra chunks", () => {
      const chunks = NasaPowerService.splitDateRangeIntoChunks("20240101", "20240105", 366);
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].days, 5);
      assert.equal(chunks[0].start, "20240101");
      assert.equal(chunks[0].end, "20240105");
    });

    it("should ensure no gaps or overlaps between chunk boundaries", () => {
      const chunks = NasaPowerService.splitDateRangeIntoChunks("20230601", "20250601", 366);
      for (let i = 0; i < chunks.length - 1; i++) {
        const curEnd = new Date(
          Date.UTC(
            parseInt(chunks[i].end.slice(0, 4)),
            parseInt(chunks[i].end.slice(4, 6)) - 1,
            parseInt(chunks[i].end.slice(6, 8))
          )
        );
        const nextStart = new Date(
          Date.UTC(
            parseInt(chunks[i + 1].start.slice(0, 4)),
            parseInt(chunks[i + 1].start.slice(4, 6)) - 1,
            parseInt(chunks[i + 1].start.slice(6, 8))
          )
        );
        const diffMs = nextStart.getTime() - curEnd.getTime();
        assert.equal(diffMs, 24 * 60 * 60 * 1000, `Gap detected between chunk ${i} and ${i + 1}`);
      }
    });
  });

  describe("District Coordinate & Bounding Box Resolution", () => {
    it("should resolve district coordinates case-insensitively", () => {
      const rajshahi = resolveDistrictCoordinates("rajshahi");
      assert.ok(rajshahi);
      assert.equal(rajshahi?.name, "Rajshahi");
      assert.equal(rajshahi?.latitude, 24.37);
      assert.equal(rajshahi?.longitude, 88.6);
      assert.ok(rajshahi?.bbox.latitudeMin < rajshahi?.bbox.latitudeMax);
    });

    it("should resolve Mymensingh, Dhaka, Rangpur and other districts", () => {
      const mymensingh = resolveDistrictCoordinates("Mymensingh");
      const dhaka = resolveDistrictCoordinates("Dhaka");
      const rangpur = resolveDistrictCoordinates("Rangpur");
      assert.ok(mymensingh);
      assert.ok(dhaka);
      assert.ok(rangpur);
    });

    it("should build deterministic region keys", () => {
      const key1 = buildRegionKey(20.34, 26.63, 88.01, 92.68);
      const key2 = buildRegionKey(20.340001, 26.630002, 88.01, 92.68);
      assert.equal(key1, "bbox:20.34:26.63:88.01:92.68");
      assert.equal(key1, key2);
    });
  });

  describe("Database Persistence & Fast Aggregation Queries", () => {
    const testRegionKey = "bbox:24.00:24.75:88.20:89.00";
    const testDates = ["20240101", "20240102", "20240103"];

    it("should upsert test records without duplication", async () => {
      for (const d of testDates) {
        await prisma.nasaPowerDailyRecord.upsert({
          where: { regionKey_date: { regionKey: testRegionKey, date: d } },
          update: {
            temperatureMean: 18.5,
            temperatureMin: 12.0,
            temperatureMax: 23.0,
            rainfallMean: d === "20240102" ? 5.2 : 0.0,
            rainfallMin: 0,
            rainfallMax: d === "20240102" ? 10.0 : 0.0,
            solarRadiationMean: 14.5,
          },
          create: {
            regionKey: testRegionKey,
            date: d,
            observedAt: new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`),
            temperatureMean: 18.5,
            temperatureMin: 12.0,
            temperatureMax: 23.0,
            rainfallMean: d === "20240102" ? 5.2 : 0.0,
            rainfallMin: 0,
            rainfallMax: d === "20240102" ? 10.0 : 0.0,
            solarRadiationMean: 14.5,
          },
        });
      }

      const count = await prisma.nasaPowerDailyRecord.count({
        where: { regionKey: testRegionKey, date: { in: testDates } },
      });
      assert.equal(count, 3);
    });

    it("should query saved data with fast summary mode", async () => {
      const res = await NasaPowerService.getRegionalHistoricalDataFromDB({
        latitudeMin: 24.0,
        latitudeMax: 24.75,
        longitudeMin: 88.2,
        longitudeMax: 89.0,
        start: "20240101",
        end: "20240103",
        mode: "summary",
      });

      assert.equal(res.source, "DATABASE");
      assert.equal(res.period.days, 3);
      assert.equal(res.coverage.availableDays, 3);
      assert.equal(res.coverage.missingDays, 0);
      assert.equal(res.coverage.coveragePercentage, 100);
      assert.equal(res.summary.averageTemperature, 18.5);
      assert.equal(res.summary.totalRainfall, 5.2);
      assert.equal(res.summary.rainyDays, 1);
      assert.equal(res.summary.dryDays, 2);
    });

    it("should aggregate data by month and season in full mode", async () => {
      const res = await NasaPowerService.getRegionalHistoricalDataFromDB({
        latitudeMin: 24.0,
        latitudeMax: 24.75,
        longitudeMin: 88.2,
        longitudeMax: 89.0,
        start: "20240101",
        end: "20240103",
        mode: "full",
      });

      assert.ok(res.daily && res.daily.length === 3);
      assert.ok(res.monthly && res.monthly.length === 1);
      assert.equal(res.monthly[0].month, "2024-01");
      assert.equal(res.monthly[0].rainyDays, 1);

      assert.ok(res.seasonal && res.seasonal.length === 1);
      assert.equal(res.seasonal[0].season, "Winter (Dec-Feb)");
      assert.equal(res.seasonal[0].year, 2024);
    });

    it("should report dataset status accurately", async () => {
      const statusRes = await NasaPowerService.getHistoricalDatasetStatus({
        latitudeMin: 24.0,
        latitudeMax: 24.75,
        longitudeMin: 88.2,
        longitudeMax: 89.0,
        start: "20240101",
        end: "20240103",
      });

      assert.equal(statusRes.exists, true);
      assert.equal(statusRes.regionKey, testRegionKey);
      assert.ok(statusRes.requestedRangeCoverage?.isComplete);
    });
  });
});
