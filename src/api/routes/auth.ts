import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authService } from "../../services/auth-service.js";
import { authMiddleware } from "../auth.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const user = await authService.register(input.email, input.password, input.displayName);
    const token = await authService.generateToken({ userId: user.id, email: user.email });
    return reply.code(201).send({
      user: { id: user.id, email: user.email, displayName: user.displayName },
      token,
    });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const { user, token } = await authService.login(input.email, input.password);
    return { user: { id: user.id, email: user.email, displayName: user.displayName }, token };
  });

  app.get("/api/auth/me", { preHandler: [authMiddleware] }, async (request, reply) => {
    const user = await authService.getUser(request.userId!);
    if (!user) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "用户不存在" } });
    }
    return { user: { id: user.id, email: user.email, displayName: user.displayName } };
  });
}
