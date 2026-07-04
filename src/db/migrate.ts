import fs from "node:fs";
import path from "node:path";
import { pool } from "./pool.js";
import { logger } from "../observability/logger.js";

async function migrate() {
  await pool.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const migrationsDir = path.join(process.cwd(), "migrations");
  if (!fs.existsSync(migrationsDir)) {
    logger.warn("no migrations directory found");
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query(
      "select 1 from schema_migrations where name = $1",
      [file]
    );
    if (rows.length > 0) {
      logger.info({ migration: file }, "already applied, skipping");
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    logger.info({ migration: file }, "applying");
    await pool.query(sql);
    await pool.query(
      "insert into schema_migrations (name) values ($1)",
      [file]
    );
    logger.info({ migration: file }, "applied");
  }
}

// Only auto-run when called directly (not on import)
const isMain = process.argv[1]?.endsWith("migrate.js") || process.argv[1]?.endsWith("migrate.ts");
if (isMain) {
  migrate().then(() => pool.end()).catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}

export async function runMigrations(): Promise<void> {
  await migrate();
}
