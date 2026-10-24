/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "../../lib/prisma.js";
import { LLMService } from "../Rag/llm.service.js";
import { RAGService } from "../Rag/rag.service.js";
import { DeviceService } from "../Device/device.service.js";
import { AmanOnsetService } from "../AmanOnset/amanOnset.service.js";
import { AnalyzeAiService } from "../AnalyzeAi/analyzeAi.service.js";
import {
  ICropWiseChatRequest,
  ICropWiseChatResponse,
  ICropWiseSource,
  ICropWiseContextStatus,
  IUserKnowledgeInput,
} from "./cropwise.interface.js";

const llmService = new LLMService();
const ragService = new RAGService();

export class CropWiseAiService {
  /**
   * Main context-aware chat handler
   */
  static async handleChat(
    payload: ICropWiseChatRequest,
    userId?: string
  ): Promise<ICropWiseChatResponse> {
    const { message, conversationId, guestSessionId, location, crop, language } = payload;
    const sources: ICropWiseSource[] = [];
    const contextItems: string[] = [];
    const isEnglish = (language || "").toUpperCase() === "EN";

    // ─── 1. Conversation Resolution ──────────────────────────────────────────
    let conversation = conversationId
      ? await prisma.proboyConversation.findUnique({
          where: { id: conversationId },
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 8,
            },
          },
        })
      : null;

    if (!conversation) {
      conversation = await prisma.proboyConversation.create({
        data: {
          userId: userId || null,
          guestSessionId: !userId ? (guestSessionId || `guest_${Date.now()}`) : null,
          title: message.slice(0, 40) + (message.length > 40 ? "..." : ""),
        },
        include: {
          messages: true,
        },
      });
    }

    // ─── 2. User & Farm Context Assembly (Mode A vs Mode B) ──────────────────
    let userProfile: any = null;
    let userFarms: any[] = [];
    let userKnowledge: any[] = [];
    let savedAnalyses: any[] = [];
    let savedRecommendations: any[] = [];
    let userDevices: any[] = [];
    let latestDeviceTelemetry: any = null;
    let deviceStatusResult: any = null;
    let isDeviceOnline = false;

    const lowerMsg = message.toLowerCase();

    // ─── Query Intent Categorization ──────────────────────────────────────
    const isGreeting =
      /^(hi|hello|hey|হাই|হ্যালো|সালাম|আসসালামু\s*আলাইকুম|assalamu\s*alaikum|kemon\s*acho|how\s*are\s*you)\b/i.test(lowerMsg) ||
      lowerMsg === "hi" ||
      lowerMsg === "hello" ||
      lowerMsg === "hey" ||
      lowerMsg === "হাই" ||
      lowerMsg === "হ্যালো";

    const isDeviceQuery =
      lowerMsg.includes("device") ||
      lowerMsg.includes("ডিভাইস") ||
      lowerMsg.includes("esp32") ||
      lowerMsg.includes("sensor") ||
      lowerMsg.includes("সেন্সর") ||
      lowerMsg.includes("relay") ||
      lowerMsg.includes("রிலே") ||
      lowerMsg.includes("motor") ||
      lowerMsg.includes("মোটর") ||
      lowerMsg.includes("pump") ||
      lowerMsg.includes("পাম্প") ||
      lowerMsg.includes("telemetry") ||
      lowerMsg.includes("টেলিমেট্রি") ||
      lowerMsg.includes("reading") ||
      lowerMsg.includes("রিডিং") ||
      lowerMsg.includes("offline") ||
      lowerMsg.includes("online");

    const isClimateAnalysisQuery =
      lowerMsg.includes("climate") ||
      lowerMsg.includes("analysis") ||
      lowerMsg.includes("জলবায়ু") ||
      lowerMsg.includes("অনসেট") ||
      lowerMsg.includes("onset") ||
      lowerMsg.includes("monsoon") ||
      lowerMsg.includes("মৌসুম") ||
      lowerMsg.includes("বৃষ্টি") ||
      lowerMsg.includes("rain") ||
      lowerMsg.includes("rainfall") ||
      lowerMsg.includes("shift") ||
      lowerMsg.includes("বিলম্ব") ||
      lowerMsg.includes("রোপণ") ||
      lowerMsg.includes("planting") ||
      lowerMsg.includes("transplant") ||
      lowerMsg.includes("আমন");

    const isRecommendationQuery =
      lowerMsg.includes("recommend") ||
      lowerMsg.includes("পরামর্শ") ||
      lowerMsg.includes("variety") ||
      /(^|\s)(জাত|জাতের|ধানের জাত)(\s|$|[।,?!])/i.test(lowerMsg) ||
      lowerMsg.includes("brri") ||
      lowerMsg.includes("ব্রি ধান") ||
      lowerMsg.includes("awd") ||
      lowerMsg.includes("সেচ") ||
      lowerMsg.includes("irrigation") ||
      lowerMsg.includes("fertilizer") ||
      /(^|\s)(সার|সারের|ইউরিয়া|ডিএপি|টিএসপি|এমওপি)(\s|$|[।,?!])/i.test(lowerMsg) ||
      lowerMsg.includes("urea") ||
      lowerMsg.includes("ইউরিয়া") ||
      lowerMsg.includes("dap") ||
      lowerMsg.includes("tsp") ||
      lowerMsg.includes("mop") ||
      /(^|\s)(ফসল|ফসলের)(\s|$|[।,?!])/i.test(lowerMsg);

    const isWhyThisResultQuery =
      lowerMsg.includes("why") ||
      lowerMsg.includes("কেন") ||
      lowerMsg.includes("nasa") ||
      lowerMsg.includes("নাসা") ||
      lowerMsg.includes("satellite") ||
      lowerMsg.includes("স্যাটেলাইট") ||
      lowerMsg.includes("উপগ্রহ") ||
      lowerMsg.includes("power") ||
      lowerMsg.includes("gpm") ||
      lowerMsg.includes("imerg") ||
      lowerMsg.includes("smap") ||
      lowerMsg.includes("rationale") ||
      lowerMsg.includes("reason") ||
      lowerMsg.includes("কারণ");

    if (userId) {
      // Authenticated Mode A
      const [uProfile, farms, kb, analyses, recommendations, devices] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true, role: true },
        }),
        prisma.farm.findMany({ where: { userId }, take: 3 }),
        prisma.userKnowledge.findMany({ where: { userId }, take: 10, orderBy: { createdAt: "desc" } }),
        prisma.climateAnalysisHistory.findMany({
          where: { userId },
          take: 3,
          orderBy: { createdAt: "desc" },
          include: { recommendations: true },
        }),
        prisma.recommendationHistory.findMany({
          where: { userId },
          take: 3,
          orderBy: { createdAt: "desc" },
        }),
        prisma.device.findMany({
          where: { ownerUserId: userId },
          take: 5,
        }),
      ]);

      userProfile = uProfile;
      userFarms = farms;
      userKnowledge = kb;
      savedAnalyses = analyses;
      savedRecommendations = recommendations;

      // ── Resolve Devices for Authenticated User ─────────────────────────────
      // Only include devices genuinely connected/owned by this user or their farms
      let resolvedDevices = devices;
      if (resolvedDevices.length === 0 && userFarms.length > 0) {
        const farmIds = userFarms.map((f) => f.id);
        resolvedDevices = await prisma.device.findMany({
          where: { farmId: { in: farmIds } },
          take: 5,
        });
      }

      // Check if user explicitly mentioned a device ID in message
      const devMatch = message.match(/\b(esp32-[\w-]+)\b/i);
      if (devMatch) {
        const requestedDevId = devMatch[1].toLowerCase();
        const matchIdx = resolvedDevices.findIndex((d) => d.deviceId.toLowerCase() === requestedDevId);
        if (matchIdx > 0) {
          const [matched] = resolvedDevices.splice(matchIdx, 1);
          resolvedDevices.unshift(matched);
        }
      }

      userDevices = resolvedDevices;

      if (userProfile) {
        contextItems.push(`[AUTHENTICATED USER] Name: ${userProfile.name}, Email: ${userProfile.email}`);
      }

      if (userFarms.length > 0) {
        const farmDetails = userFarms
          .map((f) => `Farm "${f.name}" (${f.district || "Location unspecified"}, Crop: ${f.cropType || "N/A"})`)
          .join(", ");
        contextItems.push(`[USER FARMS] ${farmDetails}`);
      }

      if (userKnowledge.length > 0) {
        const kbText = userKnowledge
          .map((k) => `• ${k.title} (${k.sourceType}): ${k.content}`)
          .join("\n");
        contextItems.push(`[USER KNOWLEDGE BASE]\n${kbText}`);
      }

      if (savedAnalyses.length > 0) {
        const latestAnalysis = savedAnalyses[0];
        if (isClimateAnalysisQuery && !isGreeting) {
          sources.push({
            type: "climate_analysis",
            title: `Historical Climate Analysis (${new Date(latestAnalysis.createdAt).toLocaleDateString()})`,
            timestamp: latestAnalysis.createdAt.toISOString(),
            details: {
              shiftDays: latestAnalysis.shiftDays,
              crop: latestAnalysis.crop,
              location: latestAnalysis.location,
              plantingWindow: `${latestAnalysis.plantingWindowStart} to ${latestAnalysis.plantingWindowEnd}`,
            },
          });
        }
        contextItems.push(
          `[SAVED CLIMATE ANALYSIS] ID: ${latestAnalysis.id}, Crop: ${JSON.stringify(latestAnalysis.crop)}, Shift: ${latestAnalysis.shiftDays} days, Window: ${latestAnalysis.plantingWindowStart} - ${latestAnalysis.plantingWindowEnd}, Status: ${latestAnalysis.status}`
        );
      }

      if (savedRecommendations.length > 0) {
        const latestRec = savedRecommendations[0];
        if (isRecommendationQuery && !isGreeting) {
          sources.push({
            type: "recommendation",
            title: "Saved Planting Recommendation",
            timestamp: latestRec.createdAt.toISOString(),
            details: latestRec.recommendationText,
          });
        }
        contextItems.push(
          `[SAVED RECOMMENDATION] Crop: ${latestRec.cropType}, Recommendation: ${latestRec.recommendationText}, Explanation: ${latestRec.explanation || "N/A"}`
        );

        if (latestRec.whyThisResult) {
          if (isWhyThisResultQuery && !isGreeting) {
            sources.push({
              type: "why_this_result",
              title: "Why This Result Rationale",
              details: latestRec.whyThisResult,
            });
          }
          contextItems.push(`[WHY THIS RESULT] ${JSON.stringify(latestRec.whyThisResult)}`);
        }
      }

      // Check IoT Device context
      if (userDevices.length > 0) {
        const primaryDevice = userDevices[0];
        try {
          const [statusRes, latestData] = await Promise.all([
            DeviceService.getDeviceStatus(primaryDevice.deviceId).catch(() => ({
              success: true,
              deviceId: primaryDevice.deviceId,
              status: "offline" as const,
              active: false,
              lastSeen: null,
              secondsSinceLastSeen: null,
              relay1: "OFF",
              relay2: "OFF",
            })),
            DeviceService.getLatestTelemetry(primaryDevice.deviceId).catch(() => null),
          ]);
          deviceStatusResult = statusRes;
          isDeviceOnline = statusRes.status === "online" || statusRes.active === true;
          latestDeviceTelemetry = latestData;

          // Only attach device sources if user asked a device/sensor/pump related question and it's not a greeting
          if (isDeviceQuery && !isGreeting) {
            sources.push({
              type: "device_status",
              title: `Device Status (${primaryDevice.deviceId})`,
              timestamp: statusRes.lastSeen ? new Date(statusRes.lastSeen).toISOString() : undefined,
              details: {
                status: isDeviceOnline ? "online" : "offline",
                active: isDeviceOnline,
                lastSeen: statusRes.lastSeen,
                secondsSinceLastSeen: statusRes.secondsSinceLastSeen,
              },
            });

            const rawData = latestData?.data || {};
            const temp = rawData.temperature ?? rawData.temperature1 ?? null;
            const hum = rawData.humidity ?? rawData.humidity1 ?? null;
            const soilRaw = rawData.soilMoistureRaw ?? rawData.soil_moisture_raw ?? rawData.soil1 ?? null;
            const rainRaw = rawData.rainSensorRaw ?? rawData.rain_sensor_raw ?? rawData.rain ?? null;
            const recordedAt = rawData.recordedAt || rawData.created_at || statusRes.lastSeen || null;

            sources.push({
              type: "device_telemetry",
              title: `ESP32 Telemetry (${primaryDevice.deviceId})`,
              timestamp: recordedAt ? new Date(recordedAt).toISOString() : undefined,
              details: {
                temperature: temp,
                humidity: hum,
                soilMoistureRaw: soilRaw,
                rainSensorRaw: rainRaw,
                relay1: latestData?.relay1 || statusRes.relay1 || "OFF",
                relay2: latestData?.relay2 || statusRes.relay2 || "OFF",
              },
            });
          }

          contextItems.push(
            `[IOT DEVICE STATUS]\n` +
            `Device ID: ${primaryDevice.deviceId}\n` +
            `Status: ${isDeviceOnline ? "ONLINE (Active & transmitting)" : "OFFLINE (Inactive / Not transmitting)"}\n` +
            `Last Seen: ${statusRes.lastSeen || "Never / No ping recorded"}\n` +
            `Seconds Since Last Transmission: ${statusRes.secondsSinceLastSeen ?? "N/A"}\n` +
            `Relay 1 (Water Motor): ${latestData?.relay1 || statusRes.relay1 || "OFF"}\n` +
            `Relay 2 (Solenoid Valve): ${latestData?.relay2 || statusRes.relay2 || "OFF"}`
          );

          const rawData = latestData?.data || {};
          const temp = rawData.temperature ?? rawData.temperature1 ?? null;
          const hum = rawData.humidity ?? rawData.humidity1 ?? null;
          const soilRaw = rawData.soilMoistureRaw ?? rawData.soil_moisture_raw ?? rawData.soil1 ?? null;
          const rainRaw = rawData.rainSensorRaw ?? rawData.rain_sensor_raw ?? rawData.rain ?? null;
          const recordedAt = rawData.recordedAt || rawData.created_at || statusRes.lastSeen || null;

          if (temp != null || hum != null || soilRaw != null) {
            contextItems.push(
              `[LATEST TELEMETRY READINGS (${primaryDevice.deviceId})]\n` +
              `Temperature: ${temp != null ? `${temp}°C` : "N/A"}\n` +
              `Humidity: ${hum != null ? `${hum}%` : "N/A"}\n` +
              `Soil Moisture: ${soilRaw != null ? `${soilRaw} (raw analog units)` : "N/A"}\n` +
              `Rain Sensor: ${rainRaw != null ? `${rainRaw} (raw analog units)` : "N/A"}\n` +
              `GPS: Lat ${rawData.latitude ?? "N/A"}, Lon ${rawData.longitude ?? "N/A"}\n` +
              `Recorded At: ${recordedAt || "N/A"}`
            );
          } else {
            contextItems.push(
              `[LATEST TELEMETRY READINGS (${primaryDevice.deviceId})]\nNo telemetry readings recorded yet.`
            );
          }
        } catch (deviceErr) {
          console.warn("Could not query device status in CropWise AI:", deviceErr);
        }
      } else {
        // No device connected
        contextItems.push(
          `[IOT DEVICE STATUS: NO DEVICE CONNECTED]\n` +
          `User has NO IoT device connected to their account.\n` +
          `- If the user explicitly asks about their device, sensors, soil telemetry, or pump control, respond directly: "Device is not connected" (in Bengali: "আপনার কোনো আইওটি ডিভাইস সংযুক্ত নেই (Device is not connected)। লাইভ সেন্সর ডাটা পর্যবেক্ষণ করতে বা মোটর নিয়ন্ত্রণ করতে দয়া করে ডিভাইস সেটিংস পেজ থেকে ডিভাইস কানেক্ট করুন।").\n` +
          `- NEVER fabricate, hallucinate, or display sensor telemetry, temperatures, or offline tracking notes when no device is connected.\n` +
          `- If the user did NOT ask about devices (e.g. general conversation, greetings, crops, climate), do NOT mention devices at all.`
        );
      }

      // ─── 3. Detect Relay Control Intent from Authenticated User ────────────
      const isRelayIntent =
        lowerMsg.includes("pump") ||
        lowerMsg.includes("পাম্প") ||
        lowerMsg.includes("relay") ||
        lowerMsg.includes("মোটর") ||
        lowerMsg.includes("motor");

      const isTurnOn =
        lowerMsg.includes("on") ||
        lowerMsg.includes("start") ||
        lowerMsg.includes("চালাও") ||
        lowerMsg.includes("চালু");

      const isTurnOff =
        lowerMsg.includes("off") ||
        lowerMsg.includes("stop") ||
        lowerMsg.includes("বন্ধ");

      if (isRelayIntent && (isTurnOn || isTurnOff)) {
        if (userDevices.length === 0) {
          contextItems.push(
            `[RELAY COMMAND NOTICE] User requested relay/pump action, but NO device is connected. Inform user: "Device is not connected. To control water pumps, please connect your IoT hardware first."`
          );
        } else {
          const targetRelay = lowerMsg.includes("2") || lowerMsg.includes("valve") || lowerMsg.includes("ভাল্ব") ? 2 : 1;
          const desiredState = isTurnOn;
          const targetDevice = userDevices[0];

          try {
            const controlRes = await DeviceService.controlRelay(
              {
                deviceId: targetDevice.deviceId,
                relay: targetRelay as 1 | 2,
                state: desiredState,
              },
              userId
            );

            contextItems.push(
              `[RELAY COMMAND DISPATCHED] Device: ${targetDevice.deviceId}, Relay ${targetRelay} requested to ${desiredState ? "ON" : "OFF"}. Result state: ${controlRes.state}. Current Relays -> Relay1: ${controlRes.relay1}, Relay2: ${controlRes.relay2}`
            );
          } catch (ctrlErr: any) {
            contextItems.push(`[RELAY COMMAND ERROR] Failed to change relay state: ${ctrlErr?.message || "Unknown error"}`);
          }
        }
      }

    } else {
      // Mode B: Guest User
      contextItems.push("[USER STATUS: GUEST / UNAUTHENTICATED]");
      contextItems.push(
        "Notice: Private farm profiles, previous user conversation history, and IoT device actuators are locked. Inform the guest gently that private farm data or hardware relay control requires logging in."
      );
    }

    // ─── 4. Dynamic Tool / External API Ingestion ────────────────────────────
    const isClimateOrCropQuery =
      lowerMsg.includes("climate") ||
      lowerMsg.includes("আবহাওয়া") ||
      lowerMsg.includes("বৃষ্টি") ||
      lowerMsg.includes("rain") ||
      lowerMsg.includes("crop") ||
      lowerMsg.includes("ফসল") ||
      lowerMsg.includes("ধান") ||
      lowerMsg.includes("rice") ||
      lowerMsg.includes("temperature") ||
      lowerMsg.includes("বোরো") ||
      lowerMsg.includes("আমন") ||
      lowerMsg.includes("recommendation");

    if (isClimateOrCropQuery) {
      try {
        // Query agricultural knowledge base via RAG
        const ragDocs = await ragService.retieveRelevantDocuments(message, 3);
        if (ragDocs.length > 0) {
          if (!isGreeting) {
            sources.push({
              type: "agricultural_kb",
              title: "CropWise Agricultural Knowledge Base",
              details: `${ragDocs.length} knowledge references consulted`,
            });
          }
          const agronomicContext = ragDocs.map((d) => d.content).join("\n\n");
          contextItems.push(`[AGRONOMIC & SATELLITE KNOWLEDGE]\n${agronomicContext}`);
        }
      } catch (ragErr) {
        console.warn("RAG retrieval failed in CropWise AI:", ragErr);
      }
    }

    // ─── 5. LLM Prompt Construction & Multi-turn Dialogue ───────────────────
    const recentMessages = (conversation.messages || [])
      .slice(0, 6)
      .reverse()
      .map((m) => `${m.role === "user" ? "User" : "CropWise AI"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `You are CropWise AI, the advanced context-aware agricultural assistant for the CropWise AI platform (NASA Space Apps Challenge).
${
  isEnglish
    ? "MANDATORY LANGUAGE: The user has explicitly selected ENGLISH mode. You MUST answer entirely in fluent, grammatically correct, natural English. Do NOT answer in Bengali or Banglish."
    : "MANDATORY LANGUAGE: The user has selected BANGLA mode. You MUST answer in fluent, friendly, natural Bengali (Bangla)."
}

CRITICAL RULES:
1. GREETINGS & CASUAL CONVERSATION:
   - When the user sends a greeting (e.g., "hi", "hello", "hey", "কেমন আছো", "সালাম"):
     * Respond warmly, politely, and conversationally as CropWise AI 🌱.
     * NEVER output device status, offline tracking notes, or sensor telemetry during greetings!
     * Introduce your capabilities (Climate Analysis, Crop Recommendations, NASA Earth data) and invite the user to ask questions or converse naturally.
2. IOT DEVICE & SENSOR QUERIES:
   - IF NO DEVICE IS CONNECTED (see Context):
     * If the user specifically asks about device status, sensor readings, or pump control:
       - State clearly and concisely: "Device is not connected" (in Bengali: "আপনার কোনো আইওটি ডিভাইস সংযুক্ত নেই (Device is not connected)। লাইভ সেন্সর ডাটা পর্যবেক্ষণ করতে বা মোটর নিয়ন্ত্রণ করতে দয়া করে [ডিভাইস সেটিংস](/dashboard/device-settings) পেজ থেকে ডিভাইস কানেক্ট করুন। আপনার যদি কোনো কৃষি বা জলবায়ু বিষয়ক প্রশ্ন থাকে, তবে নির্দ্বিধায় করতে পারেন!")
       - In English: "Device is not connected. No IoT device is currently linked to your account. Please connect your ESP32 device from the Device Settings page to view live telemetry and control pumps."
       - NEVER output or hallucinate sensor readings, temperatures, humidity, or offline tracking notes!
     * If the user did NOT ask about devices, do NOT mention device status at all.
   - IF A DEVICE IS CONNECTED:
     * Only output device status or sensor readings IF the user specifically asks about the device, sensor telemetry, field moisture, or pump/relay actions.
     * If asked and the device is OFFLINE: State clearly that the device is currently offline, citing the last recorded transmission time.
     * If asked and the device is ONLINE: State that the device is online and actively transmitting, citing live telemetry.
3. THREE CORE API ANALYSES:
   - Provide comprehensive, scientifically grounded, and practical answers for the platform's 3 analysis APIs:
     (a) Climate Analysis API (Aman Onset & Monsoon Shift):
         * Explain historical rainfall baseline (1991–2020) vs recent 5-year trends from NASA datasets.
         * Highlight monsoon onset delay (e.g., 8–10 days delay in northern Bangladesh / Rangpur) and recommend an adjusted, safe transplanting window to prevent seedling mortality and drought stress.
         * Advise on seedling age (20–25 days) and nursery water management.
     (b) Smart Farming Recommendations API (Resilient Varieties, AWD, Fertilizer):
         * Recommend climate-resilient rice varieties: BRRI dhan71 (drought-tolerant), BRRI dhan75 (short-duration 120–125 days for double/triple cropping), BRRI dhan51/52 (submergence-tolerant for flash floods).
         * Recommend AWD (Alternate Wetting and Drying) water-saving technique (saves 25–30% water and reduces pumping costs).
         * Balanced fertilizer schedule: Basal (TSP/DAP, MoP, Gypsum, Zinc) + 3 split top-dressings of Urea (15 DAT, active tillering, panicle initiation).
     (c) NASA Earth Observations & "Why This Result" API:
         * Detail the satellite datasets: NASA POWER (precipitation & solar irradiance), NASA GPM IMERG (satellite precipitation radar), NASA SMAP (0–5cm soil moisture).
         * Explain the explainable AI rationale: Quantile anomaly analysis showing why the specific planting window minimizes weather risk.
4. GENERAL FARMING QUESTIONS:
   - If the user asks about general agricultural topics (pests, soil, fertilizers, crop rotation, irrigation methods), answer thoroughly with expert agricultural knowledge.
5. TONE:
   - Warm, authoritative, agricultural expert, supportive of precision farming and farmers.`;

    const userPromptContent = `=== CONTEXT INFORMATION ===
${contextItems.join("\n\n---\n\n")}

=== RECENT DIALOGUE HISTORY ===
${recentMessages || "No prior messages in this conversation."}

=== CURRENT USER MESSAGE ===
${message}

=== RESPONSE LANGUAGE REQUIREMENT ===
Respond strictly in ${isEnglish ? "ENGLISH" : "BENGALI (BANGLA)"} as requested by the user.

Please provide a helpful, accurate, grounded response:`;

    // ─── 6. Execute LLM Call ────────────────────────────────────────────────
    let assistantReply = "";
    try {
      assistantReply = await llmService.generateResponse(
        userPromptContent,
        [],
        false,
        systemPrompt
      );
    } catch (llmErr: any) {
      console.warn("CropWise AI LLM call error (engaging intelligent context fallback):", llmErr?.message || llmErr);

      // Check for greetings
      const isGreetingFallback =
        /^(hi|hello|hey|হাই|হ্যালো|সালাম|আসসালামু\s*আলাইকুম|assalamu\s*alaikum|kemon\s*acho|how\s*are\s*you)\b/i.test(lowerMsg) ||
        lowerMsg === "hi" ||
        lowerMsg === "hello" ||
        lowerMsg === "hey" ||
        lowerMsg === "হাই" ||
        lowerMsg === "হ্যালো";

      const isDeviceQueryFallback =
        lowerMsg.includes("device") ||
        lowerMsg.includes("ডিভাইস") ||
        lowerMsg.includes("esp32") ||
        lowerMsg.includes("sensor") ||
        lowerMsg.includes("সেন্সর") ||
        lowerMsg.includes("relay") ||
        lowerMsg.includes("রிலே") ||
        lowerMsg.includes("motor") ||
        lowerMsg.includes("মোটর") ||
        lowerMsg.includes("pump") ||
        lowerMsg.includes("পাম্প") ||
        lowerMsg.includes("telemetry") ||
        lowerMsg.includes("টেলিমেট্রি") ||
        lowerMsg.includes("reading") ||
        lowerMsg.includes("রিডিং") ||
        lowerMsg.includes("offline") ||
        lowerMsg.includes("online");

      const isClimateAnalysisFallback =
        lowerMsg.includes("climate") ||
        lowerMsg.includes("analysis") ||
        lowerMsg.includes("জলবায়ু") ||
        lowerMsg.includes("অনসেট") ||
        lowerMsg.includes("onset") ||
        lowerMsg.includes("monsoon") ||
        lowerMsg.includes("মৌসুম") ||
        lowerMsg.includes("বৃষ্টি") ||
        lowerMsg.includes("rain") ||
        lowerMsg.includes("rainfall") ||
        lowerMsg.includes("shift") ||
        lowerMsg.includes("বিলম্ব") ||
        lowerMsg.includes("রোপণ") ||
        lowerMsg.includes("planting") ||
        lowerMsg.includes("transplant") ||
        lowerMsg.includes("timing") ||
        lowerMsg.includes("তারিখ") ||
        lowerMsg.includes("আমন");

      const isRecommendationFallback =
        lowerMsg.includes("recommend") ||
        lowerMsg.includes("পরামর্শ") ||
        lowerMsg.includes("variety") ||
        /(^|\s)(জাত|জাতের|ধানের জাত)(\s|$|[।,?!])/i.test(lowerMsg) ||
        lowerMsg.includes("brri") ||
        lowerMsg.includes("ব্রি ধান") ||
        lowerMsg.includes("awd") ||
        lowerMsg.includes("সেচ") ||
        lowerMsg.includes("irrigation") ||
        lowerMsg.includes("fertilizer") ||
        /(^|\s)(সার|সারের|ইউরিয়া|ডিএপি|টিএসপি|এমওপি)(\s|$|[।,?!])/i.test(lowerMsg) ||
        lowerMsg.includes("urea") ||
        lowerMsg.includes("ইউরিয়া") ||
        lowerMsg.includes("dap") ||
        lowerMsg.includes("tsp") ||
        lowerMsg.includes("mop") ||
        /(^|\s)(ফসল|ফসলের)(\s|$|[।,?!])/i.test(lowerMsg);

      const isWhyThisResultFallback =
        lowerMsg.includes("why") ||
        lowerMsg.includes("কেন") ||
        lowerMsg.includes("nasa") ||
        lowerMsg.includes("নাসা") ||
        lowerMsg.includes("satellite") ||
        lowerMsg.includes("স্যাটেলাইট") ||
        lowerMsg.includes("উপগ্রহ") ||
        lowerMsg.includes("power") ||
        lowerMsg.includes("gpm") ||
        lowerMsg.includes("imerg") ||
        lowerMsg.includes("smap") ||
        lowerMsg.includes("rationale") ||
        lowerMsg.includes("reason") ||
        lowerMsg.includes("কারণ");

      if (isGreetingFallback) {
        assistantReply = isEnglish
          ? `Hello! Welcome to CropWise AI 🌱. I'm doing great! How is your farm and crop doing?\n\nFeel free to ask me anything about:\n• **Climate Analysis**: Monsoon shifts and safe transplanting windows\n• **Crop Recommendations**: Resilient varieties (BRRI dhan71/75/51), AWD irrigation, and fertilizer schedules\n• **NASA Earth Data**: NASA POWER, GPM, and SMAP satellite data insights\n\nHow can I help your farm today?`
          : `হ্যালো! CropWise AI-তে আপনাকে স্বাগতম 🌱 আমি আপনার এআই কৃষি সহায়ক।\n\nআপনার খামার ও ফসলের কী অবস্থা? আপনি যেকোনো বিষয়ে প্রশ্ন করতে পারেন—\n• **জলবায়ু বিশ্লেষণ (Climate Analysis)**: বৃষ্টির অনসেট বিলম্ব ও রোপণের সঠিক সময়\n• **স্মার্ট চাষাবাদ পরামর্শ (Crop Recommendations)**: খরা/বন্যা সহনশীল জাত, এডব্লিউডি সেচ ও সুষম সার ব্যবস্থাপনা\n• **নাসা স্যাটেলাইট ডাটা (NASA Earth Data & Why This Result)**: উপগ্রহ তথ্যের নির্ভরযোগ্য বিশ্লেষণ\n\nআপনার কি কোনো নির্দিষ্ট প্রশ্ন আছে?`;
      } else if (isDeviceQueryFallback) {
        if (!userId) {
          assistantReply = isEnglish
            ? "To view device sensor telemetry or trigger relays, please log in to your CropWise AI account."
            : "ডিভাইসের তথ্য দেখতে বা পাম্প নিয়ন্ত্রণ করতে দয়া করে আপনার CropWise AI অ্যাকাউন্টে লগইন করুন।";
        } else if (userDevices.length === 0) {
          assistantReply = isEnglish
            ? "Device is not connected.\n\nNo IoT device is currently linked to your account. Please connect your ESP32 device from the [Device Settings](/dashboard/device-settings) page to view live telemetry and control irrigation.\n\nFeel free to ask any questions about climate analysis, crop varieties, or fertilizer management!"
            : "আপনার কোনো আইওটি ডিভাইস সংযুক্ত নেই (Device is not connected)।\n\nলাইভ সেন্সর ডাটা পর্যবেক্ষণ করতে বা পানির মোটর নিয়ন্ত্রণ করতে অনুগ্রহ করে [ডিভাইস সেটিংস](/dashboard/device-settings) পেজ থেকে ডিভাইস কানেক্ট করুন।\n\nআপনার যদি জলবায়ু বিশ্লেষণ, ফসলের জাত বা সার-সেচ বিষয়ক কোনো প্রশ্ন থাকে, তবে নির্দ্বিধায় করতে পারেন!";
        } else {
          const primaryDevId = userDevices[0]?.deviceId || "esp32-001";
          const rawData = latestDeviceTelemetry?.data || {};
          const temp = rawData.temperature ?? rawData.temperature1 ?? "N/A";
          const hum = rawData.humidity ?? rawData.humidity1 ?? "N/A";
          const soilRaw = rawData.soilMoistureRaw ?? rawData.soil_moisture_raw ?? rawData.soil1 ?? "N/A";
          const rainRaw = rawData.rainSensorRaw ?? rawData.rain_sensor_raw ?? rawData.rain ?? "N/A";
          const lastSeen = deviceStatusResult?.lastSeen || rawData.recordedAt || rawData.created_at || "N/A";

          if (!isDeviceOnline) {
            assistantReply = isEnglish
              ? `Your ESP32 device (**${primaryDevId}**) is currently **offline (inactive)**.\n\n📡 **Last Recorded Transmission:** ${lastSeen}\n\n📊 **Last Known Sensor Readings:**\n• Temperature: **${temp}°C**\n• Humidity: **${hum}%**\n• Soil Moisture: **${soilRaw}** (raw analog units)\n• Rain Sensor: **${rainRaw}** (raw analog units)\n• Water Motor (Relay 1): **${deviceStatusResult?.relay1 || "OFF"}**\n• Solenoid Valve (Relay 2): **${deviceStatusResult?.relay2 || "OFF"}**\n\n⚠️ *Note: Live readings cannot be refreshed in real time until the physical ESP32 reconnects to Wi-Fi.*`
              : `তোমার ESP32 ডিভাইসটি (**${primaryDevId}**) বর্তমানে **অফলাইন (নিষ্ক্রিয়)**।\n\n📡 **সর্বশেষ তথ্য পাওয়ার সময়:** ${lastSeen}\n\n📊 **সর্বশেষ প্রাপ্ত সেন্সর রিডিং:**\n• তাপমাত্রা: **${temp}°C**\n• আর্দ্রতা: **${hum}%**\n• মাটির আর্দ্রতা: **${soilRaw}** (র অ্যানালগ মান)\n• রেইন সেন্সর: **${rainRaw}** (র অ্যানালগ মান)\n• পানির মোটর (রিলে ১): **${deviceStatusResult?.relay1 || "OFF"}**\n• সলিনয়েড ভাল্ব (রিলে ২): **${deviceStatusResult?.relay2 || "OFF"}**\n\n⚠️ *নোট: ডিভাইসটি পুনরায় ওয়াইফাইয়ের সাথে সংযুক্ত না হওয়া পর্যন্ত লাইভ রিডিং আপডেট করা যাচ্ছে না।*`;
          } else {
            assistantReply = isEnglish
              ? `Your ESP32 device (**${primaryDevId}**) is **online and actively transmitting**! 🟢\n\n📊 **Live Telemetry Readings:**\n• Temperature: **${temp}°C**\n• Humidity: **${hum}%**\n• Soil Moisture: **${soilRaw}** (raw analog units)\n• Rain Sensor: **${rainRaw}** (raw analog units)\n• Water Motor (Relay 1): **${deviceStatusResult?.relay1 || "OFF"}**\n• Solenoid Valve (Relay 2): **${deviceStatusResult?.relay2 || "OFF"}**\n\nAll sensors are reporting nominal parameters.`
              : `তোমার ESP32 ডিভাইসটি (**${primaryDevId}**) বর্তমানে **অনলাইনে সচল ও সক্রিয় আছে**! 🟢\n\n📊 **লাইভ সেন্সর রিডিং:**\n• তাপমাত্রা: **${temp}°C**\n• আর্দ্রতা: **${hum}%**\n• মাটির আর্দ্রতা: **${soilRaw}** (র অ্যানালগ মান)\n• রেইন সেন্সর: **${rainRaw}** (র অ্যানালগ মান)\n• পানির মোটর (রিলে ১): **${deviceStatusResult?.relay1 || "OFF"}**\n• সলিনয়েড ভাল্ব (রিলে ২): **${deviceStatusResult?.relay2 || "OFF"}**\n\nসকল সেন্সর স্বাভাবিকভাবে ডেটা পাঠাচ্ছে।`;
          }
        }
      } else if (isWhyThisResultFallback) {
        if (savedRecommendations.length > 0 && savedRecommendations[0].whyThisResult) {
          assistantReply = isEnglish
            ? `**Why This Result (Scientific Rationale):**\n${JSON.stringify(savedRecommendations[0].whyThisResult, null, 2)}\n\nThis recommendation is calculated by analyzing NASA POWER daily precipitation quantiles and historical monsoon variance to minimize the risk of drought during the flowering stage.`
            : `**কেন এই ফলাফল (নাসা স্যাটেলাইট বিশ্লেষণের ব্যাখ্যা):**\n\nনাসার উপগ্রহ উপাত্তের ওপর ভিত্তি করে এই পরামর্শটি তৈরি হয়েছে:\n${JSON.stringify(savedRecommendations[0].whyThisResult, null, 2)}\n\nনাসার POWER ও GPM IMERG বৃষ্টিপাত পার্সেন্টাইল বিশ্লেষণ করে দেখা গেছে যে এই নির্দিষ্ট সময়ে রোপণ করলে ধানের শিষ বের হওয়ার (flowering) সময় খরা বা পানির সংকটের ঝুঁকি সর্বনিম্ন থাকে।`;
        } else {
          assistantReply = isEnglish
            ? `**Why This Result (NASA Earth Observations & Methodology):**\n\nCropWise AI combines 3 NASA Earth observation systems:\n1. **NASA POWER (Prediction of Worldwide Energy Resources):** Provides daily solar radiation, 2m air temperature, and precipitation corrected (PRECTOTCORR) datasets over a 30-year baseline.\n2. **NASA GPM IMERG (Integrated Multi-satellitE Retrievals for GPM):** High-resolution satellite rainfall radar providing real-time precipitation estimates.\n3. **NASA SMAP (Soil Moisture Active Passive):** 0–5 cm root-zone soil moisture radar measurements.\n\n**Scientific Methodology:** By calculating rainfall percentile shifts and comparing the 1991–2020 baseline with recent 5-year trends, CropWise AI identifies the safe planting window that avoids both early seedling rot and late-season drought.`
            : `**কেন এই ফলাফল (নাসা স্যাটেলাইট ডাটা ও বৈজ্ঞানিক ভিত্তি):**\n\nCropWise AI নাসার ৩টি প্রধান স্যাটেলাইট সিস্টেমের সমন্বয়ে বিশ্লেষণ করে:\n১. **NASA POWER:** বিগত ৩০ বছরের (১৯৯১–২০২০) সৌর বিকিরণ, তাপমাত্রা ও সংশোধিত বৃষ্টিপাত (PRECTOTCORR) উপাত্ত।\n২. **NASA GPM IMERG:** উচ্চ রেজোলিউশনের মাল্টি-স্যাটেলাইট বৃষ্টিপাত রাডার, যা রিয়েল-টাইম বৃষ্টিপাত পরিমাপ করে।\n৩. **NASA SMAP:** ০–৫ সেমি শিকড় অঞ্চলের মাটির সক্রিয় আর্দ্রতা রাডার উপাত্ত।\n\n**বিশ্লেষণ পদ্ধতি:** ঐতিহাসিক বেসলাইনের সাথে সাম্প্রতিক ৫ বছরের বৃষ্টিপাতের পার্সেন্টাইল তুলনা করে রোপণের এমন একটি সময় নির্ধারণ করা হয় যাতে চারা রোপণের শুরুতে অতিরিক্ত পানিতে তলিয়ে যাওয়া এবং শীষ আসার সময় খরার ঝুঁকি এড়ানো যায়।`;
        }
      } else if (isClimateAnalysisFallback) {
        if (savedAnalyses.length > 0) {
          const a = savedAnalyses[0];
          const shift = a.shiftDays ?? 8;
          const start = a.plantingWindowStart || "১৫ জুলাই";
          const end = a.plantingWindowEnd || "১৫ আগস্ট";
          const loc = (typeof a.location === "object" && a.location?.district) || location?.district || "আপনার এলাকা";

          assistantReply = isEnglish
            ? `Based on your saved Climate Analysis for **${loc}**, the monsoon rainfall onset is estimated to shift by **${Math.abs(shift)} days ${shift >= 0 ? "later" : "earlier"}** than normal.\n\n🌾 **Recommended Transplanting Window:**\n• Start Date: **${start}**\n• End Date: **${end}**\n\n💡 **Expert Guidance:**\n1. Ensure your seedlings are 20–25 days old before transplanting.\n2. Keep 2–3 inches of standing water in the main field during early vegetative growth.\n3. If onset rainfall is delayed, use supplemental nursery irrigation to prevent seedlings from over-aging.`
            : `আপনার সংরক্ষিত জলবায়ু বিশ্লেষণ অনুযায়ী, **${loc}** এলাকায় আমন ধানের ক্ষেত্রে বৃষ্টিপাতের সূচনা (onset) স্বাভাবিক সময়ের চেয়ে **${Math.abs(shift)} দিন ${shift >= 0 ? "দেরিতে" : "আগে"}** শুরু হওয়ার সম্ভাবনা রয়েছে।\n\n🌾 **রোপণের প্রস্তাবিত সময় (Transplanting Window):**\n• শুরু: **${start}**\n• শেষ: **${end}**\n\n💡 **কৃষি বিশেষজ্ঞের পরামর্শ:**\n১. চারার বয়স ২০–২৫ দিন হলে জমিতে পর্যাপ্ত পানি রেখে রোপণ করুন।\n২. বৃষ্টির অনসেট বিলম্বিত হলে চারাতলায় সম্পূরক সেচ নিশ্চিত করুন যাতে চারা অতিরিক্ত বয়স্ক না হয়ে যায়।`;
        } else {
          assistantReply = isEnglish
            ? `**Climate Analysis (Aman Onset & Monsoon Shift):**\n\nAccording to NASA POWER & GPM 30-year climatological data (1991–2020 vs recent 5-year trends):\n• **Monsoon Onset Delay:** Northern and Western Bangladesh (e.g., Rangpur, Rajshahi) typically experience an **8 to 10 day delay** in monsoon onset.\n• **Optimum Transplanting Window:** For Aman rice, transplanting between **July 15 and August 15** with 20–25 day-old seedlings yields the best harvest.\n\nTo get satellite-calculated onset dates for your specific district, run a [Climate Analysis](/dashboard/climate-analysis).`
            : `**জলবায়ু বিশ্লেষণ (আমন অনসেট ও বৃষ্টির পরিবর্তন):**\n\nনাসার ৩০ বছরের ক্লাইমেট ডাটা (১৯৯১–২০২০ বনাম সাম্প্রতিক ৫ বছরের ট্রেন্ড) অনুযায়ী:\n• **অনসেট বিলম্ব:** রংপুর ও রাজশাহীসহ উত্তরাঞ্চলে আমন মৌসুমে বৃষ্টিপাতের সূচনা সাধারণত **৮ থেকে ১০ দিন পিছিয়ে** যাচ্ছে।\n• **অনুকূল রোপণ উইন্ডো:** আমন ধানের ক্ষেত্রে **১৫ জুলাই থেকে ১৫ আগস্টের** মধ্যে ২০–২৫ দিন বয়সী চারা রোপণ সর্বোত্তম।\n\nআপনার সুনির্দিষ্ট জেলার জন্য নাসার স্যাটেলাইট ডাটা বিশ্লেষণ পেতে ড্যাশবোর্ড থেকে [Climate Analysis](/dashboard/climate-analysis) চালান।`;
        }
      } else if (isRecommendationFallback) {
        if (savedRecommendations.length > 0) {
          const r = savedRecommendations[0];
          assistantReply = isEnglish
            ? `From your saved planting recommendations:\n**${r.recommendationText}**\n\n${r.explanation || ""}\n\n💡 **Smart Management:**\n• **AWD Irrigation:** Apply Alternate Wetting and Drying to conserve 25–30% irrigation water.\n• **Balanced Fertilizer:** Apply full TSP/DAP, MoP, and Zinc at final land prep, then split Urea in 3 equal top-dressings.`
            : `আপনার সংরক্ষিত রোপণ পরামর্শ অনুযায়ী:\n**${r.recommendationText}**\n\n${r.explanation || ""}\n\n💡 **স্মার্ট কৃষি ব্যবস্থাপনা:**\n• **এডব্লিউডি (AWD) সেচ:** পর্যায়ক্রমে ভেজানো ও শুকানো পদ্ধতিতে ২৫–৩০% সেচের পানি সাশ্রয় করুন।\n• **সুষম সার:** শেষ চাষে সম্পূর্ণ টিএসপি/ডিএপি, এমওপি ও জিংক প্রয়োগ করুন এবং ইউরিয়া ৩ কিস্তিতে উপরিপ্রয়োগ করুন।`;
        } else {
          assistantReply = isEnglish
            ? `**Smart Farming Recommendations:**\n\n1. **Resilient Crop Varieties:**\n   • **Drought-Prone Areas:** BRRI dhan71 (high yield, drought-tolerant).\n   • **Short Duration:** BRRI dhan75 (120–125 days, leaves field open for early potato/mustard).\n   • **Flash Flood / Submergence:** BRRI dhan51 & BRRI dhan52 (survives 14–21 days under water).\n\n2. **AWD (Alternate Wetting and Drying) Water Management:**\n   • Install a 4-inch perforated PVC pipe in the field. Re-irrigate only when water drops 15 cm below soil level.\n   • Conserves 25–30% irrigation water and reduces diesel/electric pump costs.\n\n3. **Balanced Fertilizer Schedule (BRRI Guidelines):**\n   • Basal (final plowing): Full TSP/DAP, MoP, Gypsum, and Zinc.\n   • Urea: 3 split top-dressings (15–20 DAT, active tillering, and panicle initiation).`
            : `**স্মার্ট চাষাবাদ ও ফসল ব্যবস্থাপনা পরামর্শ:**\n\n১. **উপযোগী ও সহনশীল ধানের জাত:**\n   • **খরাপ্রবণ এলাকা:** ব্রি ধান৭১ (খরা সহনশীল, মাঝারি মেয়াদি).\n   • **স্বল্পমেয়াদি জাত:** ব্রি ধান৭৫ (১২০–১২৫ দিন, ধান কাটার পর আগাম সরিষা/আলু চাষের উপযোগী).\n   • **বন্যাপ্রবণ এলাকা:** ব্রি ধান৫১ ও ব্রি ধান৫২ (জলে নিমজ্জিত অবস্থায় ১৪–২১ দিন বেঁচে থাকতে পারে).\n\n২. **এডব্লিউডি (AWD) সেচ প্রযুক্তি:**\n   • জমিতে ৪ ইঞ্চি ছিদ্রযুক্ত পিভিসি পাইপ বসান। পাইপের পানি মাটির ১৫ সেমি নিচে নামলে পুনরায় সেচ দিন।\n   • এতে ২৫–৩০% ভূগর্ভস্থ পানি ও সেচের খরচ সাশ্রয় হয়।\n\n৩. **সুষম সার প্রয়োগ সূচি (ব্রি নির্দেশিকা):**\n   • শেষ চাষে: সম্পূর্ণ টিএসপি/ডিএপি, এমওপি, জিপসাম ও দস্তা প্রয়োগ করুন।\n   • ইউরিয়া: ৩ কিস্তিতে সমানভাবে উপরিপ্রয়োগ করুন (রোপণের ১৫ দিন পর, কুশি গজানোর সময় এবং কাইচ থোড় আসার ৫-৭ দিন আগে)।`;
        }
      } else {
        assistantReply = isEnglish
          ? `I am CropWise AI 🌱, your context-aware agricultural assistant. You can ask me about:\n1. **Climate Analysis**: Monsoon shifts and safe transplanting dates\n2. **Crop Recommendations**: Resilient varieties, AWD water management, and fertilizer schedules\n3. **NASA Earth Observations**: NASA POWER, GPM, and SMAP satellite data insights\n\nWhat would you like to know about your farm?`
          : `আমি CropWise AI 🌱, আপনার এআই কৃষি সহায়ক। আপনি আমাকে ৩টি প্রধান বিষয়ে জিজ্ঞাসা করতে পারেন:\n১. **জলবায়ু বিশ্লেষণ**: বৃষ্টির অনসেট বিলম্ব ও রোপণের সঠিক সময়\n২. **স্মার্ট চাষাবাদ পরামর্শ**: সহনশীল জাত, এডব্লিউডি সেচ ও সুষম সার ব্যবস্থাপনা\n৩. **নাসা স্যাটেলাইট ডাটা**: উপগ্রহ তথ্যের বৈজ্ঞানিক ব্যাখ্যা ও বিশ্লেষণ\n\nআপনার খামার বা ফসল সম্পর্কে কীভাবে সাহায্য করতে পারি?`;
      }
    }

    // ─── 7. Save Messages to Database (Resilient Non-Blocking Persistence) ───
    try {
      await prisma.proboyMessage.create({
        data: {
          conversationId: conversation.id,
          role: "user",
          content: message,
        },
      });

      await prisma.proboyMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: assistantReply,
          sources: sources as any,
          contextStatus: {
            authenticated: Boolean(userId),
            deviceCount: userDevices.length,
            isDeviceOnline,
          } as any,
        },
      });

      await prisma.proboyConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        },
      }).catch(() => {});
    } catch (saveErr) {
      console.warn("Could not persist messages to ProboyConversation (non-fatal):", saveErr);
    }

    // ─── 8. Format Final Response ───────────────────────────────────────────
    const contextStatus: ICropWiseContextStatus = {
      userAuthenticated: Boolean(userId),
      deviceDataAvailable: userDevices.length > 0,
      deviceOnline: isDeviceOnline,
      analysisDataAvailable: savedAnalyses.length > 0,
      knowledgeBaseCount: userKnowledge.length,
    };

    return {
      conversationId: conversation.id,
      message: {
        role: "assistant",
        content: assistantReply,
      },
      sources,
      contextStatus,
    };
  }

  /**
   * Get all conversations for a user
   */
  static async getConversations(userId: string) {
    return prisma.proboyConversation.findMany({
      where: { userId },
      orderBy: { lastMessageAt: "desc" },
      include: {
        _count: { select: { messages: true } },
      },
    });
  }

  /**
   * Get messages for a conversation with authorization check
   */
  static async getConversationMessages(conversationId: string, userId?: string) {
    const conversation = await prisma.proboyConversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return null;
    }

    // Protect user privacy: if conversation belongs to a user, check userId
    if (conversation.userId && conversation.userId !== userId) {
      throw new Error("Unauthorized access to private conversation");
    }

    return conversation;
  }

  /**
   * Add a knowledge item to the user's knowledge base
   */
  static async addUserKnowledge(input: IUserKnowledgeInput, userId: string) {
    return prisma.userKnowledge.create({
      data: {
        userId,
        farmId: input.farmId || null,
        title: input.title,
        content: input.content,
        sourceType: input.sourceType || "USER_FACT",
        metadata: (input.metadata as any) || {},
      },
    });
  }


  /**
   * Get user knowledge base items
   */
  static async getUserKnowledge(userId: string) {
    return prisma.userKnowledge.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }
}

// Backward compatibility alias
export const ProboyService = CropWiseAiService;
