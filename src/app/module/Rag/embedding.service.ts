import { envVars } from "../../../config/env.js";

interface OpenRouterEmbeddingResponse {
  data?: Array<{
    embedding: number[];
    index?: number;
  }>;
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
        "⚠️ Warning: OPENROUTER_API_KEY is not set in .env. RAG embedding calls will require an API key."
      );
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.apikey) {
      throw new Error("OPENROUTER_API_KEY is not set in .env");
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
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenRouter API Error: ${response.status} - ${errorBody}`);
      }

      const data = (await response.json()) as OpenRouterEmbeddingResponse;
      if (!data.data || data.data.length === 0) {
        throw new Error("No embedding data returned from OpenRouter API");
      }

      return data.data[0].embedding;
    } catch (error) {
      console.error("Error generating embedding:", error);
      throw error;
    }
  }
}
