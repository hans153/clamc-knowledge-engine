import type { FastifyRequest, FastifyReply } from "fastify";
import { authService } from "../services/auth-service.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    userEmail?: string;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "需要登录" } });
  }
  try {
    const payload = await authService.verifyToken(authHeader.slice(7));
    request.userId = payload.userId;
    request.userEmail = payload.email;
  } catch {
    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已过期" } });
  }
}
