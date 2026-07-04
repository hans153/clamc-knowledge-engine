import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { chatService } from "../../services/chat-service.js";
import { authMiddleware } from "../auth.js";

export async function chatRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/api/projects/:projectId/chat/sessions", async (request) => {
    const { projectId } = request.params as { projectId: string };
    const sessions = await chatService.listSessions(request.userId!, projectId);
    return { sessions };
  });

  app.post("/api/projects/:projectId/chat/sessions", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const schema = z.object({ title: z.string().optional() });
    const input = schema.parse(request.body);
    const session = await chatService.createSession(request.userId!, projectId, input.title);
    return reply.code(201).send({ session });
  });

  app.get("/api/chat/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const detail = await chatService.getSession(sessionId, request.userId!);
    if (!detail)
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
    return detail;
  });

  app.patch("/api/chat/sessions/:sessionId", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const schema = z.object({ title: z.string().min(1) });
    const input = schema.parse(request.body);
    await pool.query(
      "update chat_sessions set title = $1, updated_at = now() where id = $2 and user_id = $3",
      [input.title, sessionId, request.userId!]
    );
    return { ok: true };
  });

  app.delete("/api/chat/sessions/:sessionId", async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    await pool.query("delete from chat_sessions where id = $1 and user_id = $2", [
      sessionId,
      request.userId!,
    ]);
    return { ok: true };
  });

  // SSE streaming chat
  app.post("/api/chat/sessions/:sessionId/messages", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const schema = z.object({ content: z.string().min(1) });
    const input = schema.parse(request.body);

    const detail = await chatService.getSession(sessionId, request.userId!);
    if (!detail)
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "会话不存在" } });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (event: string, data: unknown) => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      const message = await chatService.sendMessage(
        sessionId,
        request.userId!,
        detail.session.projectId,
        input.content,
        (chunk) => send("chunk", { content: chunk })
      );
      send("done", { message });
    } catch (error) {
      send("error", {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.end();
      }
    }
  });
}
