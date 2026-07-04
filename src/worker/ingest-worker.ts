import { Worker } from "bullmq";
import { connection } from "./queues.js";
import { pool } from "../db/pool.js";
import { logger } from "../observability/logger.js";
import type { IngestJobData } from "../types.js";

export function startIngestWorker() {
  const worker = new Worker("ingest-queue", async (job) => {
    const { documentId, projectId, markdownContent, title } = job.data as IngestJobData;

    try {
      await pool.query(
        "update knowledge_documents set status = 'INGESTING', updated_at = now() where id = $1",
        [documentId]
      );
      await job.updateProgress(10);

      // NOTE: We import ingestionService lazily to avoid circular deps.
      // The actual ingestion service will be created in Task 9.
      // For now, this worker will be wired up properly once Task 9 is done.
      // It throws a meaningful error if ingestion service isn't available yet.
      const { ingestionService } = await import("../services/ingestion-service.js");

      const result = await ingestionService.ingestDocument(
        {
          sourceId: projectId,
          title,
          content: markdownContent,
          extract: true,
          waitForCompletion: true,
        },
        "default",
        (progress: { progress: number }) => {
          job.updateProgress(progress.progress);
        }
      );

      await pool.query(
        `update knowledge_documents
         set status = 'READY', sag_document_id = $1, updated_at = now()
         where id = $2`,
        [result.documentId, documentId]
      );

      logger.info({ documentId, sagDocId: result.documentId }, "ingest completed");
      await job.updateProgress(100);
      return { status: "READY", documentId, sagDocumentId: result.documentId };
    } catch (err) {
      logger.error({ documentId, err }, "ingest failed");
      await pool.query(
        "update knowledge_documents set status = 'ERROR', error_message = $1, updated_at = now() where id = $2",
        [err instanceof Error ? err.message : String(err), documentId]
      );
      throw err;
    }
  }, { connection, concurrency: 1 });

  logger.info("ingest worker started");
  return worker;
}
