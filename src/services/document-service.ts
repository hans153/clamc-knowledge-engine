import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { fileService } from "./file-service.js";
import { parseQueue, ingestQueue } from "../worker/queues.js";
import type { KnowledgeDocumentRecord, DocumentStatus } from "../types.js";

export class DocumentService {
  async listByProject(projectId: string, userId: string, includeArchived = false): Promise<KnowledgeDocumentRecord[]> {
    let query = "select * from knowledge_documents where project_id = $1 and user_id = $2";
    if (!includeArchived) query += " and archived_at is null";
    query += " order by created_at desc";
    const { rows } = await pool.query(query, [projectId, userId]);
    return rows.map(docFromRow);
  }

  async get(documentId: string, userId: string): Promise<KnowledgeDocumentRecord | null> {
    const { rows } = await pool.query(
      "select * from knowledge_documents where id = $1 and user_id = $2",
      [documentId, userId]
    );
    return rows.length > 0 ? docFromRow(rows[0]) : null;
  }

  async create(
    projectId: string, userId: string,
    data: { title: string; fileName: string; fileType: string; fileSize: number; filePath: string }
  ): Promise<KnowledgeDocumentRecord> {
    const id = randomUUID();
    const { rows } = await pool.query(
      `insert into knowledge_documents (id, project_id, user_id, title, file_name, file_type, file_size, file_path, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'UPLOADING') returning *`,
      [id, projectId, userId, data.title, data.fileName, data.fileType, data.fileSize, data.filePath]
    );
    return docFromRow(rows[0]);
  }

  async startParse(documentId: string, userId: string, parseSettings: Record<string, unknown>): Promise<void> {
    const doc = await this.get(documentId, userId);
    if (!doc) throw new Error("Document not found");

    await pool.query(
      "update knowledge_documents set status = 'PENDING', parse_settings = $1, updated_at = now() where id = $2",
      [JSON.stringify(parseSettings), documentId]
    );

    await parseQueue.add("parse", {
      documentId,
      userId,
      filePath: doc.filePath,
      fileName: doc.fileName,
      fileType: doc.fileType,
      parseSettings,
    });
  }

  async startIngest(documentId: string, userId: string): Promise<void> {
    const doc = await this.get(documentId, userId);
    if (!doc) throw new Error("Document not found");
    if (!doc.markdownContent) throw new Error("No markdown content to ingest");

    await ingestQueue.add("ingest", {
      documentId,
      userId,
      projectId: doc.projectId,
      markdownContent: doc.markdownContent,
      title: doc.title,
    });
  }

  async updateMarkdown(documentId: string, userId: string, markdownContent: string): Promise<void> {
    const doc = await this.get(documentId, userId);
    if (!doc) throw new Error("Document not found");

    const newVersion = doc.version + 1;
    const markdownPath = await fileService.saveMarkdown(documentId, newVersion, markdownContent);

    await pool.query(
      `update knowledge_documents
       set markdown_content = $1, markdown_path = $2, version = $3, updated_at = now()
       where id = $4`,
      [markdownContent, markdownPath, newVersion, documentId]
    );
  }

  async updateStatus(documentId: string, status: DocumentStatus, errorMessage?: string): Promise<void> {
    await pool.query(
      "update knowledge_documents set status = $1, error_message = $2, updated_at = now() where id = $3",
      [status, errorMessage || null, documentId]
    );
  }

  async archive(documentId: string, userId: string, reason: "deleted" | "replaced" = "deleted"): Promise<void> {
    await pool.query(
      `update knowledge_documents
       set status = 'ARCHIVED', archived_at = now(), archived_reason = $1, updated_at = now()
       where id = $2 and user_id = $3`,
      [reason, documentId, userId]
    );
  }
}

function docFromRow(row: Record<string, unknown>): KnowledgeDocumentRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    userId: String(row.user_id),
    title: String(row.title),
    fileName: String(row.file_name),
    fileType: String(row.file_type),
    fileSize: Number(row.file_size),
    filePath: row.file_path == null ? null : String(row.file_path),
    version: Number(row.version),
    status: String(row.status) as DocumentStatus,
    errorMessage: row.error_message == null ? null : String(row.error_message),
    markdownPath: row.markdown_path == null ? null : String(row.markdown_path),
    markdownContent: row.markdown_content == null ? null : String(row.markdown_content),
    sagDocumentId: row.sag_document_id == null ? null : String(row.sag_document_id),
    parseSettings: (row.parse_settings ?? {}) as Record<string, unknown>,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    archivedAt: row.archived_at == null ? null : new Date(String(row.archived_at)).toISOString(),
    archivedReason: row.archived_reason == null ? null : String(row.archived_reason) as "deleted" | "replaced",
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export const documentService = new DocumentService();
