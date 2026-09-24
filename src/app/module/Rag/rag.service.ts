/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { EmbeddingService } from "./embedding.service.js";
import { IndexingService, DocumentInput } from "./indexing.service.js";
import { LLMService } from "./llm.service.js";

export class RAGService {
  private embeddingService: EmbeddingService;
  private llmService: LLMService;
  private indexingService: IndexingService;

  constructor() {
    this.embeddingService = new EmbeddingService();
    this.indexingService = new IndexingService();
    this.llmService = new LLMService();
  }

  /**
   * Ingest initial NASA Space knowledge chunks
   */
  async ingestSpaceKnowledge() {
    return this.indexingService.indexSpaceKnowledgeData();
  }

  /**
   * Ingest custom document or knowledge chunk
   */
  async ingestCustomDocument(doc: DocumentInput) {
    return this.indexingService.upsertDocumentEmbedding(doc);
  }

  /**
   * Retrieve relevant documents using cosine distance in pgvector
   */
  async retieveRelevantDocuments(
    query: string,
    limit: number = 5,
    sourceType?: string
  ) {
    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      const vectorLiteral = `[${queryEmbedding.join(",")}]`;

      const results = await prisma.$queryRaw(Prisma.sql`
        SELECT 
          id, 
          "chunkKey", 
          "sourceType", 
          "sourceId", 
          "sourceLabel", 
          content, 
          metadata, 
          "isDeleted", 
          "deletedAt", 
          "createdAt", 
          "updatedAt", 
          1 - (embedding <=> CAST(${vectorLiteral} AS vector)) as similarity
        FROM "document_embeddings"
        WHERE "isDeleted" = false
        ${sourceType ? Prisma.sql`AND "sourceType" = ${sourceType}` : Prisma.empty}
        ORDER BY embedding <=> CAST(${vectorLiteral} AS vector)
        LIMIT ${limit}
      `);

      return results as any[];
    } catch (error) {
      console.error("Error retrieving relevant documents:", error);
      throw error;
    }
  }

  /**
   * Generate RAG augmented answer using retrieved context
   */
  async generateAnswer(
    query: string,
    limit: number = 5,
    sourceType?: string,
    asJson: boolean = false,
    customSystemPrompt?: string
  ) {
    try {
      const relevantDocs = await this.retieveRelevantDocuments(
        query,
        limit,
        sourceType
      );

      // Extract content from documents for context
      const context = (relevantDocs as any[])
        .filter((doc) => doc.content)
        .map((doc) => doc.content);

      const rawAnswer = await this.llmService.generateResponse(
        query,
        context,
        asJson,
        customSystemPrompt
      );

      let parsedAnswer: any = rawAnswer;
      if (asJson && typeof rawAnswer === "string") {
        try {
          let cleaned = rawAnswer.trim();
          if (cleaned.startsWith("```json")) {
            cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
          } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
          }
          parsedAnswer = JSON.parse(cleaned);
        } catch (parseError) {
          console.error("Failed to parse LLM JSON response, fallback to text:", parseError);
          parsedAnswer = {
            summary: rawAnswer,
            raw: rawAnswer,
          };
        }
      }

      return {
        answer: parsedAnswer,
        sources: (relevantDocs as any[]).map((doc) => ({
          id: doc.id,
          chunkKey: doc.chunkKey,
          sourceType: doc.sourceType,
          sourceId: doc.sourceId,
          sourceLabel: doc.sourceLabel,
          content: doc.content,
          similarity: Number(doc.similarity),
          metadata: doc.metadata,
        })),
        contextUsed: context.length > 0,
      };
    } catch (error) {
      console.error("Error generating answer in RAGService:", error);
      throw error;
    }
  }

  /**
   * Get RAG stats: document counts and breakdowns
   */
  async getStats() {
    try {
      const totalDocuments = await prisma.$queryRaw(Prisma.sql`
        SELECT COUNT(*) as count FROM "document_embeddings" WHERE "isDeleted" = false;
      `);

      const sourceTypeCounts = await prisma.$queryRaw(Prisma.sql`
        SELECT "sourceType", COUNT(*) as count 
        FROM "document_embeddings" 
        WHERE "isDeleted" = false 
        GROUP BY "sourceType";
      `);

      return {
        totalActiveDocuments: Number((totalDocuments as any)[0]?.count ?? 0),
        sourceTypeBreakdown: (sourceTypeCounts as any[]).reduce(
          (acc: Record<string, number>, curr: any) => {
            acc[curr.sourceType] = Number(curr.count);
            return acc;
          },
          {}
        ),
        timestamp: new Date(),
      };
    } catch (error) {
      console.error("Error retrieving RAG stats:", error);
      throw error;
    }
  }
}
