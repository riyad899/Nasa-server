/* eslint-disable @typescript-eslint/no-explicit-any */
import { envVars } from "../../../config/env.js";

export class LLMService {
  private apiKey: string;
  private apiUrl: string = "https://openrouter.ai/api/v1";
  private model: string;

  constructor() {
    this.apiKey = envVars.RAG.OPENROUTER_API_KEY || "";
    this.model =
      envVars.RAG.OPENROUTER_LLM_MODEL ||
      "nvidia/nemotron-3-super-120b-a12b:free";
    if (!this.apiKey) {
      console.warn(
        "⚠️ Warning: OPENROUTER_API_KEY is missing in .env. LLM calls will require an API key."
      );
    }
  }

  async generateResponse(
    prompt: string,
    context: string[] = [],
    asJson: boolean = false,
    customSystemPrompt?: string
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is missing. Please set OPENROUTER_API_KEY in .env");
    }

    try {
      // Build context-grounded augmented prompt for RAG
      let fullPrompt = "";
      if (context.length > 0) {
        fullPrompt = `=== CONTEXT INFORMATION ===\n${context.join(
          "\n\n---\n\n"
        )}\n\n=== USER QUESTION ===\n${prompt}\n\nPlease answer the question thoroughly and accurately based on the context above. If the context does not contain enough information, explain what is known and clarify what is missing without inventing facts.`;
      } else {
        fullPrompt = `=== USER QUESTION ===\n${prompt}\n\nPlease provide an accurate, clear, and comprehensive answer.`;
      }

      if (asJson) {
        fullPrompt += `\n\nReturn ONLY a valid JSON object matching this structure:
{
  "summary": "Direct, concise answer to the question",
  "details": "Detailed explanation or analysis based on the context",
  "keyPoints": ["Key takeaway 1", "Key takeaway 2"],
  "topics": ["Relevant topic or mission 1", "Relevant topic or mission 2"],
  "confidence": "high"
}
Do NOT include markdown fences like \`\`\`json. Return pure JSON only.`;
      }

      const defaultSystemMessage = asJson
        ? "You are an expert AI research assistant for the NASA Space Apps platform. Analyze the provided context and respond ONLY with a valid JSON object. Do not include markdown code blocks or additional conversational text."
        : "You are an expert AI research assistant for the NASA Space Apps platform. Provide accurate, insightful, and well-grounded answers based on the provided scientific and project context. If the provided context is insufficient, state it clearly.";

      const systemMessage = customSystemPrompt || defaultSystemMessage;

      const bodyPayload: any = {
        model: this.model,
        messages: [
          {
            role: "system",
            content: systemMessage,
          },
          {
            role: "user",
            content: fullPrompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      };

      if (
        asJson &&
        (this.model.includes("gpt") || this.model.includes("openai"))
      ) {
        bodyPayload.response_format = { type: "json_object" };
      }

      const response = await fetch(`${this.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://nasa-space-app.local",
          "X-Title": "NASA Space Apps RAG Service",
        },
        body: JSON.stringify(bodyPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMsg =
          errorData?.error?.message || response.statusText || "unknown error";
        throw new Error(`OpenRouter API error: ${response.status} - ${errorMsg}`);
      }

      const data = (await response.json()) as any;
      if (!Array.isArray(data.choices) || data.choices.length === 0) {
        const providerError = data.error?.message || data.error?.code;
        const providerMessage = providerError
          ? `: ${providerError}`
          : data.provider
            ? ` from provider ${data.provider}`
            : "";
        throw new Error(`No response choices returned by LLM model${providerMessage}`);
      }

      const content = data.choices[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        const finishReason = data.choices[0]?.finish_reason || "unknown";
        throw new Error(`LLM returned an empty response (finish reason: ${finishReason})`);
      }

      return content;
    } catch (error) {
      console.error("Error generating LLM response:", error);
      throw error;
    }
  }
}
