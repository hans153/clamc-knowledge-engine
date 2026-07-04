import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import type { SourceRecord } from "../types.js";

export class ProjectService {
  async list(userId: string, includeArchived = false): Promise<SourceRecord[]> {
    let query = "select * from sources where tenant_id = $1";
    if (!includeArchived) query += " and archived_at is null";
    query += " order by created_at desc";
    const { rows } = await pool.query(query, [userId]);
    return rows.map(sourceFromRow);
  }

  async create(userId: string, name: string, description?: string): Promise<SourceRecord> {
    const id = randomUUID();
    const { rows } = await pool.query(
      `insert into sources (id, tenant_id, name, description) values ($1, $2, $3, $4) returning *`,
      [id, userId, name, description || null]
    );
    return sourceFromRow(rows[0]);
  }

  async get(projectId: string, userId: string): Promise<SourceRecord | null> {
    const { rows } = await pool.query(
      "select * from sources where id = $1 and tenant_id = $2",
      [projectId, userId]
    );
    return rows.length > 0 ? sourceFromRow(rows[0]) : null;
  }

  async update(projectId: string, userId: string, data: { name?: string; description?: string }): Promise<SourceRecord> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (data.name !== undefined) { sets.push(`name = $${idx++}`); values.push(data.name); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); values.push(data.description); }
    sets.push(`updated_at = now()`);
    values.push(projectId, userId);
    const { rows } = await pool.query(
      `update sources set ${sets.join(", ")} where id = $${idx++} and tenant_id = $${idx} returning *`,
      values
    );
    return sourceFromRow(rows[0]);
  }

  async archive(projectId: string, userId: string): Promise<void> {
    await pool.query(
      "update sources set archived_at = now(), updated_at = now() where id = $1 and tenant_id = $2",
      [projectId, userId]
    );
  }

  async restore(projectId: string, userId: string): Promise<void> {
    await pool.query(
      "update sources set archived_at = null, updated_at = now() where id = $1 and tenant_id = $2",
      [projectId, userId]
    );
  }

  async delete(projectId: string, userId: string): Promise<void> {
    await pool.query(
      "delete from sources where id = $1 and tenant_id = $2",
      [projectId, userId]
    );
  }
}

function sourceFromRow(row: Record<string, unknown>): SourceRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    archivedAt: row.archived_at == null ? null : new Date(String(row.archived_at)).toISOString(),
    createdAt: row.created_at == null ? undefined : new Date(String(row.created_at)).toISOString(),
    updatedAt: row.updated_at == null ? undefined : new Date(String(row.updated_at)).toISOString(),
  };
}

export const projectService = new ProjectService();
