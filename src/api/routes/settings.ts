import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { aiSettingsService, type UpdateAiSettingsInput } from "../../services/ai-settings-service.js";
import { authMiddleware } from "../auth.js";

const updateSettingsSchema = z.object({
  embeddingBaseUrl: z.string().url(),
  embeddingModel: z.string().min(1),
  embeddingDimensions: z.literal(1024),
  embeddingApiKey: z.string().optional(),
  clearEmbeddingApiKey: z.boolean().optional(),
  llmBaseUrl: z.string().url(),
  llmModel: z.string().min(1),
  llmApiKey: z.string().optional(),
  clearLlmApiKey: z.boolean().optional(),
  llmTimeoutMs: z.number().int().positive(),
  llmMaxRetries: z.number().int().min(0),
  defaultSearchMode: z.enum(["standard", "fast"]),
  defaultSearchTopK: z.number().int().positive(),
  defaultChunkingMode: z.enum(["heading_strict", "token"]),
  chunkTokenLimit: z.number().int().positive(),
  chunkOverlapTokens: z.number().int().min(0),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/api/settings/ai", async () => {
    const settings = await aiSettingsService.getPublicSettings();
    return settings;
  });

  app.put("/api/settings/ai", async (request) => {
    const input = updateSettingsSchema.parse(request.body);
    const settings = await aiSettingsService.updateSettings(input as UpdateAiSettingsInput);
    return settings;
  });
}
