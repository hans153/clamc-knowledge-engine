import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { projectService } from "../../services/project-service.js";
import { pool } from "../../db/pool.js";
import { authMiddleware } from "../auth.js";

export async function projectRoutes(app: FastifyInstance) {
  // All project routes require auth
  app.addHook("preHandler", authMiddleware);

  app.get("/api/projects", async (request) => {
    const query = request.query as { includeArchived?: string };
    const projects = await projectService.list(request.userId!, query.includeArchived === "true");
    return { projects };
  });

  app.post("/api/projects", async (request, reply) => {
    const schema = z.object({ name: z.string().min(1), description: z.string().optional() });
    const input = schema.parse(request.body);
    const project = await projectService.create(request.userId!, input.name, input.description);
    return reply.code(201).send({ project });
  });

  app.get("/api/projects/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await projectService.get(projectId, request.userId!);
    if (!project)
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "项目不存在" } });
    return { project };
  });

  app.patch("/api/projects/:projectId", async (request) => {
    const { projectId } = request.params as { projectId: string };
    const schema = z.object({ name: z.string().min(1).optional(), description: z.string().optional() });
    const input = schema.parse(request.body);
    const project = await projectService.update(projectId, request.userId!, input);
    return { project };
  });

  app.post("/api/projects/:projectId/archive", async (request) => {
    const { projectId } = request.params as { projectId: string };
    await projectService.archive(projectId, request.userId!);
    return { ok: true };
  });

  app.post("/api/projects/:projectId/restore", async (request) => {
    const { projectId } = request.params as { projectId: string };
    await projectService.restore(projectId, request.userId!);
    return { ok: true };
  });

  app.delete("/api/projects/:projectId", async (request) => {
    const { projectId } = request.params as { projectId: string };
    await projectService.delete(projectId, request.userId!);
    return { ok: true };
  });

  app.get("/api/projects/:projectId/stats", async (request) => {
    const { projectId } = request.params as { projectId: string };
    const { rows } = await pool.query(
      `select
        (select count(*) from knowledge_documents where project_id = $1 and archived_at is null) as document_count,
        (select count(*) from source_chunks where source_id = $1) as chunk_count,
        (select count(*) from events where source_id = $1 and deleted_at is null) as event_count,
        (select count(*) from entities where source_id = $1) as entity_count`,
      [projectId]
    );
    const row = rows[0];
    return {
      stats: {
        documentCount: Number(row.document_count),
        chunkCount: Number(row.chunk_count),
        eventCount: Number(row.event_count),
        entityCount: Number(row.entity_count),
      },
    };
  });
}
