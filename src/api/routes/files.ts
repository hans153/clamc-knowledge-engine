import type { FastifyInstance } from "fastify";
import { fileService } from "../../services/file-service.js";
import { documentService } from "../../services/document-service.js";
import { authMiddleware } from "../auth.js";

export async function fileRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/api/files/:documentId/download", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const doc = await documentService.get(documentId, request.userId!);
    if (!doc || !doc.filePath) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "文件不存在" } });
    }
    const fullPath = fileService.getFullPath(doc.filePath);
    const fs = await import("node:fs");
    const stream = fs.createReadStream(fullPath);
    reply.header(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(doc.fileName)}"`
    );
    reply.header("Content-Type", "application/octet-stream");
    return reply.send(stream);
  });
}
