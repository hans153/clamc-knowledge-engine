import type { FastifyInstance } from "fastify";
import { getProjectGraph } from "../../db/repositories.js";
import { authMiddleware } from "../auth.js";

export async function graphRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/api/projects/:projectId/graph", async (request) => {
    const { projectId } = request.params as { projectId: string };
    const graph = await getProjectGraph({
      sourceId: projectId,
      tenantId: request.userId!,
    });
    return graph;
  });
}
