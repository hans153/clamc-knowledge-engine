import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { searchService } from "../../services/search-service.js";
import { authMiddleware } from "../auth.js";

const searchSchema = z.object({
  query: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  strategy: z.enum(["vector", "multi"]).optional(),
  searchMode: z.enum(["standard", "fast"]).optional(),
  subStrategy: z.enum(["multi", "multi1", "hopllm"]).optional(),
  topK: z.number().int().positive().optional(),
  returnTrace: z.boolean().optional(),
  multi: z
    .object({
      entityTopK: z.number().int().positive().optional(),
      multiTopK: z.number().int().positive().optional(),
      keySimilarityThreshold: z.number().min(0).max(1).optional(),
      similarityThreshold: z.number().min(0).max(1).optional(),
      maxHops: z.number().int().positive().optional(),
      maxEvents: z.number().int().positive().optional(),
      maxEventsA: z.number().int().positive().optional(),
      maxEventsB: z.number().int().positive().optional(),
      maxHopRetries: z.number().int().positive().optional(),
      rerankTopK: z.number().int().positive().optional(),
      maxSections: z.number().int().positive().optional(),
    })
    .optional(),
});

export async function searchRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.post("/api/search", async (request) => {
    const input = searchSchema.parse(request.body);
    const result = await searchService.search(input);
    return result;
  });
}
