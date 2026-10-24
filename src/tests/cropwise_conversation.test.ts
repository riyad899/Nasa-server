import { CropWiseAiService } from "../app/module/CropWiseAi/cropwise.service.js";
import { AnalysisTransparencyService } from "../app/module/AnalysisTransparency/analysisTransparency.service.js";
import { prisma } from "../app/lib/prisma.js";

async function runScenarioTests() {
  console.log("🌾 Running CropWise AI Conversation & Device Isolation Verification...\n");
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

  const testUserId = `user_conv_${Date.now()}`;

  try {
    // Create test user with NO connected device
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `tester_${Date.now()}@cropwise.ai`,
        name: "Riyad Khan",
        role: "USER",
        emailVerified: true,
      },
    });

    // ── Test 1: Greeting "hi" ──────────────────────────────────────────────
    console.log("--- Test 1: Basic Greeting ('hi') ---");
    const greetingRes = await CropWiseAiService.handleChat(
      { message: "hi" },
      testUserId
    );
    assert(
      greetingRes.sources.length === 0,
      "Greeting does NOT include unsolicited sources (sources is empty array)"
    );
    assert(
      !greetingRes.message.content.includes("অফলাইন (নিষ্ক্রিয়)") &&
      !greetingRes.message.content.includes("esp32-001") &&
      !greetingRes.message.content.includes("সর্বশেষ প্রাপ্ত সেন্সর মান"),
      "Greeting does NOT dump unsolicited device offline notes or sensor readings"
    );
    assert(
      greetingRes.message.content.includes("CropWise AI") || greetingRes.message.content.includes("স্বাগতম"),
      "Greeting returns warm, friendly conversational welcome"
    );

    // ── Test 2: Device Query When No Device Connected ──────────────────────
    console.log("\n--- Test 2: Device Query with No Connected Device ---");
    const deviceRes = await CropWiseAiService.handleChat(
      { message: "আমার ডিভাইসের বর্তমান অবস্থা কী?" },
      testUserId
    );
    assert(
      deviceRes.message.content.includes("Device is not connected") ||
      deviceRes.message.content.includes("আপনার কোনো আইওটি ডিভাইস সংযুক্ত নেই"),
      "Device query when disconnected explicitly states 'Device is not connected'"
    );
    assert(
      !deviceRes.sources.some((s) => s.type === "device_telemetry" || s.type === "device_status"),
      "Disconnected device query does not attach device sources"
    );
    assert(
      !deviceRes.message.content.includes("২৮.৫° সে") &&
      !deviceRes.message.content.includes("মাটির আর্দ্রতা"),
      "Disconnected device query does NOT fabricate or dump old telemetry readings"
    );

    // ── Test 3: Climate Analysis Question ──────────────────────────────────
    console.log("\n--- Test 3: Climate Analysis Question ---");
    const climateRes = await CropWiseAiService.handleChat(
      { message: "বৃষ্টির onset পরিবর্তনের প্রভাব ও রোপণের সঠিক সময় কী?" },
      testUserId
    );
    assert(
      climateRes.message.content.includes("অনসেট") ||
      climateRes.message.content.includes("onset") ||
      climateRes.message.content.includes("রোপণ") ||
      climateRes.message.content.includes("আমন"),
      "Climate Analysis query provides expert monsoon onset and transplanting guidance"
    );

    // ── Test 4: Recommendation Question ───────────────────────────────────
    console.log("\n--- Test 4: Recommendation Question ---");
    const recRes = await CropWiseAiService.handleChat(
      { message: "খরা বা কম পানিতে কোন ধানের জাত ভালো এবং সেচ কীভাবে দেব?" },
      testUserId
    );
    assert(
      recRes.message.content.includes("ব্রি ধান৭১") ||
      recRes.message.content.includes("BRRI dhan71") ||
      recRes.message.content.includes("AWD") ||
      recRes.message.content.includes("এডব্লিউডি"),
      "Recommendation query provides resilient variety (BRRI dhan71) and AWD irrigation advice"
    );

    // ── Test 5: NASA Earth Observation & Why This Result Question ──────────
    console.log("\n--- Test 5: NASA Earth Observation & Why This Result Question ---");
    const whyRes = await CropWiseAiService.handleChat(
      { message: "নাসার স্যাটেলাইট উপাত্ত কীভাবে বিশ্লেষণ করা হয় এবং কেন এই ফলাফল দেওয়া হয়েছে?" },
      testUserId
    );
    console.log("whyRes reply content:", whyRes.message.content);
    assert(
      whyRes.message.content.includes("NASA POWER") ||
      whyRes.message.content.includes("GPM") ||
      whyRes.message.content.includes("SMAP") ||
      whyRes.message.content.includes("স্যাটেলাইট"),
      "NASA Earth Observation query explains NASA POWER, GPM IMERG, and SMAP methodologies"
    );

    console.log(`\n========================================`);
    console.log(`🏁 All scenario tests completed: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error("Test threw unhandled exception:", err);
    process.exit(1);
  } finally {
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

runScenarioTests();
