import { Queue, type ConnectionOptions } from "bullmq";
import { config } from "../config/env.js";

const connection: ConnectionOptions = {
  url: config.REDIS_URL,
};

export const parseQueue = new Queue("parse-queue", { connection });
export const ingestQueue = new Queue("ingest-queue", { connection });

export { connection };
