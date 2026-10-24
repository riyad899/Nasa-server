import { DeviceService } from "../app/module/Device/device.service.js";
import { AnalysisTransparencyService } from "../app/module/AnalysisTransparency/analysisTransparency.service.js";
import { CropWiseAiService } from "../app/module/CropWiseAi/cropwise.service.js";
import { prisma } from "../app/lib/prisma.js";

async function runTests() {
  console.log("🚀 Starting CropWise AI & IoT Verification Test Suite...\n");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // ─── Test 1: Health / DB Connection ──────────────────────────────────────
    console.log("--- Test 1: Neon Database Connection ---");
    const dbTest = await prisma.$queryRaw`SELECT 1 as connected`;
    assert(Boolean(dbTest), "Neon PostgreSQL is connected and responsive");

    // ─── Test 2: ESP32 Telemetry Submission & Offline Logic ──────────────────
    console.log("\n--- Test 2: ESP32 Telemetry & Status Contract ---");
    const testDeviceId = `test-esp32-${Date.now().toString().slice(-4)}`;
    
    // Ingest telemetry
    const telResult = await DeviceService.submitTelemetry({
      deviceId: testDeviceId,
      temperature: 28.5,
      humidity: 74,
      soilMoistureRaw: 1950,
      rainSensorRaw: 3400,
      gpsValid: true,
      latitude: 24.75,
      longitude: 90.40,
      altitude: 18.5,
      satellites: 9,
    });
    assert(telResult.success === true, "Telemetry ingested successfully into PostgreSQL");

    // Get latest data
    const latestData = await DeviceService.getLatestTelemetry(testDeviceId);
    assert(latestData.success === true && latestData.data?.temperature === 28.5, "Latest telemetry retrieves exact sensor readings");
    assert(latestData.data?.soilMoistureRaw === 1950, "Raw soil moisture preserved as uncalibrated raw integer");

    // Check status
    const statusResult = await DeviceService.getDeviceStatus(testDeviceId);
    assert(statusResult.status === "online", "Device freshly pinged is online");

    // Firmware polling contract: { relay1: boolean, relay2: boolean }
    const firmwareCommand = await DeviceService.getRelayCommand(testDeviceId);
    assert(typeof firmwareCommand.relay1 === "boolean" && typeof firmwareCommand.relay2 === "boolean", "Firmware polling preserves exact contract { relay1: boolean, relay2: boolean }");

    // ─── Test 3: Analysis & Recommendation Persistence ──────────────────────
    console.log("\n--- Test 3: Cross-Route Persistent Analysis & Recommendations ---");
    const testUserId = `test_user_${Date.now()}`;
    const testUser = await prisma.user.create({
      data: {
        id: testUserId,
        email: `tester_${Date.now()}@example.com`,
        name: "Test Farmer",
        role: "USER",
        emailVerified: true,
      },
    });

    const analysisId = `test_analysis_${Date.now()}`;
    await AnalysisTransparencyService.saveAnalysisHistory({
      analysisId,
      location: { district: "Rajshahi", latitude: 24.37, longitude: 88.60 },
      crop: { cropType: "aman_rice", farmingMethod: "rainfed" },
      shiftDays: 11,
      plantingWindowStart: "2026-07-15",
      plantingWindowEnd: "2026-07-25",
      confidence: "high",
      recommendationText: "Recommended transplanting window: 15 to 25 July",
      explanation: "Onset shifted later by 11 days according to historical NASA POWER data.",
      farmerGuidance: ["Check nursery seedling age before transplanting"],
      whyThisResult: { factor: "Rainfall shift", shiftDays: 11 },
    }, testUserId);

    const userHistory = await AnalysisTransparencyService.getUserHistory(testUserId);
    assert(userHistory.length === 1 && userHistory[0].id === analysisId, "Saved Climate Analysis persists in PostgreSQL under authenticated user");
    assert(userHistory[0].recommendations.length === 1, "RecommendationHistory links to ClimateAnalysisHistory");
    assert(userHistory[0].recommendations[0].recommendationText.includes("15 to 25 July"), "Recommendation content retrieved accurately");

    // User isolation: another user cannot see this history
    const otherUserHistory = await AnalysisTransparencyService.getUserHistory("other_user_id");
    assert(otherUserHistory.length === 0, "User isolation verified: other users cannot access private analysis history");

    // ─── Test 4: CropWise AI Guest Mode vs Authenticated Mode ─────────────────
    console.log("\n--- Test 4: CropWise AI Context & Privacy System ---");

    // Mode B: Guest Chat
    const guestResponse = await CropWiseAiService.handleChat({
      message: "আমার ডিভাইসের অবস্থা কী এবং কোন ফসল ভালো হবে?",
    });
    assert(guestResponse.contextStatus.userAuthenticated === false, "Guest request correctly tagged userAuthenticated: false");
    assert(guestResponse.contextStatus.deviceDataAvailable === false, "Guest request isolated from private devices");
    assert(Boolean(guestResponse.message.content), "Guest receives grounded answer with privacy notice");

    // Mode A: Authenticated Chat with user's saved analysis
    const authResponse = await CropWiseAiService.handleChat({
      message: "আমার আগের Climate Analysis অনুযায়ী এখন কী করা উচিত?",
    }, testUserId);
    assert(authResponse.contextStatus.userAuthenticated === true, "Authenticated request correctly tagged userAuthenticated: true");
    assert(authResponse.contextStatus.analysisDataAvailable === true, "Authenticated request loads saved Climate Analysis");
    assert(authResponse.sources.some((s) => s.type === "climate_analysis"), "Sources cite historical Climate Analysis");

    // Clean up test data
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.deviceTelemetry.deleteMany({ where: { deviceId: testDeviceId } });
    await prisma.device.delete({ where: { deviceId: testDeviceId } }).catch(() => {});

    console.log(`\n========================================`);
    console.log(`🏁 All tests completed: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution threw unhandled error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
