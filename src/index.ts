import { buildHttpServer } from "./api/server.js";
import { config } from "./config/env.js";
import { runMigrations } from "./db/migrate.js";
import { startParseWorker } from "./worker/parse-worker.js";
import { startIngestWorker } from "./worker/ingest-worker.js";
import { logger } from "./observability/logger.js";

async function main() {
  // Run DB migrations at startup
  await runMigrations();

  // Start background workers
  startParseWorker();
  startIngestWorker();

  // Start HTTP server
  const app = buildHttpServer();
  await app.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT });
  logger.info({ port: config.HTTP_PORT }, "server started");
}

main().catch((err) => {
  logger.error({ err }, "server failed to start");
  process.exit(1);
});
