import { Worker } from "bullmq";
import { connection } from "./queues.js";
import { mineruService } from "../services/mineru-service.js";
import { fileService } from "../services/file-service.js";
import { pool } from "../db/pool.js";
import { logger } from "../observability/logger.js";
import type { ParseJobData } from "../types.js";

export function startParseWorker() {
  const worker = new Worker("parse-queue", async (job) => {
    const { documentId, userId, filePath, fileName, fileType, parseSettings } = job.data as ParseJobData;

    try {
      await pool.query(
        "update knowledge_documents set status = 'PARSING', updated_at = now() where id = $1",
        [documentId]
      );
      await job.updateProgress(10);

      const fileBuffer = fileService.readFile(filePath);
      const result = await mineruService.parseFile(fileName, fileBuffer, parseSettings);
      await job.updateProgress(60);

      // Extract zip
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(result.content);
      let mainMd = "";
      let pagesMd = "";

      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const ext = name.split(".").pop()?.toLowerCase();
        const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext ?? "");

        if (isImage) {
          const imgBuffer = Buffer.from(await entry.async("nodebuffer"));
          const imageName = name.split("/").pop() || name;
          await fileService.saveImage(documentId, 1, imageName, imgBuffer);
        } else if (name.endsWith(".md") || name.endsWith(".markdown")) {
          const content = await entry.async("string");
          if (name.includes("_pages")) {
            pagesMd = content;
          } else if (!name.includes("_")) {
            mainMd = content;
          } else {
            mainMd = mainMd || content; // fallback
          }
        }
      }

      const mdContent = mainMd || pagesMd;
      if (!mdContent) {
        throw new Error("MinerU returned no markdown content");
      }

      const { rows } = await pool.query(
        "select version from knowledge_documents where id = $1", [documentId]
      );
      const version = rows[0]?.version ?? 1;
      const markdownPath = await fileService.saveMarkdown(documentId, version, mdContent);

      await pool.query(
        `update knowledge_documents
         set status = 'PARSED', markdown_path = $1, markdown_content = $2, updated_at = now()
         where id = $3`,
        [markdownPath, mdContent, documentId]
      );

      logger.info({ documentId }, "parse completed");
      await job.updateProgress(100);
      return { status: "PARSED", documentId, markdownPath };
    } catch (err) {
      logger.error({ documentId, err }, "parse failed");
      await pool.query(
        "update knowledge_documents set status = 'ERROR', error_message = $1, updated_at = now() where id = $2",
        [err instanceof Error ? err.message : String(err), documentId]
      );
      throw err;
    }
  }, { connection, concurrency: 2 });

  logger.info("parse worker started");
  return worker;
}
