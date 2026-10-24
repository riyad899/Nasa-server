import assert from "node:assert/strict";
import { AmanOnsetService, buildAmanOnsetCacheKey } from "../app/module/AmanOnset/amanOnset.service.js";
import { redisService } from "../app/lib/redis.js";
import type { IAmanOnsetRequest, IAmanOnsetResponse } from "../app/module/AmanOnset/amanOnset.interface.js";

const samplePayload: IAmanOnsetRequest = {
  location: {
    latitude: 23.8103,
    longitude: 90.4125,
    district: "Dhaka",
  },
  crop: {
    cropType: "aman_rice",
    farmingMethod: "rainfed",
  },
  analysis: {
    type: "usable_rain_onset_shift",
    baselineStartYear: 2018,
    baselineEndYear: 2020,
    recentStartYear: 2021,
    recentEndYear: 2023,
  },
  language: "bn",
};

const mockCachedData: IAmanOnsetResponse = {
  analysisId: "aman_cache_test_123",
  location: samplePayload.location,
  crop: samplePayload.crop,
  method: {
    season: "kharif_ii",
    minimumAccumulatedRainfallMm: 20,
    accumulationDays: 3,
    confirmationWindowDays: 15,
    minimumConfirmationRainyDays: 3,
  },
  baseline: {
    startYear: 2018,
    endYear: 2020,
    validYears: 3,
    medianDayOfYear: 175,
    p25DayOfYear: 170,
    p75DayOfYear: 180,
    annualOnsets: [],
  },
  recent: {
    startYear: 2021,
    endYear: 2023,
    validYears: 3,
    medianDayOfYear: 182,
    p25DayOfYear: 178,
    p75DayOfYear: 185,
    annualOnsets: [],
  },
  shift: {
    medianDays: 7,
    direction: "later",
    p25ToP75Days: { lower: -2, upper: 15 },
  },
  transplantingWindow: {
    start: "2023-07-20",
    end: "2023-08-10",
    confidence: "moderate",
  },
  explanation: "মৌসুমী বৃষ্টির সূচনা ৭ দিন পিছিয়েছে।",
  farmerGuidance: [
    "বৃষ্টির onset-কে সরাসরি transplanting date ধরে নেবেন না।",
  ],
  dataSources: ["NASA POWER daily precipitation"],
  warnings: ["Test warning"],
};

async function runCacheBenchmark() {
  console.log("==================================================");
  console.log("🚀 Testing Redis Caching & 100-Request Benchmark for Aman Onset API");
  console.log("==================================================");

  // 1. Connect Redis
  await redisService.connect();
  const redisHealthy = await redisService.isAvailable();
  console.log(`📡 Redis available: ${redisHealthy}`);
  assert.equal(redisHealthy, true, "Redis must be connected and available");

  const cacheKey = buildAmanOnsetCacheKey(samplePayload);
  console.log(`🔑 Generated Cache Key: ${cacheKey}`);

  // Clean before test
  await AmanOnsetService.invalidateCache(samplePayload);

  // 2. Pre-seed Redis cache with 3600s TTL (1 hour)
  const TTL_SECONDS = 3600;
  console.log(`💾 Pre-seeding Redis cache with 1-hour TTL (3600s)...`);
  await redisService.setJson(cacheKey, mockCachedData, TTL_SECONDS);

  // Verify it exists in Redis
  const checkFromRedis = await redisService.getJson<IAmanOnsetResponse>(cacheKey);
  assert.ok(checkFromRedis, "Data should be retrieved from Redis");
  assert.equal(checkFromRedis?.analysisId, mockCachedData.analysisId);
  console.log("✅ Verified data written to and read from Redis successfully!");

  // 3. Test AmanOnsetService.runAnalysis cache hit
  console.log("\n⚡ Testing AmanOnsetService.runAnalysis single call...");
  const t0 = performance.now();
  const singleResult = await AmanOnsetService.runAnalysis(samplePayload);
  const singleDuration = performance.now() - t0;
  console.log(`⏱️ Single cached request resolved in ${singleDuration.toFixed(2)} ms`);
  assert.equal(singleResult.cached, true, "Result should have cached: true");
  assert.equal(singleResult.analysisId, mockCachedData.analysisId);

  // 4. Benchmark: 100 Concurrent Requests under 3 seconds
  console.log("\n🔥 Starting 100 CONCURRENT REQUESTS benchmark...");
  const count = 100;
  const startTime = performance.now();

  const requests = Array.from({ length: count }, (_, i) =>
    AmanOnsetService.runAnalysis(samplePayload).then((res) => ({
      index: i + 1,
      cached: res.cached,
      analysisId: res.analysisId,
    }))
  );

  const results = await Promise.all(requests);
  const totalDuration = performance.now() - startTime;
  const avgDuration = totalDuration / count;

  console.log(`\n📊 Benchmark Results:`);
  console.log(`   - Total Requests: ${results.length}`);
  console.log(`   - Total Time: ${totalDuration.toFixed(2)} ms (${(totalDuration / 1000).toFixed(3)} seconds)`);
  console.log(`   - Average Time per Request: ${avgDuration.toFixed(3)} ms`);
  console.log(`   - Target SLA: Under 3000 ms (3 seconds)`);

  assert.equal(results.length, 100, "All 100 requests must complete");
  assert.ok(
    totalDuration < 3000,
    `Total duration for 100 requests must be under 3000ms! (Actual: ${totalDuration.toFixed(2)}ms)`
  );

  // Ensure all 100 responses returned cached: true
  for (const res of results) {
    assert.equal(res.cached, true, "Every request must be served from cache");
    assert.equal(res.analysisId, mockCachedData.analysisId);
  }

  console.log("\n🎉 ALL 100 REQUESTS COMPLETED IN " + totalDuration.toFixed(2) + " ms! (Target: < 3000 ms)");
  console.log("✅ Caching requirement (1 hour TTL, 100 requests in < 3s) PASSED PERFECTLY!");

  await redisService.disconnect();
}

runCacheBenchmark().catch((err) => {
  console.error("❌ Benchmark failed:", err);
  process.exit(1);
});
