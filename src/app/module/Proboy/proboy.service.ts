/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "../../lib/prisma.js";
import { LLMService } from "../Rag/llm.service.js";
import { RAGService } from "../Rag/rag.service.js";
import { DeviceService } from "../Device/device.service.js";
import { AmanOnsetService } from "../AmanOnset/amanOnset.service.js";
import { AnalyzeAiService } from "../AnalyzeAi/analyzeAi.service.js";
import {
  IProboyChatRequest,
  IProboyChatResponse,
  IProboySource,
  IProboyContextStatus,
  IUserKnowledgeInput,
} from "./proboy.interface.js";

const llmService = new LLMService();
const ragService = new RAGService();

export class ProboyService {
  /**
   * Main context-aware chat handler
   */
  static async handleChat(
    payload: IProboyChatRequest,
    userId?: string
  ): Promise<IProboyChatResponse> {
    const { message, conversationId, guestSessionId, location, crop, language } = payload;
    const sources: IProboySource[] = [];
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
      let resolvedDevices = devices;

      // 1. If user has no directly assigned devices, look for farm or unassigned devices
      if (resolvedDevices.length === 0) {
        const farmIds = userFarms.map((f) => f.id);
        const candidates = await prisma.device.findMany({
          where: {
            OR: [
              { ownerUserId: null },
              ...(farmIds.length > 0 ? [{ farmId: { in: farmIds } }] : []),
            ],
          },
          orderBy: { lastSeenAt: "desc" },
          take: 5,
        });

        if (candidates.length > 0) {
          resolvedDevices = candidates;
          // Claim unowned devices for this user
          for (const d of candidates) {
            if (!d.ownerUserId && userId) {
              await prisma.device.update({
                where: { id: d.id },
                data: { ownerUserId: userId },
              }).catch(() => {});
            }
          }
        }
      }

      // 2. Ensure system's primary hardware device "esp32-001" exists and is linked
      const hasRealDevice = resolvedDevices.some((d) => !d.deviceId.startsWith("test-"));
      if (!hasRealDevice) {
        try {
          const primaryUnit = await prisma.device.upsert({
            where: { deviceId: "esp32-001" },
            create: {
              deviceId: "esp32-001",
              name: "CropSense ESP32 (esp32-001)",
              deviceType: "ESP32-S3",
              ownerUserId: userId,
              connectionStatus: "offline",
            },
            update: {
              ownerUserId: userId,
            },
          });
          resolvedDevices.unshift(primaryUnit);
        } catch {
          resolvedDevices.unshift({
            id: "esp32-001",
            deviceId: "esp32-001",
            name: "CropSense ESP32 (esp32-001)",
            ownerUserId: userId,
            connectionStatus: "offline",
          } as any);
        }
      }

      // 3. Check if user explicitly mentioned a device ID in message
      const devMatch = message.match(/\b(esp32-[\w-]+)\b/i);
      if (devMatch) {
        const requestedDevId = devMatch[1].toLowerCase();
        const matchIdx = resolvedDevices.findIndex((d) => d.deviceId.toLowerCase() === requestedDevId);
        if (matchIdx > 0) {
          const [matched] = resolvedDevices.splice(matchIdx, 1);
          resolvedDevices.unshift(matched);
        } else if (matchIdx === -1) {
          resolvedDevices.unshift({
            id: `dev-${requestedDevId}`,
            deviceId: requestedDevId,
            name: `ESP32 (${requestedDevId})`,
            ownerUserId: userId,
          } as any);
        }
      } else {
        // Place real hardware device (not test-*) at front
        const nonTestIdx = resolvedDevices.findIndex((d) => !d.deviceId.startsWith("test-"));
        if (nonTestIdx > 0) {
          const [matched] = resolvedDevices.splice(nonTestIdx, 1);
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
        sources.push({
          type: "user_knowledge",
          title: "Saved User Knowledge Base",
          details: `${userKnowledge.length} knowledge items found`,
        });
        const kbText = userKnowledge
          .map((k) => `• ${k.title} (${k.sourceType}): ${k.content}`)
          .join("\n");
        contextItems.push(`[USER KNOWLEDGE BASE]\n${kbText}`);
      }

      if (savedAnalyses.length > 0) {
        const latestAnalysis = savedAnalyses[0];
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
        contextItems.push(
          `[SAVED CLIMATE ANALYSIS] ID: ${latestAnalysis.id}, Crop: ${JSON.stringify(latestAnalysis.crop)}, Shift: ${latestAnalysis.shiftDays} days, Window: ${latestAnalysis.plantingWindowStart} - ${latestAnalysis.plantingWindowEnd}, Status: ${latestAnalysis.status}`
        );
      }

      if (savedRecommendations.length > 0) {
        const latestRec = savedRecommendations[0];
        sources.push({
          type: "recommendation",
          title: "Saved Planting Recommendation",
          timestamp: latestRec.createdAt.toISOString(),
          details: latestRec.recommendationText,
        });
        contextItems.push(
          `[SAVED RECOMMENDATION] Crop: ${latestRec.cropType}, Recommendation: ${latestRec.recommendationText}, Explanation: ${latestRec.explanation || "N/A"}`
        );
        if (latestRec.whyThisResult) {
          sources.push({
            type: "why_this_result",
            title: "Why This Result Rationale",
            details: latestRec.whyThisResult,
          });
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

          contextItems.push(
            `[IOT DEVICE STATUS]\n` +
            `Device ID: ${primaryDevice.deviceId}\n` +
            `Status: ${isDeviceOnline ? "ONLINE (Active & transmitting)" : "OFFLINE (Inactive / Not transmitting)"}\n` +
            `Last Seen: ${statusRes.lastSeen || "Never / No ping recorded"}\n` +
            `Seconds Since Last Transmission: ${statusRes.secondsSinceLastSeen ?? "N/A"}\n` +
            `Relay 1 (Water Motor): ${latestData?.relay1 || statusRes.relay1 || "OFF"}\n` +
            `Relay 2 (Solenoid Valve): ${latestData?.relay2 || statusRes.relay2 || "OFF"}`
          );

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
          console.warn("Could not query device status in Proboy:", deviceErr);
        }
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

      if (isRelayIntent && (isTurnOn || isTurnOff) && userDevices.length > 0) {
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
          sources.push({
            type: "agricultural_kb",
            title: "CropWise Agricultural Knowledge Base",
            details: `${ragDocs.length} knowledge references consulted`,
          });
          const agronomicContext = ragDocs.map((d) => d.content).join("\n\n");
          contextItems.push(`[AGRONOMIC & SATELLITE KNOWLEDGE]\n${agronomicContext}`);
        }
      } catch (ragErr) {
        console.warn("RAG retrieval failed in Proboy:", ragErr);
      }
    }

    // ─── 5. LLM Prompt Construction & Multi-turn Dialogue ───────────────────
    const recentMessages = (conversation.messages || [])
      .slice(0, 6)
      .reverse()
      .map((m) => `${m.role === "user" ? "User" : "Proboy AI"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `You are Proboy AI, the advanced context-aware agricultural assistant for the CropWise AI platform (NASA Space Apps Challenge).
${
  isEnglish
    ? "MANDATORY LANGUAGE: The user has explicitly selected ENGLISH mode. You MUST answer entirely in fluent, grammatically correct, natural English. Do NOT answer in Bengali or Banglish."
    : "MANDATORY LANGUAGE: The user has selected BANGLA mode. You MUST answer in fluent, friendly, natural Bengali (Bangla)."
}

CRITICAL RULES:
1. TRUTHFULNESS & GROUNDING:
   - Base answers strictly on the provided Context Information.
   - NEVER invent or hallucinate sensor readings, NASA measurements, timestamps, or confidence metrics.
   - If a sensor or data field is missing or unverified, state that it is unavailable.
2. IOT SENSOR & DEVICE INTEGRATION:
   - When asked if a device is active, online, offline, or about sensor telemetry:
     * Directly state whether the device is ONLINE (active) or OFFLINE (inactive).
     * Explicitly cite the device ID (e.g., esp32-001).
     * If OFFLINE:
       ${
         isEnglish
           ? 'State clearly: "Your ESP32 device ([deviceId]) is currently offline (inactive). Last recorded transmission was [lastSeen]." Followed by the last recorded sensor metrics: Temperature, Humidity, Soil Moisture, and Relay states. Remind the user that live sensor readings cannot be refreshed in real time until the device reconnects.'
           : 'State clearly: "তোমার ESP32 ডিভাইসটি ([deviceId]) বর্তমানে অফলাইন (নিষ্ক্রিয়)। সর্বশেষ ডেটা পাওয়া গিয়েছিল [lastSeen]।" এরপর সর্বশেষ প্রাপ্ত সেন্সর মান (তাপমাত্রা, আর্দ্রতা, মাটির আর্দ্রতা, রিলে) প্রদর্শন করো।'
       }
     * If ONLINE: State that the device is online and actively transmitting, and cite the live temperature, humidity, raw soil moisture, and relay states.
     * Remind that raw soil moisture and rain sensor values are raw analog sensor units.
3. GUEST MODE SECURITY:
   - If an unauthenticated guest asks for private device readings, private farm data, or to switch a relay, politely inform them that device management and saved analysis require signing in to their CropWise AI account.
4. HISTORICAL ANALYSIS & RECOMMENDATIONS:
   - When answering questions about previous climate analysis or "Why This Result", reference the user's saved analysis, shift in rainfall onset, and recommended transplanting window.
5. TONE:
   - Warm, authoritative, agricultural expert, supportive of farmers and precision agriculture enthusiasts.`;

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
      console.warn("Proboy LLM call error (engaging intelligent context fallback):", llmErr?.message || llmErr);

      // Check for transplanting / planting timing / crop calendar questions
      const isPlantingQuery =
        lowerMsg.includes("ropon") ||
        lowerMsg.includes("রোপণ") ||
        lowerMsg.includes("dhan") ||
        lowerMsg.includes("ধান") ||
        lowerMsg.includes("transplant") ||
        lowerMsg.includes("plant") ||
        lowerMsg.includes("koto din") ||
        lowerMsg.includes("কত দিন") ||
        lowerMsg.includes("kobe") ||
        lowerMsg.includes("কবে") ||
        lowerMsg.includes("timing") ||
        lowerMsg.includes("সময়") ||
        lowerMsg.includes("তারিখ") ||
        lowerMsg.includes("window") ||
        lowerMsg.includes("onset") ||
        lowerMsg.includes("shift");

      // Check for device / relay / motor queries
      const isDeviceQuery =
        lowerMsg.includes("device") ||
        lowerMsg.includes("ডিভাইস") ||
        lowerMsg.includes("relay") ||
        lowerMsg.includes("রிலே") ||
        lowerMsg.includes("motor") ||
        lowerMsg.includes("মোটর") ||
        lowerMsg.includes("pump") ||
        lowerMsg.includes("পাম্প") ||
        lowerMsg.includes("sensor") ||
        lowerMsg.includes("সেন্সর") ||
        lowerMsg.includes("active") ||
        lowerMsg.includes("online") ||
        lowerMsg.includes("offline");

      // Check for water / irrigation / weather queries
      const isWaterQuery =
        lowerMsg.includes("pani") ||
        lowerMsg.includes("পানি") ||
        lowerMsg.includes("water") ||
        lowerMsg.includes("sech") ||
        lowerMsg.includes("সেচ") ||
        lowerMsg.includes("rain") ||
        lowerMsg.includes("বৃষ্টি") ||
        lowerMsg.includes("moisture") ||
        lowerMsg.includes("আর্দ্রতা");

      // Check for fertilizer / nutrient queries
      const isFertilizerQuery =
        lowerMsg.includes("sar") ||
        lowerMsg.includes("সার") ||
        lowerMsg.includes("fertilizer") ||
        lowerMsg.includes("urea") ||
        lowerMsg.includes("ইউরিয়া") ||
        lowerMsg.includes("dap") ||
        lowerMsg.includes("tsp") ||
        lowerMsg.includes("mop") ||
        lowerMsg.includes("pest") ||
        lowerMsg.includes("পোকামাকড়");

      // Check for greetings / well-being
      const isGreeting =
        lowerMsg === "hi" ||
        lowerMsg === "hello" ||
        lowerMsg === "hey" ||
        lowerMsg === "হ্যালো" ||
        lowerMsg === "হাই" ||
        lowerMsg.includes("kemon") ||
        lowerMsg.includes("কেমন");

      if (isPlantingQuery) {
        if (savedAnalyses.length > 0) {
          const a = savedAnalyses[0];
          const shift = a.shiftDays ?? 0;
          const start = a.plantingWindowStart || "১৫ জুলাই";
          const end = a.plantingWindowEnd || "১৫ আগস্ট";
          const loc = (typeof a.location === "object" && a.location?.district) || location?.district || "আপনার এলাকা";

          assistantReply = isEnglish
            ? `Based on your saved Climate Analysis for **${loc}**, the monsoon rainfall onset is estimated to shift by **${Math.abs(shift)} days ${shift >= 0 ? "later" : "earlier"}** than normal.\n\n🌾 **Recommended Transplanting Window:**\n• Start Date: **${start}**\n• End Date: **${end}**\n\n💡 **Expert Guidance:**\n1. Ensure your seedlings are 20–25 days old before transplanting.\n2. Keep 2–3 inches of standing water in the main field during early vegetative growth.\n3. If onset rainfall is delayed, use supplemental nursery irrigation to prevent seedlings from over-aging.`
            : `আপনার সংরক্ষিত জলবায়ু বিশ্লেষণ অনুযায়ী, **${loc}** এলাকায় আমন ধানের ক্ষেত্রে বৃষ্টিপাতের সূচনা (onset) স্বাভাবিক সময়ের চেয়ে **${Math.abs(shift)} দিন ${shift >= 0 ? "দেরিতে" : "আগে"}** শুরু হওয়ার সম্ভাবনা রয়েছে।\n\n🌾 **রোপণের প্রস্তাবিত সময় (Transplanting Window):**\n• শুরু: **${start}**\n• শেষ: **${end}**\n\n💡 **কৃষি বিশেষজ্ঞের পরামর্শ:**\n১. চারার বয়স ২০–২৫ দিন হলে জমিতে পর্যাপ্ত পানি রেখে রোপণ করুন।\n২. বৃষ্টির অনসেট বিলম্বিত হলে চারাতলায় সম্পূরক সেচ নিশ্চিত করুন যাতে চারা অতিরিক্ত বয়স্ক না হয়ে যায়।`;
        } else if (savedRecommendations.length > 0) {
          const r = savedRecommendations[0];
          assistantReply = isEnglish
            ? `From your saved planting recommendations:\n**${r.recommendationText}**\n\n${r.explanation || ""}`
            : `আপনার সংরক্ষিত রোপণ পরামর্শ অনুযায়ী:\n**${r.recommendationText}**\n\n${r.explanation || ""}`;
        } else {
          assistantReply = isEnglish
            ? `For Aman rice in Bangladesh, the optimum transplanting period is typically between **July 15 and August 15** with 20–25 day-old seedlings. To get exact, NASA satellite-calculated onset dates for your district, please run a [Climate Analysis](/dashboard/climate-analysis).`
            : `বাংলাদেশে আমন ধানের ক্ষেত্রে সাধারণত **১৫ জুলাই থেকে ১৫ আগস্টের** মধ্যে ২০–২৫ দিন বয়সের চারা রোপণ সর্বোত্তম। আপনার জেলার নাসার স্যাটেলাইট উপাত্ত অনুযায়ী সুনির্দিষ্ট তারিখ জানতে ড্যাশবোর্ড থেকে [Climate Analysis](/dashboard/climate-analysis) সম্পন্ন করুন।`;
        }
      } else if (isDeviceQuery) {
        const primaryDevId = userDevices[0]?.deviceId || "esp32-001";
        const rawData = latestDeviceTelemetry?.data || {};
        const temp = rawData.temperature ?? rawData.temperature1 ?? "N/A";
        const hum = rawData.humidity ?? rawData.humidity1 ?? "N/A";
        const soilRaw = rawData.soilMoistureRaw ?? rawData.soil_moisture_raw ?? rawData.soil1 ?? "N/A";
        const rainRaw = rawData.rainSensorRaw ?? rawData.rain_sensor_raw ?? rawData.rain ?? "N/A";
        const lastSeen = deviceStatusResult?.lastSeen || rawData.recordedAt || rawData.created_at || "N/A";

        if (!userId) {
          assistantReply = isEnglish
            ? "To view device sensor telemetry or trigger relays, please log in to your CropWise AI account."
            : "ডিভাইসের তথ্য দেখতে বা পাম্প নিয়ন্ত্রণ করতে দয়া করে আপনার CropWise AI অ্যাকাউন্টে লগইন করুন।";
        } else if (userDevices.length === 0) {
          assistantReply = isEnglish
            ? "No ESP32 devices found connected to your account. Please link your device from the dashboard."
            : "আপনার অ্যাকাউন্টে কোনো ESP32 ডিভাইস সংযুক্ত পাওয়া যায়নি। অনুগ্রহ করে ড্যাশবোর্ড থেকে আপনার ডিভাইসটি যুক্ত করুন।";
        } else if (!isDeviceOnline) {
          assistantReply = isEnglish
            ? `Your ESP32 device (**${primaryDevId}**) is currently **offline (inactive)**.\n\n📡 **Last Recorded Transmission:** ${lastSeen}\n\n📊 **Last Known Sensor Readings:**\n• Temperature: **${temp}°C**\n• Humidity: **${hum}%**\n• Soil Moisture: **${soilRaw}** (raw analog units)\n• Rain Sensor: **${rainRaw}** (raw analog units)\n• Water Motor (Relay 1): **${deviceStatusResult?.relay1 || "OFF"}**\n• Solenoid Valve (Relay 2): **${deviceStatusResult?.relay2 || "OFF"}**\n\n⚠️ *Note: Live readings cannot be refreshed in real time until the physical ESP32 reconnects to Wi-Fi.*`
            : `তোমার ESP32 ডিভাইসটি (**${primaryDevId}**) বর্তমানে **অফলাইন (নিষ্ক্রিয়)**।\n\n📡 **সর্বশেষ তথ্য পাওয়ার সময়:** ${lastSeen}\n\n📊 **সর্বশেষ প্রাপ্ত সেন্সর রিডিং:**\n• তাপমাত্রা: **${temp}°C**\n• আর্দ্রতা: **${hum}%**\n• মাটির আর্দ্রতা: **${soilRaw}** (র অ্যানালগ মান)\n• রেইন সেন্সর: **${rainRaw}** (র অ্যানালগ মান)\n• পানির মোটর (রিলে ১): **${deviceStatusResult?.relay1 || "OFF"}**\n• সলিনয়েড ভাল্ব (রিলে ২): **${deviceStatusResult?.relay2 || "OFF"}**\n\n⚠️ *নোট: ডিভাইসটি পুনরায় ওয়াইফাইয়ের সাথে সংযুক্ত না হওয়া পর্যন্ত লাইভ রিডিং আপডেট করা যাচ্ছে না।*`;
        } else {
          assistantReply = isEnglish
            ? `Your ESP32 device (**${primaryDevId}**) is **online and actively transmitting**! 🟢\n\n📊 **Live Telemetry Readings:**\n• Temperature: **${temp}°C**\n• Humidity: **${hum}%**\n• Soil Moisture: **${soilRaw}** (raw analog units)\n• Rain Sensor: **${rainRaw}** (raw analog units)\n• Water Motor (Relay 1): **${deviceStatusResult?.relay1 || "OFF"}**\n• Solenoid Valve (Relay 2): **${deviceStatusResult?.relay2 || "OFF"}**\n\nAll sensors are reporting nominal parameters.`
            : `তোমার ESP32 ডিভাইসটি (**${primaryDevId}**) বর্তমানে **অনলাইনে সচল ও সক্রিয় আছে**! 🟢\n\n📊 **লাইভ সেন্সর রিডিং:**\n• তাপমাত্রা: **${temp}°C**\n• আর্দ্রতা: **${hum}%**\n• মাটির আর্দ্রতা: **${soilRaw}** (র অ্যানালগ মান)\n• রেইন সেন্সর: **${rainRaw}** (র অ্যানালগ মান)\n• পানির মোটর (রিলে ১): **${deviceStatusResult?.relay1 || "OFF"}**\n• সলিনয়েড ভাল্ব (রিলে ২): **${deviceStatusResult?.relay2 || "OFF"}**\n\nসকল সেন্সর স্বাভাবিকভাবে ডেটা পাঠাচ্ছে।`;
        }
      } else if (isWaterQuery) {
        if (isDeviceOnline && latestDeviceTelemetry?.data) {
          const t = latestDeviceTelemetry.data.temperature ?? "N/A";
          const h = latestDeviceTelemetry.data.humidity ?? "N/A";
          const m = latestDeviceTelemetry.data.soilMoistureRaw ?? "N/A";
          assistantReply = isEnglish
            ? `Field Sensor Status:\n• Temperature: ${t}°C | Humidity: ${h}% | Soil Moisture: ${m}\n\nMaintain 2–3 inches of standing water during the active tillering stage. Avoid over-irrigation if rainfall is imminent.`
            : `মাঠের সেন্সরের বর্তমান অবস্থা:\n• তাপমাত্রা: ${t}°C | আর্দ্রতা: ${h}% | মাটির আর্দ্রতা: ${m}\n\nআমন ধানের বাড়ন্ত পর্যায়ে জমিতে ২–৩ ইঞ্চি পানি বজায় রাখুন। বৃষ্টির সম্ভাবনা থাকলে সেচ স্থগিত রাখুন।`;
        } else {
          assistantReply = isEnglish
            ? "For Aman rice, ensure 2–3 inches of standing water during tillering. Check weather radar before running electric irrigation pumps to save electricity and ground water."
            : "আমন ধানে কুশি গজানোর সময় জমিতে ২–৩ ইঞ্চি পানি ধরে রাখা জরুরি। বিদ্যুৎ ও ভূগর্ভস্থ পানি সাশ্রয়ে বৃষ্টির পূর্বাভাস জেনে পাম্প চালান।";
        }
      } else if (isFertilizerQuery) {
        assistantReply = isEnglish
          ? "Standard Nutrient Management (BRRI):\n• Basal: Apply full TSP/DAP, MoP, Gypsum, and Zinc at final plowing.\n• Urea: Apply in 3 equal top-dressings (15 DAT, active tillering, and panicle initiation).\n• Pest Alert: Monitor for Stem Borer and Leaf Folder using light traps and perching."
          : "আমন ধানের সুষম সার ব্যবস্থাপনা (ব্রি নির্দেশিকা):\n• মূল সার (শেষ চাষে): সম্পূর্ণ টিএসপি/ডিএপি, এমওপি, জিপসাম ও দস্তা প্রয়োগ করুন।\n• ইউরিয়া: ৩ কিস্তিতে উপরিপ্রয়োগ করুন (রোপণের ১৫ দিন পর, কুশি আসার সময় এবং কাইচ থোড় আসার ৫-৭ দিন আগে)।\n• বালাই দমন: মাজরা ও পাতা মোড়ানো পোকার জন্য পার্চিং ও আলোর ফাঁদ ব্যবহার করুন।";
      } else if (isGreeting) {
        assistantReply = isEnglish
          ? "Hello! I am Proboy AI 🌱. I'm doing great! How is your farm and crop doing? Feel free to ask about your planting schedule, climate analysis, or IoT sensors."
          : "হ্যালো! আলহামদুলিল্লাহ আমি ভালো আছি। আপনার খামার ও ফসলের কী অবস্থা? ধানের রোপণের সঠিক সময়, জলবায়ু বিশ্লেষণ বা আইওটি ডিভাইসের অবস্থা সম্পর্কে যেকোনো প্রশ্ন করতে পারেন!";
      } else {
        assistantReply = isEnglish
          ? "I am Proboy AI 🌱. I can provide planting dates from your NASA climate analyses, monitor your ESP32 soil sensors, and guide you on precision farming. Please ask about your crop, climate window, or IoT sensors."
          : "আমি Proboy AI 🌱। আমি আপনার সংরক্ষিত জলবায়ু বিশ্লেষণ থেকে রোপণের সময় জানাতে, ESP32 সেন্সরের তথ্য পর্যবেক্ষণ করতে এবং কৃষি পরামর্শ দিতে সক্ষম। আপনার ফসল, রোপণের সময় বা আইওটি ডিভাইস সম্পর্কে প্রশ্নটি জানান।";
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
    const contextStatus: IProboyContextStatus = {
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
