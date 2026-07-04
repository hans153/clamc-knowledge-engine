import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { documentService } from "../../services/document-service.js";
import { fileService } from "../../services/file-service.js";
import { authMiddleware } from "../auth.js";

const ALLOWED_EXTS = [".pdf", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg", ".webp"];
const ALLOWED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export async function documentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // List documents in a project
  app.get("/api/projects/:projectId/documents", async (request) => {
    const { projectId } = request.params as { projectId: string };
    const query = request.query as { includeArchived?: string };
    const docs = await documentService.listByProject(
      projectId,
      request.userId!,
      query.includeArchived === "true"
    );
    return { documents: docs };
  });

  // Upload document (multipart)
  app.post("/api/projects/:projectId/documents/upload", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const file = await request.file();
    if (!file)
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: "未选择文件" } });

    const ext = file.filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
    if (!ALLOWED_EXTS.includes(ext) && !ALLOWED_MIMES.includes(file.mimetype)) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: "不支持的文件类型" } });
    }

    const buffer = await file.toBuffer();
    const { filePath, fileSize } = await fileService.saveUpload(buffer, file.filename);

    const doc = await documentService.create(projectId, request.userId!, {
      title: file.filename.replace(/\.[^.]+$/, ""),
      fileName: file.filename,
      fileType: file.mimetype,
      fileSize,
      filePath,
    });

    // Auto-start parse after upload
    await documentService.startParse(doc.id, request.userId!, {
      backend: "hybrid-engine",
      parseMethod: "auto",
      lang: "ch",
      formulaEnable: true,
      tableEnable: true,
    });

    return reply.code(201).send({ document: doc });
  });

  // Get document detail
  app.get("/api/documents/:documentId", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const doc = await documentService.get(documentId, request.userId!);
    if (!doc)
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "文档不存在" } });
    return { document: doc };
  });

  // Get document markdown
  app.get("/api/documents/:documentId/markdown", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const doc = await documentService.get(documentId, request.userId!);
    if (!doc)
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "文档不存在" } });
    if (!doc.markdownContent)
      return reply
        .code(404)
        .send({ error: { code: "NOT_FOUND", message: "Markdown 尚未生成" } });
    return { markdown: doc.markdownContent, documentId: doc.id, version: doc.version };
  });

  // Update markdown (after user editing)
  app.put("/api/documents/:documentId/markdown", async (request) => {
    const { documentId } = request.params as { documentId: string };
    const schema = z.object({ markdown: z.string().min(1) });
    const input = schema.parse(request.body);
    await documentService.updateMarkdown(documentId, request.userId!, input.markdown);
    return { ok: true };
  });

  // Trigger SAG ingestion
  app.post("/api/documents/:documentId/ingest", async (request) => {
    const { documentId } = request.params as { documentId: string };
    await documentService.startIngest(documentId, request.userId!);
    return { ok: true, message: "入库任务已加入队列" };
  });

  // Retry parse
  app.post("/api/documents/:documentId/reparse", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const doc = await documentService.get(documentId, request.userId!);
    if (!doc)
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "文档不存在" } });
    await documentService.startParse(
      documentId,
      request.userId!,
      doc.parseSettings as Record<string, unknown>
    );
    return { ok: true, message: "重新解析任务已加入队列" };
  });

  // Get document status
  app.get("/api/documents/:documentId/status", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const doc = await documentService.get(documentId, request.userId!);
    if (!doc)
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "文档不存在" } });
    return {
      id: doc.id,
      status: doc.status,
      errorMessage: doc.errorMessage,
      version: doc.version,
    };
  });

  // Archive document
  app.post("/api/documents/:documentId/archive", async (request) => {
    const { documentId } = request.params as { documentId: string };
    await documentService.archive(documentId, request.userId!, "deleted");
    return { ok: true };
  });
}
