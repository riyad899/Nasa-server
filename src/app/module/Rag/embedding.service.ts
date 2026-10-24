import { envVars } from "../../../config/env.js";

interface OpenRouterEmbeddingResponse {
  data?: Array<{
    embedding: number[];
    index?: number;
  }>;
}

function generateDeterministicVector(text: string, dim: number = 2048): number[] {
  const vec = new Array(dim).fill(0);
  const clean = (text || "").toLowerCase().trim();
  if (clean.length === 0) {
    vec[0] = 1;
    return vec;
  }
  for (let i = 0; i < clean.length; i++) {
    const c1 = clean.charCodeAt(i);
    const c2 = clean.charCodeAt((i + 1) % clean.length);
    const c3 = clean.charCodeAt((i + 2) % clean.length);
    const idx = Math.abs((c1 * 31 + c2 * 17 + c3 * 7) ^ (i * 13)) % dim;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0)) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

export class EmbeddingService {
  private apikey: string;
  private apiUrl: string = "https://openrouter.ai/api/v1";
  private embeddingModel: string;

  constructor() {
    this.apikey = envVars.RAG.OPENROUTER_API_KEY || "";
    this.embeddingModel =
      envVars.RAG.OPENROUTER_EMBEDDING_MODEL ||
      "nvidia/llama-nemotron-embed-vl-1b-v2:free";
    if (!this.apikey) {
      console.warn(
        "⚠️ Warning: OPENROUTER_API_KEY is not set in .env. Using fallback vector generator."
      );
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.apikey) {
      return generateDeterministicVector(text, 2048);
    }

    try {
      const response = await fetch(`${this.apiUrl}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apikey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: text,
          model: this.embeddingModel,
        }),
        signal: AbortSignal.timeout(2500),
      });

      if (!response.ok) {
        return generateDeterministicVector(text, 2048);
      }

      const data = (await response.json()) as OpenRouterEmbeddingResponse;
      if (!data.data || data.data.length === 0 || !Array.isArray(data.data[0].embedding)) {
        return generateDeterministicVector(text, 2048);
      }

      return data.data[0].embedding;
    } catch {
      // Return normalized 2048-dim deterministic vector if remote endpoint times out or fails
      return generateDeterministicVector(text, 2048);
    }
  }
}
