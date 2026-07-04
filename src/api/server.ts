import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config/env.js";
import { logger } from "../observability/logger.js";
import { authRoutes } from "./routes/auth.js";
import { projectRoutes } from "./routes/projects.js";
import { documentRoutes } from "./routes/documents.js";
import { fileRoutes } from "./routes/files.js";
import { chatRoutes } from "./routes/chat.js";
import { searchRoutes } from "./routes/search.js";
import { graphRoutes } from "./routes/graph.js";
import { settingsRoutes } from "./routes/settings.js";
import { z } from "zod";

const webDistDir = path.join(process.cwd(), "web", "dist");
const webIndexFile = path.join(webDistDir, "index.html");

export function buildHttpServer() {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL, base: { service: "knowledge-engine" } },
  });

  // Plugins
  app.register(fastifyCors, { origin: true, credentials: true });
  app.register(fastifyMultipart, { limits: { fileSize: 500 * 1024 * 1024 } });
  app.register(fastifyCookie);

  // Health check
  app.get("/api/health", async () => ({ ok: true, service: "knowledge-engine" }));

  // Register all route modules
  app.register(authRoutes);
  app.register(projectRoutes);
  app.register(documentRoutes);
  app.register(fileRoutes);
  app.register(chatRoutes);
  app.register(searchRoutes);
  app.register(graphRoutes);
  app.register(settingsRoutes);

  // Serve Vue SPA in production
  if (fs.existsSync(webIndexFile)) {
    app.register(fastifyStatic, { root: webDistDir, prefix: "/" });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "接口不存在" } });
      }
      return reply.type("text/html").send(fs.readFileSync(webIndexFile, "utf8"));
    });
  }

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    const fastifyError = error as { statusCode?: number; message?: string };
    const statusCode = error instanceof z.ZodError ? 400 : fastifyError.statusCode || 500;
    if (statusCode >= 500) {
      logger.error({ error }, "request failed");
    }
    reply.code(statusCode).send({
      error: {
        code: statusCode === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  });

  return app;
}
