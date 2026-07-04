# Knowledge Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a knowledge base management web app where users upload PDFs → MinerU parses to Markdown → SAG builds knowledge graph → Chat Q&A retrieval.

**Architecture:** TypeScript monorepo with Fastify REST API backend + Vue 3 SPA frontend. Async processing via BullMQ workers (MinerU parse → SAG ingest). PostgreSQL+pgvector for business data + vector search, local filesystem for file storage. Docker Compose for offline deployment.

**Tech Stack:** TypeScript 5.7, Fastify 5, Vue 3 + Vite 8 + Tailwind CSS 3, PostgreSQL 16 + pgvector, BullMQ + Redis, Zod, Pino, MinerU API (external HTTP service)

**Reference projects:**
- `~/projects/SAG` — TypeScript backend + React frontend, reuse ingestion/search/graph code
- `~/projects/mineru-web` — Python backend, reference MinerU API client patterns

---

## File Structure Map

```
clamc-knowledge-engine/
├── .env.example                    # Environment template
├── docker-compose.yml              # Full stack orchestration
├── package.json                    # Root workspace
├── tsconfig.json                   # TypeScript config
├── tsconfig.build.json             # Production build config
├── vite.config.ts                  # Frontend build config
├── vitest.config.ts                # Test config
├── tailwind.config.js              # Tailwind config
├── postcss.config.js               # PostCSS config
│
├── migrations/                     # SQL migrations (numbered order)
│   ├── 001_init.sql                # Core SAG schema (from reference)
│   ├── 002_users.sql               # User accounts
│   ├── 003_documents_ext.sql       # Extended document model
│   └── 004_chat_sessions.sql       # Chat session/message tables
│
├── src/                            # Backend source
│   ├── index.ts                    # Entry point (start server + workers)
│   ├── types.ts                    # All TypeScript types (extended from SAG)
│   │
│   ├── config/
│   │   └── env.ts                  # Zod-validated env (extended: auth, mineru, storage paths)
│   │
│   ├── db/
│   │   ├── pool.ts                 # pg Pool singleton
│   │   ├── migrate.ts              # Migration runner (read+execute .sql files)
│   │   ├── seed.ts                 # Seed entity_types
│   │   ├── vector.ts               # Vector literal helpers (from SAG)
│   │   └── repositories.ts         # All DB queries (extended from SAG)
│   │
│   ├── ai/
│   │   ├── llm-client.ts           # OpenAI-compatible LLM client (from SAG)
│   │   ├── embedding-client.ts     # Embedding client (from SAG)
│   │   └── rerank-client.ts        # Rerank client (from SAG)
│   │
│   ├── ingestion/                  # SAG document ingestion
│   │   ├── chunking/
│   │   │   └── markdown.ts         # Markdown chunking (from SAG)
│   │   └── extract/
│   │       └── extractor.ts        # Event/entity extraction (from SAG)
│   │
│   ├── services/
│   │   ├── auth-service.ts         # Registration, login, JWT, CAS placeholder
│   │   ├── file-service.ts         # Local filesystem read/write, path management
│   │   ├── mineru-service.ts       # MinerU API HTTP client
│   │   ├── parse-service.ts        # Orchestrate parse: upload→MinerU→store markdown
│   │   ├── ingestion-service.ts    # SAG ingestion (from SAG, adapted)
│   │   ├── search-service.ts       # Multi-route search (from SAG)
│   │   ├── chat-service.ts         # Multi-turn chat + context-aware retrieval
│   │   ├── project-service.ts      # Project CRUD
│   │   ├── document-service.ts     # Document CRUD + version management
│   │   ├── graph-service.ts        # Graph queries (from SAG)
│   │   └── ai-settings-service.ts  # AI provider settings (from SAG)
│   │
│   ├── worker/
│   │   ├── parse-worker.ts         # BullMQ worker: MinerU parse job processor
│   │   ├── ingest-worker.ts        # BullMQ worker: SAG ingest job processor
│   │   └── queues.ts               # BullMQ queue definitions + job types
│   │
│   ├── api/
│   │   ├── server.ts               # Fastify app, route registration, error handler
│   │   ├── auth.ts                 # Auth middleware (JWT verification)
│   │   └── routes/
│   │       ├── auth.ts             # POST /auth/register, /auth/login, /auth/me
│   │       ├── projects.ts         # CRUD /api/projects
│   │       ├── documents.ts        # CRUD /api/documents, upload, versions
│   │       ├── files.ts            # File download/streaming from local storage
│   │       ├── chat.ts             # POST /api/chat (SSE stream)
│   │       ├── search.ts           # POST /api/search
│   │       ├── graph.ts            # GET /api/projects/:id/graph
│   │       └── settings.ts         # AI settings CRUD
│   │
│   └── observability/
│       └── logger.ts               # Pino logger (from SAG)
│
├── web/                            # Frontend (Vue 3 + Vite + Tailwind)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts                 # Vue app entry
│       ├── App.vue                 # Root component (3-column layout shell)
│       ├── router/
│       │   └── index.ts            # Vue Router routes
│       ├── stores/
│       │   ├── auth.ts             # Auth state (Pinia)
│       │   ├── projects.ts         # Project state
│       │   └── chat.ts             # Chat state
│       ├── api/
│       │   └── client.ts           # Axios/fetch wrapper with auth headers
│       ├── components/
│       │   ├── layout/
│       │   │   ├── NavBar.vue      # Leftmost vertical nav bar
│       │   │   ├── SideBar.vue     # Knowledge base list sidebar
│       │   │   └── MainContent.vue # Content area with tab router
│       │   ├── auth/
│       │   │   ├── LoginPage.vue
│       │   │   └── RegisterPage.vue
│       │   ├── projects/
│       │   │   ├── ProjectList.vue        # Project sidebar list
│       │   │   └── ProjectSettings.vue    # Create/edit project
│       │   ├── documents/
│       │   │   ├── DocumentList.vue       # Document table/list view
│       │   │   ├── DocumentUpload.vue     # Upload dialog with drag-drop
│       │   │   ├── DocumentDetail.vue     # Version history, status
│       │   │   ├── MarkdownEditor.vue     # Preview + edit Markdown
│       │   │   └── ParseStatusBadge.vue   # Status pipeline indicator
│       │   ├── chat/
│       │   │   ├── ChatView.vue           # Chat container
│       │   │   ├── ChatMessage.vue        # Single message bubble
│       │   │   └── ChatInput.vue          # Input box with project selector
│       │   └── graph/
│       │       └── KnowledgeGraph.vue     # Graph visualization
│       └── style.css               # Tailwind directives + global styles
│
├── storage/                        # Local file storage (gitignored)
│   ├── files/                      # Raw uploaded files (PDF, etc.)
│   ├── markdown/                   # Parsed markdown outputs
│   └── images/                     # Extracted images from parsing
│
└── test/                           # Vitest tests
    ├── auth.test.ts
    ├── mineru-service.test.ts
    ├── ingestion-service.test.ts
    ├── search-service.test.ts
    └── chat-service.test.ts
```

---

## Phase 1: Project Scaffold & Database

### Task 1: Initialize project structure

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `.env.example`, `vitest.config.ts`

- [ ] **Step 1: Create package.json with all dependencies**

```json
{
  "name": "knowledge-engine",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently -k -n api,web -c blue,green \"npm:dev:api\" \"npm:dev:web\"",
    "dev:api": "tsx watch src/index.ts",
    "dev:web": "npm --prefix web run dev",
    "build": "npm run build:api && npm run build:web",
    "build:api": "tsc -p tsconfig.build.json",
    "build:web": "npm --prefix web run build",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p web/tsconfig.json --noEmit",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:setup": "npm run db:migrate && npm run seed",
    "seed": "tsx src/db/seed.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/cookie": "^11.0.2",
    "@fastify/cors": "^11.0.0",
    "@fastify/multipart": "^9.0.3",
    "@fastify/static": "^9.1.3",
    "bullmq": "^5.34.0",
    "dotenv": "^16.4.7",
    "fastify": "^5.2.1",
    "gpt-tokenizer": "^3.4.0",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.13.1",
    "pino": "^9.6.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.10.5",
    "@types/pg": "^8.11.10",
    "concurrently": "^10.0.3",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: Create tsconfig.json (NodeNext, ES2022)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create tsconfig.build.json (exclude tests)**

```json
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*.ts"],
  "exclude": ["test/**/*.ts"]
}
```

- [ ] **Step 4: Create .env.example**

```env
NODE_ENV=development
LOG_LEVEL=info
HTTP_HOST=0.0.0.0
HTTP_PORT=4173
DATABASE_URL=postgres://knowledge:knowledge_pass@localhost:5432/knowledge_engine
REDIS_URL=redis://localhost:6379
AUTH_SECRET=change-me-to-a-random-secret
STORAGE_PATH=./storage

# MinerU API
MINERU_API_URL=http://mineru-router:8002
MINERU_API_TIMEOUT_SECONDS=300
MINERU_API_TASK_TIMEOUT_SECONDS=1800

# AI Providers (OpenAI-compatible)
EMBEDDING_DIMENSIONS=1024
EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=https://api.302ai.cn/v1
LLM_MODEL=qwen3.6-flash
LLM_API_KEY=
LLM_BASE_URL=https://api.302ai.cn/v1
LLM_TIMEOUT_MS=60000
LLM_MAX_RETRIES=2
RERANK_BASE_URL=
RERANK_MODEL=qwen3-rerank
RERANK_INSTRUCT=Given a user question, rank SAG event candidates by relevance
DEFAULT_SEARCH_MODE=fast
INGEST_CONCURRENCY=5
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 6: Run npm install**

Run: `npm install`
Expected: dependencies installed

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json tsconfig.build.json .env.example vitest.config.ts
git commit -m "chore: initialize project scaffold with TypeScript + Fastify dependencies"
```

---

### Task 2: Copy SAG reference code (AI clients, chunking, extraction, vector utils)

**Files:**
- Create: `src/ai/llm-client.ts`, `src/ai/embedding-client.ts`, `src/ai/rerank-client.ts`
- Create: `src/ingestion/chunking/markdown.ts`, `src/ingestion/extract/extractor.ts`
- Create: `src/db/vector.ts`, `src/observability/logger.ts`

- [ ] **Step 1: Copy AI clients from SAG**

Copy from `~/projects/SAG/src/ai/` to `src/ai/`:
- `llm-client.ts` — OpenAI-compatible LLM client with local fallback
- `embedding-client.ts` — Embedding client with deterministic local fallback
- `rerank-client.ts` — Rerank client with local fallback

Adapt imports to use local `../config/env.js` and `../observability/logger.js`.

- [ ] **Step 2: Copy chunking and extraction from SAG**

Copy from `~/projects/SAG/src/ingestion/` to `src/ingestion/`:
- `chunking/markdown.ts` — Markdown chunking (heading_strict + token modes)
- `extract/extractor.ts` — Event/entity extraction via LLM

Adapt imports to point at `../../ai/llm-client.js` and `../../types.js`.

- [ ] **Step 3: Copy vector utilities**

Copy `~/projects/SAG/src/db/vector.ts` → `src/db/vector.ts`

- [ ] **Step 4: Copy logger**

Copy `~/projects/SAG/src/observability/logger.ts` → `src/observability/logger.ts`

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (or fix import paths)

- [ ] **Step 6: Commit**

```bash
git add src/ai/ src/ingestion/ src/db/vector.ts src/observability/
git commit -m "chore: copy SAG AI clients, chunking, extraction, vector utils"
```

---

### Task 3: Extended types and config

**Files:**
- Create: `src/types.ts`
- Create: `src/config/env.ts`

- [ ] **Step 1: Create src/types.ts**

Extend SAG's types with new entities for our app:

```typescript
// Re-export all SAG types (copy from reference, with additions below)

// === User & Auth ===
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

// === Document (extended beyond SAG's DocumentRecord) ===
export type DocumentStatus =
  | "UPLOADING"
  | "PENDING"
  | "PARSING"
  | "PARSED"
  | "INGESTING"
  | "READY"
  | "ARCHIVED"
  | "ERROR";

export type DocumentArchivedReason = "deleted" | "replaced";

export interface KnowledgeDocumentRecord {
  id: string;
  projectId: string;       // maps to SAG source_id
  userId: string;
  title: string;
  fileName: string;        // original filename
  fileType: string;        // pdf, docx, etc.
  fileSize: number;        // bytes
  filePath: string | null; // local filesystem path
  version: number;
  status: DocumentStatus;
  errorMessage?: string | null;
  markdownPath?: string | null;     // parsed markdown file path
  markdownContent?: string | null;  // cached markdown text
  sagDocumentId?: string | null;    // linked SAG documents.id
  parseSettings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  archivedAt?: string | null;
  archivedReason?: DocumentArchivedReason | null;
  createdAt: string;
  updatedAt: string;
}

// === Parse Job ===
export interface ParseJobData {
  documentId: string;
  userId: string;
  filePath: string;
  fileName: string;
  fileType: string;
  parseSettings: ParseSettings;
}

export interface ParseSettings {
  backend: string;       // "pipeline" | "vlm-engine" | "hybrid-engine"
  parseMethod: string;   // "auto" | "ocr"
  lang: string;          // "ch", "en"
  formulaEnable: boolean;
  tableEnable: boolean;
}

// === Ingest Job ===
export interface IngestJobData {
  documentId: string;
  userId: string;
  projectId: string;
  markdownContent: string;
  title: string;
}

// === Chat ===
export interface ChatSessionRecord {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: CitationRecord[];
  createdAt: string;
}

export interface CitationRecord {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  heading?: string;
  content: string;
  score: number;
}

// Re-export SAG types
export type { SearchInput, SearchResult, SearchSection, SearchTrace, SearchTraceEvent, SearchProgressEvent } from "./types.js";
// ... (full re-export list from SAG types.ts)
```

- [ ] **Step 2: Create src/config/env.ts**

Extend SAG's env config with our new variables:

```typescript
import "dotenv/config";
import { z } from "zod";

export const SUPPORTED_EMBEDDING_DIMENSIONS = 1024;

const envSchema = z.object({
  // Server
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  HTTP_HOST: z.string().default("0.0.0.0"),
  HTTP_PORT: z.coerce.number().int().positive().default(4173),

  // Database
  DATABASE_URL: z.string().min(1).default("postgres://knowledge:knowledge_pass@localhost:5432/knowledge_engine"),

  // Redis (BullMQ)
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  // Auth
  AUTH_SECRET: z.string().min(16).default("change-me-to-a-random-secret-min-16-chars"),
  AUTH_TOKEN_EXPIRY_HOURS: z.coerce.number().int().positive().default(72),

  // Storage
  STORAGE_PATH: z.string().default("./storage"),

  // MinerU
  MINERU_API_URL: z.string().url().default("http://mineru-router:8002"),
  MINERU_API_TIMEOUT_SECONDS: z.coerce.number().positive().default(300),
  MINERU_API_TASK_TIMEOUT_SECONDS: z.coerce.number().positive().default(1800),

  // AI (from SAG, add our defaults)
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(SUPPORTED_EMBEDDING_DIMENSIONS),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-large"),
  EMBEDDING_API_KEY: z.string().default(""),
  EMBEDDING_BASE_URL: z.string().url().default("https://api.302ai.cn/v1"),
  LLM_MODEL: z.string().min(1).default("qwen3.6-flash"),
  LLM_API_KEY: z.string().default(""),
  LLM_BASE_URL: z.string().url().default("https://api.302ai.cn/v1"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  RERANK_BASE_URL: z.string().url().optional(),
  RERANK_MODEL: z.string().min(1).default("qwen3-rerank"),
  RERANK_INSTRUCT: z.string().min(1).default("Given a user question, rank SAG event candidates by relevance"),
  DEFAULT_SEARCH_MODE: z.enum(["standard", "fast"]).default("fast"),
  INGEST_CONCURRENCY: z.coerce.number().int().positive().max(20).default(5),
});

export type AppConfig = z.infer<typeof envSchema>;
export const config: AppConfig = envSchema.parse(process.env);

export const hasRemoteEmbedding = config.EMBEDDING_API_KEY.trim().length > 0;
export const hasRemoteLlm = config.LLM_API_KEY.trim().length > 0;
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts src/config/env.ts
git commit -m "feat: add extended types and environment config"
```

---

### Task 4: Database pool, migrations, and seed

**Files:**
- Create: `src/db/pool.ts`, `src/db/migrate.ts`, `src/db/seed.ts`
- Create: `migrations/001_init.sql`, `migrations/002_users.sql`, `migrations/003_documents_ext.sql`, `migrations/004_chat_sessions.sql`

- [ ] **Step 1: Create src/db/pool.ts**

```typescript
import pg from "pg";
import { config } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
});

export async function closePool(): Promise<void> {
  await pool.end();
}
```

- [ ] **Step 2: Create src/db/migrate.ts**

```typescript
import fs from "node:fs";
import path from "node:path";
import { pool } from "./pool.js";
import { logger } from "../observability/logger.js";

async function migrate() {
  // Ensure schema_migrations table exists
  await pool.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const migrationsDir = path.join(process.cwd(), "migrations");
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

  await pool.end();
}

// Only auto-run when called directly (not on import)
const isMain = process.argv[1]?.endsWith("migrate.js") || process.argv[1]?.endsWith("migrate.ts");
if (isMain) {
  migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}

export async function runMigrations(): Promise<void> {
  await migrate();
}
```

- [ ] **Step 3: Create migrations/001_init.sql**

Copy `~/projects/SAG/migrations/001_init.sql` — the core SAG schema (sources, documents, document_sections, source_chunks, entity_types, entities, events, event_entities with pgvector extensions and HNSW indexes).

- [ ] **Step 4: Create migrations/002_users.sql**

```sql
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  password_hash text not null,
  display_name text not null default '',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on users (email);
```

- [ ] **Step 5: Create migrations/003_documents_ext.sql**

```sql
-- Extended knowledge documents (separate from SAG's internal documents table)
create table if not exists knowledge_documents (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references sources(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null default 0,
  file_path text,
  version integer not null default 1,
  status text not null default 'UPLOADING',
  error_message text,
  markdown_path text,
  markdown_content text,
  sag_document_id uuid references documents(id) on delete set null,
  parse_settings jsonb not null default '{}',
  metadata jsonb not null default '{}',
  archived_at timestamptz,
  archived_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kd_project_status_idx on knowledge_documents (project_id, status);
create index if not exists kd_user_idx on knowledge_documents (user_id);
create unique index if not exists kd_project_version_unique
  on knowledge_documents (project_id, file_name, version) where archived_at is null;
```

- [ ] **Step 6: Create migrations/004_chat_sessions.sql**

```sql
create table if not exists chat_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid not null references sources(id) on delete cascade,
  title text not null default 'New Chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs_user_idx on chat_sessions (user_id);
create index if not exists cs_project_idx on chat_sessions (project_id);

create table if not exists chat_messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cm_session_idx on chat_messages (session_id, created_at);
```

- [ ] **Step 7: Create src/db/seed.ts**

Copy from `~/projects/SAG/src/db/seed.ts` — seeds the 11 default entity_types.

- [ ] **Step 8: Create docker-compose.yml with PostgreSQL + pgvector + Redis**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: knowledge
      POSTGRES_PASSWORD: knowledge_pass
      POSTGRES_DB: knowledge_engine
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

- [ ] **Step 9: Test migrations run**

Run: `docker compose up -d postgres redis && sleep 3 && npm run db:setup`
Expected: All 4 migrations applied, seed data inserted

- [ ] **Step 10: Commit**

```bash
git add src/db/ migrations/ docker-compose.yml
git commit -m "feat: add database pool, migrations, seed, and Docker Compose infra"
```

---

## Phase 2: Backend Core Services

### Task 5: Auth service

**Files:**
- Create: `src/services/auth-service.ts`, `src/api/auth.ts` (middleware), `src/api/routes/auth.ts`
- Create: `test/auth.test.ts`

- [ ] **Step 1: Write failing test for auth service**

```typescript
// test/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AuthService } from "../src/services/auth-service.js";

describe("AuthService", () => {
  const auth = new AuthService("test-secret-at-least-16");

  it("should hash and verify password", async () => {
    const hash = await auth.hashPassword("mypassword");
    expect(hash).not.toBe("mypassword");
    expect(await auth.verifyPassword("mypassword", hash)).toBe(true);
    expect(await auth.verifyPassword("wrong", hash)).toBe(false);
  });

  it("should generate and verify JWT token", async () => {
    const token = await auth.generateToken({ userId: "test-user", email: "test@test.com" });
    const payload = await auth.verifyToken(token);
    expect(payload.userId).toBe("test-user");
    expect(payload.email).toBe("test@test.com");
  });

  it("should reject invalid token", async () => {
    await expect(auth.verifyToken("bad-token")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/auth.test.ts`
Expected: FAIL — AuthService not defined

- [ ] **Step 3: Implement AuthService**

```typescript
// src/services/auth-service.ts
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { config } from "../config/env.js";
import type { UserRecord } from "../types.js";

function hashPasswordPBKDF2(password: string, salt: string): string {
  // Use crypto.pbkdf2Sync for simplicity (or bcryptjs if available)
  const { pbkdf2Sync } = await_import_crypto();
  return pbkdf2Sync(password, salt, 260000, 64, "sha256").toString("hex");
}

// Actually use Node built-in crypto
import crypto from "node:crypto";

function hash(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 260000, 64, "sha256").toString("hex");
}

export interface TokenPayload {
  userId: string;
  email: string;
}

export class AuthService {
  constructor(private readonly secret: string = config.AUTH_SECRET) {}

  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(32).toString("hex");
    const h = hash(password, salt);
    return `${salt}:${h}`;
  }

  async verifyPassword(password: string, stored: string): Promise<boolean> {
    const [salt, h] = stored.split(":");
    return hash(password, salt) === h;
  }

  async generateToken(payload: TokenPayload): Promise<string> {
    return jwt.sign(payload, this.secret, {
      expiresIn: `${config.AUTH_TOKEN_EXPIRY_HOURS}h`,
    });
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    return jwt.verify(token, this.secret) as TokenPayload;
  }

  async register(email: string, password: string, displayName?: string): Promise<UserRecord> {
    const existing = await pool.query("select id from users where email = $1", [email]);
    if (existing.rows.length > 0) {
      throw new Error("Email already registered");
    }
    const id = randomUUID();
    const passwordHash = await this.hashPassword(password);
    const result = await pool.query(
      `insert into users (id, email, password_hash, display_name)
       values ($1, $2, $3, $4)
       returning id, email, display_name, created_at, updated_at`,
      [id, email, passwordHash, displayName || email.split("@")[0]]
    );
    return userFromRow(result.rows[0]);
  }

  async login(email: string, password: string): Promise<{ user: UserRecord; token: string }> {
    const result = await pool.query("select * from users where email = $1", [email]);
    if (result.rows.length === 0) {
      throw new Error("Invalid email or password");
    }
    const row = result.rows[0];
    const valid = await this.verifyPassword(password, row.password_hash);
    if (!valid) {
      throw new Error("Invalid email or password");
    }
    const user = userFromRow(row);
    const token = await this.generateToken({ userId: user.id, email: user.email });
    return { user, token };
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    const result = await pool.query("select * from users where id = $1", [userId]);
    if (result.rows.length === 0) return null;
    return userFromRow(result.rows[0]);
  }
}

function userFromRow(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    displayName: String(row.display_name || ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export const authService = new AuthService();
```

- [ ] **Step 4: Create auth middleware**

```typescript
// src/api/auth.ts
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
```

- [ ] **Step 5: Create auth routes**

```typescript
// src/api/routes/auth.ts
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
    return reply.code(201).send({ user: { id: user.id, email: user.email, displayName: user.displayName }, token });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const { user, token } = await authService.login(input.email, input.password);
    return { user: { id: user.id, email: user.email, displayName: user.displayName }, token };
  });

  app.get("/api/auth/me", { preHandler: [authMiddleware] }, async (request) => {
    const user = await authService.getUser(request.userId!);
    return { user: { id: user!.id, email: user!.email, displayName: user!.displayName } };
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/auth.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/auth-service.ts src/api/auth.ts src/api/routes/auth.ts test/auth.test.ts
git commit -m "feat: add auth service with JWT registration and login"
```

---

### Task 6: File service (local filesystem)

**Files:**
- Create: `src/services/file-service.ts`

- [ ] **Step 1: Implement FileService**

```typescript
// src/services/file-service.ts
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config/env.js";
import { logger } from "../observability/logger.js";

const BASE = path.resolve(config.STORAGE_PATH);
const DIRS = ["files", "markdown", "images"] as const;

export class FileService {
  constructor() {
    for (const dir of DIRS) {
      const p = path.join(BASE, dir);
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
    }
  }

  /** Save uploaded file, returns storage path relative to BASE */
  async saveUpload(buffer: Buffer, fileName: string): Promise<{ filePath: string; fileSize: number }> {
    const ext = path.extname(fileName);
    const storedName = `${randomUUID()}${ext}`;
    const relativePath = `files/${storedName}`;
    const fullPath = path.join(BASE, relativePath);
    fs.writeFileSync(fullPath, buffer);
    return { filePath: relativePath, fileSize: buffer.length };
  }

  /** Save parsed markdown content */
  async saveMarkdown(documentId: string, version: number, content: string): Promise<string> {
    const relativePath = `markdown/${documentId}/v${version}/content.md`;
    const fullPath = path.join(BASE, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
    return relativePath;
  }

  /** Save images extracted during parsing */
  async saveImage(documentId: string, version: number, imageName: string, buffer: Buffer): Promise<string> {
    const relativePath = `images/${documentId}/v${version}/${imageName}`;
    const fullPath = path.join(BASE, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);
    return relativePath;
  }

  /** Read file content from storage */
  readFile(relativePath: string): Buffer {
    return fs.readFileSync(path.join(BASE, relativePath));
  }

  /** Read markdown content */
  readMarkdown(relativePath: string): string {
    return fs.readFileSync(path.join(BASE, relativePath), "utf8");
  }

  /** Delete document files (all versions) */
  deleteDocumentFiles(documentId: string): void {
    const markdownDir = path.join(BASE, "markdown", documentId);
    const imagesDir = path.join(BASE, "images", documentId);
    for (const dir of [markdownDir, imagesDir]) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }

  /** Get full path for streaming */
  getFullPath(relativePath: string): string {
    const full = path.join(BASE, relativePath);
    // Prevent path traversal
    if (!full.startsWith(BASE)) {
      throw new Error("Invalid file path");
    }
    return full;
  }
}

export const fileService = new FileService();
```

- [ ] **Step 2: Commit**

```bash
git add src/services/file-service.ts
git commit -m "feat: add local filesystem file service"
```

---

### Task 7: MinerU service

**Files:**
- Create: `src/services/mineru-service.ts`
- Create: `test/mineru-service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/mineru-service.test.ts
import { describe, it, expect } from "vitest";
import { MineruService } from "../src/services/mineru-service.js";

describe("MineruService", () => {
  it("should build correct form data", () => {
    const svc = new MineruService({ baseUrl: "http://test:8002" });
    const data = svc.buildFormData({
      backend: "hybrid-engine",
      parseMethod: "auto",
      lang: "ch",
      formulaEnable: true,
      tableEnable: true,
    });
    expect(data.backend).toBe("hybrid-engine");
    expect(data.response_format_zip).toBe("true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/mineru-service.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement MineruService**

Translate `mineru_api.py` to TypeScript:

```typescript
// src/services/mineru-service.ts
import { config } from "../config/env.js";
import { logger } from "../observability/logger.js";
import type { ParseSettings } from "../types.js";

export interface MineruParseResult {
  filename: string;
  content: Buffer;
  contentType: string;
}

export class MineruService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly taskTimeoutMs: number;

  constructor(opts?: { baseUrl?: string; timeoutMs?: number; taskTimeoutMs?: number }) {
    this.baseUrl = (opts?.baseUrl ?? config.MINERU_API_URL).replace(/\/$/, "");
    this.timeoutMs = (opts?.timeoutMs ?? config.MINERU_API_TIMEOUT_SECONDS) * 1000;
    this.taskTimeoutMs = (opts?.taskTimeoutMs ?? config.MINERU_API_TASK_TIMEOUT_SECONDS) * 1000;
  }

  async health(): Promise<{ available: boolean; baseUrl: string; [key: string]: unknown }> {
    try {
      const resp = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) {
        return { available: false, baseUrl: this.baseUrl, error: `HTTP ${resp.status}` };
      }
      const payload = await resp.json();
      return { available: true, baseUrl: this.baseUrl, ...(payload as object) };
    } catch (err) {
      return { available: false, baseUrl: this.baseUrl, error: String(err) };
    }
  }

  async parseFile(
    filename: string,
    fileBuffer: Buffer,
    settings: ParseSettings
  ): Promise<MineruParseResult> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(this.buildFormData(settings))) {
      formData.append(key, value);
    }
    formData.append("files", new Blob([fileBuffer], { type: "application/octet-stream" }), filename);

    const resp = await fetch(`${this.baseUrl}/file_parse`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`MinerU API returned ${resp.status}: ${text}`);
    }

    const content = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get("content-type") ?? "application/zip";
    return { filename, content, contentType };
  }

  buildFormData(settings: ParseSettings): Record<string, string> {
    return {
      backend: settings.backend,
      effort: "high",
      parse_method: settings.parseMethod,
      lang_list: settings.lang,
      formula_enable: String(settings.formulaEnable),
      table_enable: String(settings.tableEnable),
      return_md: "true",
      return_middle_json: "true",
      return_model_output: "true",
      return_content_list: "true",
      return_images: "true",
      response_format_zip: "true",
    };
  }
}

export const mineruService = new MineruService();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/mineru-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/mineru-service.ts test/mineru-service.test.ts
git commit -m "feat: add MinerU API HTTP client service"
```

---

### Task 8: BullMQ queues and workers

**Files:**
- Create: `src/worker/queues.ts`, `src/worker/parse-worker.ts`, `src/worker/ingest-worker.ts`

- [ ] **Step 1: Define queues and job types**

```typescript
// src/worker/queues.ts
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { config } from "../config/env.js";

const connection: ConnectionOptions = {
  url: config.REDIS_URL,
};

export const parseQueue = new Queue("parse-queue", { connection });
export const ingestQueue = new Queue("ingest-queue", { connection });

export { connection };
```

- [ ] **Step 2: Implement parse worker**

```typescript
// src/worker/parse-worker.ts
import { Worker } from "bullmq";
import JSZip from "jszip"; // need to add to deps
import { connection, ingestQueue } from "./queues.js";
import { mineruService } from "../services/mineru-service.js";
import { fileService } from "../services/file-service.js";
import { pool } from "../db/pool.js";
import { logger } from "../observability/logger.js";
import type { ParseJobData } from "../types.js";

export function startParseWorker() {
  const worker = new Worker("parse-queue", async (job) => {
    const { documentId, userId, filePath, fileName, fileType, parseSettings } = job.data as ParseJobData;

    try {
      // Update status to PARSING
      await pool.query("update knowledge_documents set status = 'PARSING', updated_at = now() where id = $1", [documentId]);
      await job.updateProgress(10);

      // Read file from local storage
      const fileBuffer = fileService.readFile(filePath);

      // Call MinerU
      const result = await mineruService.parseFile(fileName, fileBuffer, parseSettings);
      await job.updateProgress(60);

      // Extract zip, find markdown files
      const zip = await JSZip.loadAsync(result.content);
      let mainMd = "";
      let pagesMd = "";

      // Find the main markdown and page markdown
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const content = await entry.async("string");
        if (name.endsWith("_pages.md")) {
          pagesMd = content;
        } else if (name.endsWith(".md") && !name.includes("_pages")) {
          mainMd = content;
        }
        // Extract images
        if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(name)) {
          const imgBuffer = await entry.async("nodebuffer");
          await fileService.saveImage(documentId, 1, name.split("/").pop()!, imgBuffer);
        }
      }

      const mdContent = mainMd || pagesMd;
      if (!mdContent) {
        throw new Error("MinerU returned no markdown content");
      }

      // Save markdown
      const { rows } = await pool.query("select version from knowledge_documents where id = $1", [documentId]);
      const version = rows[0]?.version ?? 1;
      const markdownPath = await fileService.saveMarkdown(documentId, version, mdContent);

      // Update document to PARSED
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
```

Note: We also need to add `jszip` to dependencies.

- [ ] **Step 3: Implement ingest worker**

```typescript
// src/worker/ingest-worker.ts
import { Worker } from "bullmq";
import { connection } from "./queues.js";
import { ingestionService } from "../services/ingestion-service.js";
import { pool } from "../db/pool.js";
import { logger } from "../observability/logger.js";
import type { IngestJobData } from "../types.js";

export function startIngestWorker() {
  const worker = new Worker("ingest-queue", async (job) => {
    const { documentId, projectId, markdownContent, title } = job.data as IngestJobData;

    try {
      // Update status to INGESTING
      await pool.query("update knowledge_documents set status = 'INGESTING', updated_at = now() where id = $1", [documentId]);
      await job.updateProgress(10);

      // Run SAG ingestion
      const result = await ingestionService.ingestDocument(
        {
          sourceId: projectId,
          title,
          content: markdownContent,
          extract: true,
          waitForCompletion: true,
        },
        "default",
        (progress) => {
          job.updateProgress(progress.progress);
        }
      );

      // Link SAG document
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
```

- [ ] **Step 4: Commit**

```bash
git add src/worker/
git commit -m "feat: add BullMQ parse and ingest workers"
```

---

### Task 9: SAG service integrations (ingestion, search, graph)

**Files:**
- Create: `src/services/ingestion-service.ts`, `src/services/search-service.ts`, `src/services/graph-service.ts`
- Create: `src/db/repositories.ts`

- [ ] **Step 1: Copy and adapt SAG services**

Copy from `~/projects/SAG/src/services/`:
- `ingestion-service.ts` → with import path fixes
- `search-service.ts` → with import path fixes
- `graph-service.ts` → with import path fixes

Copy from `~/projects/SAG/src/db/repositories.ts` → `src/db/repositories.ts` (with import path fixes)

All imports should point to local `../db/pool.js`, `../db/vector.js`, `../ai/`, `../config/env.js`, `../types.js`.

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/services/ingestion-service.ts src/services/search-service.ts src/services/graph-service.ts src/db/repositories.ts
git commit -m "feat: integrate SAG ingestion, search, and graph services"
```

---

### Task 10: Project and document services

**Files:**
- Create: `src/services/project-service.ts`, `src/services/document-service.ts`

- [ ] **Step 1: Implement ProjectService**

```typescript
// src/services/project-service.ts
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
```

- [ ] **Step 2: Implement DocumentService**

```typescript
// src/services/document-service.ts
import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { fileService } from "./file-service.js";
import { parseQueue, ingestQueue } from "../worker/queues.js";
import { logger } from "../observability/logger.js";
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
```

- [ ] **Step 3: Commit**

```bash
git add src/services/project-service.ts src/services/document-service.ts
git commit -m "feat: add project and document services"
```

---

### Task 11: Chat service with context-aware retrieval

**Files:**
- Create: `src/services/chat-service.ts`
- Create: `test/chat-service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// test/chat-service.test.ts
import { describe, it, expect } from "vitest";
import { ChatService } from "../src/services/chat-service.js";

describe("ChatService", () => {
  it("should format chat history for context", () => {
    const svc = new ChatService();
    const history = [
      { role: "user" as const, content: "什么是SAG?" },
      { role: "assistant" as const, content: "SAG是一种事件中心的检索系统。" },
    ];
    const formatted = svc.formatHistoryContext(history);
    expect(formatted).toContain("user: 什么是SAG?");
    expect(formatted).toContain("assistant: SAG是一种事件中心的检索系统。");
  });

  it("should build query rewriting prompt", () => {
    const svc = new ChatService();
    const prompt = svc.buildRewritePrompt("它有什么优点？", [
      { role: "user", content: "什么是SAG?" },
      { role: "assistant", content: "SAG是一种事件中心的检索系统。" },
    ]);
    expect(prompt).toContain("它有什么优点？");
    expect(prompt).toContain("SAG是一种事件中心的检索系统");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/chat-service.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ChatService**

```typescript
// src/services/chat-service.ts
import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { searchService } from "./search-service.js";
import { llmClient } from "../ai/llm-client.js";
import { config } from "../config/env.js";
import { logger } from "../observability/logger.js";
import type {
  ChatSessionRecord, ChatMessageRecord, CitationRecord,
  SearchResult, SearchSection
} from "../types.js";

const MAX_HISTORY_ROUNDS = 10;

export class ChatService {
  async createSession(userId: string, projectId: string, title?: string): Promise<ChatSessionRecord> {
    const id = randomUUID();
    const { rows } = await pool.query(
      `insert into chat_sessions (id, user_id, project_id, title) values ($1, $2, $3, $4) returning *`,
      [id, userId, projectId, title || "New Chat"]
    );
    return sessionFromRow(rows[0]);
  }

  async listSessions(userId: string, projectId: string): Promise<ChatSessionRecord[]> {
    const { rows } = await pool.query(
      "select * from chat_sessions where user_id = $1 and project_id = $2 order by updated_at desc",
      [userId, projectId]
    );
    return rows.map(sessionFromRow);
  }

  async getSession(sessionId: string, userId: string): Promise<{ session: ChatSessionRecord; messages: ChatMessageRecord[] } | null> {
    const { rows: sRows } = await pool.query(
      "select * from chat_sessions where id = $1 and user_id = $2", [sessionId, userId]
    );
    if (sRows.length === 0) return null;
    const { rows: mRows } = await pool.query(
      "select * from chat_messages where session_id = $1 order by created_at asc", [sessionId]
    );
    return {
      session: sessionFromRow(sRows[0]),
      messages: mRows.map(msgFromRow),
    };
  }

  async sendMessage(
    sessionId: string, userId: string, projectId: string,
    userMessage: string,
    onChunk?: (chunk: string) => void
  ): Promise<ChatMessageRecord> {
    // 1. Save user message
    const userMsgId = randomUUID();
    await pool.query(
      "insert into chat_messages (id, session_id, role, content) values ($1, $2, 'user', $3)",
      [userMsgId, sessionId, userMessage]
    );

    // 2. Get recent history
    const history = await this.getRecentHistory(sessionId, MAX_HISTORY_ROUNDS);

    // 3. Rewrite query with context
    let searchQuery = userMessage;
    if (history.length > 0 && config.LLM_API_KEY) {
      try {
        searchQuery = await this.rewriteQuery(userMessage, history);
      } catch (err) {
        logger.warn({ err }, "query rewrite failed, using original query");
      }
    }

    // 4. Search
    const searchResult = await searchService.search({
      query: searchQuery,
      sourceIds: [projectId],
      searchMode: config.DEFAULT_SEARCH_MODE,
      topK: 5,
      returnTrace: false,
    });

    // 5. Build answer with LLM
    const citations = this.buildCitations(searchResult);
    const contextMessages = history.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    const answer = await this.generateAnswer(searchResult.sections, contextMessages, userMessage, onChunk);

    // 6. Save assistant message
    const assistantMsgId = randomUUID();
    const { rows } = await pool.query(
      `insert into chat_messages (id, session_id, role, content, citations)
       values ($1, $2, 'assistant', $3, $4) returning *`,
      [assistantMsgId, sessionId, answer, JSON.stringify(citations)]
    );

    // Update session timestamp
    await pool.query("update chat_sessions set updated_at = now() where id = $1", [sessionId]);

    return msgFromRow(rows[0]);
  }

  async generateAnswer(
    sections: SearchSection[],
    history: { role: "user" | "assistant"; content: string }[],
    userMessage: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const context = sections
      .map((s, i) => `[${i + 1}] ${s.heading ?? ""}\n${s.content}`)
      .join("\n\n");

    if (!config.LLM_API_KEY) {
      return `语言模型未配置，以下是检索到的相关内容：\n\n${context}`;
    }

    const systemPrompt = `你是一个知识库问答助手。请基于以下参考资料回答用户问题。如果资料不足以回答，请如实说明。

参考资料：
${context}

规则：
- 用中文回答
- 引用具体来源时标注编号，如 [1]、[2]
- 不要编造资料中没有的信息`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userMessage },
    ];

    return llmClient.chatStream(messages, onChunk);
  }

  buildSystemPrompt(searchResult: SearchResult): string {
    const context = searchResult.sections
      .map((s, i) => `[${i + 1}] ${s.heading ?? ""}\n${s.content}`)
      .join("\n\n");
    return `你是一个知识库问答助手。请基于以下参考资料回答用户问题。如果资料不足以回答，请如实说明。

参考资料：
${context}

规则：
- 用中文回答
- 引用具体来源时标注编号，如 [1]、[2]
- 不要编造资料中没有的信息`;
  }

  buildCitations(searchResult: SearchResult): CitationRecord[] {
    return searchResult.sections.map(s => ({
      chunkId: s.chunkId,
      documentId: s.documentId ?? "",
      documentTitle: "", // Populated by caller if needed
      heading: s.heading,
      content: s.content.slice(0, 200),
      score: s.score,
    }));
  }

  formatHistoryContext(history: { role: string; content: string }[]): string {
    return history.map(m => `${m.role}: ${m.content}`).join("\n");
  }

  buildRewritePrompt(userMessage: string, history: { role: string; content: string }[]): string {
    const context = this.formatHistoryContext(history);
    return `基于以下对话历史，将用户的追问改写为一个独立的检索查询。

对话历史：
${context}

用户追问：${userMessage}

改写后的检索查询：`;
  }

  private async rewriteQuery(userMessage: string, history: { role: string; content: string }[]): Promise<string> {
    const prompt = this.buildRewritePrompt(userMessage, history);
    const rewritten = await llmClient.chat([
      { role: "user", content: prompt },
    ]);
    return rewritten.trim();
  }

  private async getRecentHistory(sessionId: string, maxRounds: number): Promise<{ role: string; content: string }[]> {
    const limit = maxRounds * 2; // user + assistant per round
    const { rows } = await pool.query(
      "select role, content from chat_messages where session_id = $1 order by created_at desc limit $2",
      [sessionId, limit]
    );
    return rows.reverse().map(r => ({ role: String(r.role), content: String(r.content) }));
  }
}

function sessionFromRow(row: Record<string, unknown>): ChatSessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    projectId: String(row.project_id),
    title: String(row.title),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function msgFromRow(row: Record<string, unknown>): ChatMessageRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: String(row.role) as "user" | "assistant" | "system",
    content: String(row.content),
    citations: row.citations ? JSON.parse(String(row.citations)) as CitationRecord[] : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export const chatService = new ChatService();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/chat-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/chat-service.ts test/chat-service.test.ts
git commit -m "feat: add chat service with context-aware multi-turn retrieval"
```

---

### Task 12: Fastify server and all API routes

**Files:**
- Create: `src/api/server.ts`, `src/api/routes/projects.ts`, `src/api/routes/documents.ts`, `src/api/routes/files.ts`, `src/api/routes/chat.ts`, `src/api/routes/search.ts`, `src/api/routes/graph.ts`, `src/api/routes/settings.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Create Fastify server**

```typescript
// src/api/server.ts
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config/env.js";
import { logger } from "../observability/logger.js";
import { authRoutes } from "./routes/auth.js";
import { projectRoutes } from "./routes/projects.js";
import { documentRoutes } from "./routes/documents.js";
import { fileRoutes } from "./routes/files.js";
import { chatRoutes } from "./routes/chat.js";
import { searchRoutes } from "./routes/search.js";
import { graphRoutes } from "./routes/graph.js";
import { settingsRoutes } from "./routes/settings.js";
import { z } from "zod";

const webDistDir = path.join(process.cwd(), "web", "dist");
const webIndexFile = path.join(webDistDir, "index.html");

export function buildHttpServer() {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL, base: { service: "knowledge-engine" } },
  });

  // Plugins
  app.register(fastifyCors, { origin: true, credentials: true });
  app.register(fastifyMultipart, { limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB
  app.register(fastifyCookie);

  // Health
  app.get("/api/health", async () => ({ ok: true, service: "knowledge-engine" }));

  // Routes
  app.register(authRoutes);
  app.register(projectRoutes);
  app.register(documentRoutes);
  app.register(fileRoutes);
  app.register(chatRoutes);
  app.register(searchRoutes);
  app.register(graphRoutes);
  app.register(settingsRoutes);

  // Serve SPA in production
  if (fs.existsSync(webIndexFile)) {
    app.register(fastifyStatic, { root: webDistDir, prefix: "/" });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "接口不存在" } });
      }
      return reply.type("text/html").send(fs.readFileSync(webIndexFile, "utf8"));
    });
  }

  // Error handler
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error instanceof z.ZodError ? 400 : error.statusCode || 500;
    if (statusCode >= 500) {
      logger.error({ error }, "request failed");
    }
    reply.code(statusCode).send({
      error: {
        code: statusCode === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  });

  return app;
}
```

- [ ] **Step 2: Create src/index.ts entry point**

```typescript
import { buildHttpServer } from "./api/server.js";
import { config } from "./config/env.js";
import { runMigrations } from "./db/migrate.js";
import { startParseWorker } from "./worker/parse-worker.js";
import { startIngestWorker } from "./worker/ingest-worker.js";
import { logger } from "./observability/logger.js";

async function main() {
  // Run DB migrations
  await runMigrations();

  // Start workers
  startParseWorker();
  startIngestWorker();

  // Start HTTP
  const app = buildHttpServer();
  await app.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT });
  logger.info({ port: config.HTTP_PORT }, "server started");
}

main().catch((err) => {
  logger.error({ err }, "server failed to start");
  process.exit(1);
});
```

- [ ] **Step 3: Create project routes**

```typescript
// src/api/routes/projects.ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { projectService } from "../../services/project-service.js";
import { authMiddleware } from "../auth.js";

export async function projectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/api/projects", async (request) => {
    const projects = await projectService.list(request.userId!);
    return { projects };
  });

  app.post("/api/projects", async (request, reply) => {
    const schema = z.object({ name: z.string().min(1), description: z.string().optional() });
    const input = schema.parse(request.body);
    const project = await projectService.create(request.userId!, input.name, input.description);
    return reply.code(201).send({ project });
  });

  app.patch("/api/projects/:projectId", async (request) => {
    const schema = z.object({ name: z.string().min(1).optional(), description: z.string().optional() });
    const input = schema.parse(request.body);
    const { projectId } = request.params as { projectId: string };
    const project = await projectService.update(projectId, request.userId!, input);
    return { project };
  });

  app.post("/api/projects/:projectId/archive", async (request) => {
    const { projectId } = request.params as { projectId: string };
    await projectService.archive(projectId, request.userId!);
    return { ok: true };
  });

  app.post("/api/projects/:projectId/restore", async (request) => {
    const { projectId } = request.params as { projectId: string };
    await projectService.restore(projectId, request.userId!);
    return { ok: true };
  });

  app.delete("/api/projects/:projectId", async (request) => {
    const { projectId } = request.params as { projectId: string };
    await projectService.delete(projectId, request.userId!);
    return { ok: true };
  });
}
```

- [ ] **Step 4: Create document routes**

```typescript
// src/api/routes/documents.ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { documentService } from "../../services/document-service.js";
import { fileService } from "../../services/file-service.js";
import { authMiddleware } from "../auth.js";
import { logger } from "../../observability/logger.js";

export async function documentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // List documents in a project
  app.get("/api/projects/:projectId/documents", async (request) => {
    const { projectId } = request.params as { projectId: string };
    const query = request.query as { includeArchived?: string };
    const docs = await documentService.listByProject(projectId, request.userId!, query.includeArchived === "true");
    return { documents: docs };
  });

  // Upload document
  app.post("/api/projects/:projectId/documents/upload", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: "未选择文件" } });
    }

    // Validate file type
    const allowedExtensions = [".pdf", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg", ".webp"];
    const allowedMimes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/png", "image/jpeg", "image/webp",
    ];
    const ext = file.filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
    if (!allowedExtensions.includes(ext) && !allowedMimes.includes(file.mimetype)) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: "不支持的文件类型" } });
    }

    const buffer = await file.toBuffer();
    const { filePath, fileSize } = await fileService.saveUpload(buffer, file.filename);

    const doc = await documentService.create(projectId, request.userId!, {
      title: file.filename.replace(/\.[^.]+$/, ""),
      fileName: file.filename,
      fileType: file.mimetype,
      fileSize,
      filePath,
    });

    // Auto-start parse
    await documentService.startParse(doc.id, request.userId!, {
      backend: "hybrid-engine",
      parseMethod: "auto",
      lang: "ch",
      formulaEnable: true,
      tableEnable: true,
    });

    return reply.code(201).send({ document: doc });
  });

  // Get document detail
  app.get("/api/documents/:documentId", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const doc = await documentService.get(documentId, request.userId!);
    if (!doc) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "文档不存在" } });
    }
    return { document: doc };
  });

  // Get document markdown
  app.get("/api/documents/:documentId/markdown", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const doc = await documentService.get(documentId, request.userId!);
    if (!doc) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "文档不存在" } });
    }
    if (!doc.markdownContent) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Markdown 尚未生成" } });
    }
    return { markdown: doc.markdownContent, documentId: doc.id, version: doc.version };
  });

  // Update markdown (after user editing)
  app.put("/api/documents/:documentId/markdown", async (request) => {
    const { documentId } = request.params as { documentId: string };
    const schema = z.object({ markdown: z.string().min(1) });
    const input = schema.parse(request.body);
    await documentService.updateMarkdown(documentId, request.userId!, input.markdown);
    return { ok: true };
  });

  // Trigger SAG ingestion
  app.post("/api/documents/:documentId/ingest", async (request) => {
    const { documentId } = request.params as { documentId: string };
    await documentService.startIngest(documentId, request.userId!);
    return { ok: true, message: "入库任务已加入队列" };
  });

  // Retry parse
  app.post("/api/documents/:documentId/reparse", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const doc = await documentService.get(documentId, request.userId!);
    if (!doc) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "文档不存在" } });
    }
    await documentService.startParse(documentId, request.userId!, doc.parseSettings as Record<string, unknown>);
    return { ok: true, message: "重新解析任务已加入队列" };
  });

  // Get document status
  app.get("/api/documents/:documentId/status", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const doc = await documentService.get(documentId, request.userId!);
    if (!doc) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "文档不存在" } });
    }
    return { id: doc.id, status: doc.status, errorMessage: doc.errorMessage, version: doc.version };
  });

  // Archive document
  app.post("/api/documents/:documentId/archive", async (request) => {
    const { documentId } = request.params as { documentId: string };
    await documentService.archive(documentId, request.userId!, "deleted");
    return { ok: true };
  });
}
```

- [ ] **Step 5: Create file routes (for PDF preview/download)**

```typescript
// src/api/routes/files.ts
import type { FastifyInstance } from "fastify";
import { fileService } from "../../services/file-service.js";
import { documentService } from "../../services/document-service.js";
import { authMiddleware } from "../auth.js";

export async function fileRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/api/files/:documentId/download", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const doc = await documentService.get(documentId, request.userId!);
    if (!doc || !doc.filePath) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "文件不存在" } });
    }
    const fullPath = fileService.getFullPath(doc.filePath);
    const fs = await import("node:fs");
    const stream = fs.createReadStream(fullPath);
    reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
    reply.header("Content-Type", "application/octet-stream");
    return reply.send(stream);
  });
}
```

- [ ] **Step 6: Create chat routes (SSE streaming)**

```typescript
// src/api/routes/chat.ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { chatService } from "../../services/chat-service.js";
import { authMiddleware } from "../auth.js";

export async function chatRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  app.get("/api/projects/:projectId/chat/sessions", async (request) => {
    const { projectId } = request.params as { projectId: string };
    const sessions = await chatService.listSessions(request.userId!, projectId);
    return { sessions };
  });

  app.post("/api/projects/:projectId/chat/sessions", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const schema = z.object({ title: z.string().optional() });
    const input = schema.parse(request.body);
    const session = await chatService.createSession(request.userId!, projectId, input.title);
    return reply.code(201).send({ session });
  });

  app.get("/api/chat/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const detail = await chatService.getSession(sessionId, request.userId!);
    if (!detail) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
    }
    return detail;
  });

  app.post("/api/chat/sessions/:sessionId/messages", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const schema = z.object({ content: z.string().min(1) });
    const input = schema.parse(request.body);

    // Get session to find projectId
    const detail = await chatService.getSession(sessionId, request.userId!);
    if (!detail) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const send = (event: string, data: unknown) => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      const message = await chatService.sendMessage(
        sessionId,
        request.userId!,
        detail.session.projectId,
        input.content,
        (chunk) => send("chunk", { content: chunk })
      );
      send("done", { message });
    } catch (error) {
      send("error", { message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.end();
      }
    }
  });

  // Update session title
  app.patch("/api/chat/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const schema = z.object({ title: z.string().min(1) });
    const input = schema.parse(request.body);
    await pool.query(
      "update chat_sessions set title = $1, updated_at = now() where id = $2 and user_id = $3",
      [input.title, sessionId, request.userId!]
    );
    return { ok: true };
  });

  // Delete session
  app.delete("/api/chat/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    await pool.query(
      "delete from chat_sessions where id = $1 and user_id = $2",
      [sessionId, request.userId!]
    );
    return { ok: true };
  });
}
```

- [ ] **Step 7: Create search, graph, and settings routes**

Following the same pattern, create:
- `src/api/routes/search.ts` — `POST /api/search` wrapping searchService.search()
- `src/api/routes/graph.ts` — `GET /api/projects/:id/graph` wrapping graph queries
- `src/api/routes/settings.ts` — AI provider settings CRUD (from SAG pattern)

- [ ] **Step 8: Commit**

```bash
git add src/api/ src/index.ts
git commit -m "feat: add Fastify server with all API routes"
```

---

## Phase 3: Frontend (Vue 3)

### Task 13: Initialize Vue 3 frontend project

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`, `web/src/main.ts`, `web/src/App.vue`, `web/src/style.css`, `web/src/router/index.ts`

- [ ] **Step 1: Create web/package.json**

```json
{
  "name": "knowledge-engine-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "vue": "^3.5.0",
    "vue-router": "^4.5.0",
    "pinia": "^2.3.0",
    "axios": "^1.7.0",
    "@vueuse/core": "^12.0.0",
    "marked": "^14.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.5.0",
    "autoprefixer": "^10.4.0"
  }
}
```

- [ ] **Step 2: Create web/vite.config.ts**

```typescript
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4173",
    },
  },
});
```

- [ ] **Step 3: Create web/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Knowledge Engine</title>
  </head>
  <body class="bg-gray-50">
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Create web/src/main.ts**

```typescript
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router/index.js";
import "./style.css";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
```

- [ ] **Step 5: Create web/src/router/index.ts**

```typescript
import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "Login", component: () => import("../components/auth/LoginPage.vue") },
    { path: "/register", name: "Register", component: () => import("../components/auth/RegisterPage.vue") },
    {
      path: "/",
      component: () => import("../App.vue"),
      children: [
        { path: "", redirect: "/knowledge" },
        {
          path: "knowledge",
          name: "Knowledge",
          component: () => import("../components/layout/MainContent.vue"),
        },
      ],
    },
  ],
});
```

- [ ] **Step 6: Create web/src/style.css (Tailwind)**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create tailwind.config.js and postcss.config.js (project root)**

```javascript
// tailwind.config.js
export default {
  content: ["./web/src/**/*.{vue,ts,tsx}", "./web/index.html"],
  theme: { extend: {} },
  plugins: [],
};

// postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 8: Install and verify**

Run: `cd web && npm install && cd .. && npm install`
Run: `npx tsc -p web/tsconfig.json --noEmit`
Expected: No errors (or expected unresolved module errors for components not yet created)

- [ ] **Step 9: Commit**

```bash
git add web/ tailwind.config.js postcss.config.js
git commit -m "feat: initialize Vue 3 + Vite + Tailwind frontend"
```

---

### Task 14: Three-column layout shell

**Files:**
- Create: `web/src/App.vue`, `web/src/components/layout/NavBar.vue`, `web/src/components/layout/SideBar.vue`, `web/src/components/layout/MainContent.vue`

- [ ] **Step 1: Create NavBar.vue (leftmost vertical nav)**

```vue
<!-- web/src/components/layout/NavBar.vue -->
<template>
  <nav class="w-14 bg-gray-900 flex flex-col items-center py-4 gap-4">
    <router-link to="/knowledge" class="nav-icon" title="知识库">
      <span class="text-xl">📚</span>
    </router-link>
    <!-- Future nav items go here -->
    <div class="flex-1" />
    <router-link to="/settings" class="nav-icon" title="设置">
      <span class="text-lg">⚙</span>
    </router-link>
  </nav>
</template>

<style scoped>
.nav-icon {
  @apply w-10 h-10 flex items-center justify-center rounded-lg
         text-white hover:bg-gray-700 transition-colors;
}
</style>
```

- [ ] **Step 2: Create SideBar.vue (project list)**

```vue
<!-- web/src/components/layout/SideBar.vue -->
<template>
  <aside class="w-60 bg-white border-r border-gray-200 flex flex-col">
    <div class="p-4 border-b">
      <h2 class="font-semibold text-gray-700">知识库</h2>
    </div>
    <ProjectList />
    <div class="p-3 mt-auto border-t">
      <span class="text-sm text-gray-500 truncate block">{{ userEmail }}</span>
      <button @click="logout" class="text-sm text-red-500 hover:underline mt-1">退出登录</button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useAuthStore } from "../../stores/auth.js";
import { useProjectsStore } from "../../stores/projects.js";
import ProjectList from "../projects/ProjectList.vue";
import { useRouter } from "vue-router";

const auth = useAuthStore();
const projectsStore = useProjectsStore();
const router = useRouter();
const userEmail = auth.user?.email ?? "";

projectsStore.fetchProjects();

function logout() {
  auth.logout();
  router.push("/login");
}
</script>
```

- [ ] **Step 3: Create MainContent.vue (tab-based content area)**

```vue
<!-- web/src/components/layout/MainContent.vue -->
<template>
  <div class="flex-1 flex flex-col">
    <!-- Tabs -->
    <div class="flex border-b bg-white px-4 gap-0">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="[
          'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
          activeTab === tab.id
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700',
        ]"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="flex-1 overflow-auto">
      <DocumentList v-if="activeTab === 'documents'" :projectId="projectId" />
      <ChatView v-else-if="activeTab === 'chat'" :projectId="projectId" />
      <KnowledgeGraph v-else-if="activeTab === 'graph'" :projectId="projectId" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useProjectsStore } from "../../stores/projects.js";
import DocumentList from "../documents/DocumentList.vue";
import ChatView from "../chat/ChatView.vue";
import KnowledgeGraph from "../graph/KnowledgeGraph.vue";

const projectsStore = useProjectsStore();
const projectId = computed(() => projectsStore.activeProjectId ?? "");

const tabs = [
  { id: "documents", label: "文档" },
  { id: "chat", label: "问答" },
  { id: "graph", label: "图谱" },
];
const activeTab = ref("documents");
</script>
```

- [ ] **Step 4: Create App.vue (root layout)**

```vue
<!-- web/src/App.vue -->
<template>
  <div v-if="!auth.isAuthenticated" class="h-screen flex items-center justify-center">
    <router-view />
  </div>
  <div v-else class="h-screen flex">
    <NavBar />
    <SideBar />
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from "./stores/auth.js";
import NavBar from "./components/layout/NavBar.vue";
import SideBar from "./components/layout/SideBar.vue";

const auth = useAuthStore();
</script>
```

- [ ] **Step 5: Commit**

```bash
git add web/src/App.vue web/src/components/layout/
git commit -m "feat: add three-column layout shell with NavBar, SideBar, MainContent"
```

---

### Task 15: Auth pages and auth store

**Files:**
- Create: `web/src/stores/auth.ts`, `web/src/stores/projects.ts`, `web/src/components/auth/LoginPage.vue`, `web/src/components/auth/RegisterPage.vue`, `web/src/api/client.ts`

- [ ] **Step 1: Create projects store (needed by layout for activeProjectId)**

```typescript
// web/src/stores/projects.ts
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import api from "../api/client.js";

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
}

export const useProjectsStore = defineStore("projects", () => {
  const projects = ref<Project[]>([]);
  const activeProjectId = ref<string | null>(null);
  const activeProject = computed(() => projects.value.find(p => p.id === activeProjectId.value) ?? null);

  async function fetchProjects() {
    const { data } = await api.get("/projects");
    projects.value = data.projects;
    if (!activeProjectId.value && projects.value.length > 0) {
      activeProjectId.value = projects.value[0].id;
    }
  }

  async function createProject(name: string, description?: string) {
    const { data } = await api.post("/projects", { name, description });
    projects.value.unshift(data.project);
    activeProjectId.value = data.project.id;
    return data.project;
  }

  function selectProject(projectId: string) {
    activeProjectId.value = projectId;
  }

  return { projects, activeProjectId, activeProject, fetchProjects, createProject, selectProject };
});
```

- [ ] **Step 2: Create API client**

```typescript
// web/src/api/client.ts
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
```

- [ ] **Step 2: Create auth store (Pinia)**

```typescript
// web/src/stores/auth.ts
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import api from "../api/client.js";

interface User {
  id: string;
  email: string;
  displayName: string;
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem("token"));
  const isAuthenticated = computed(() => !!token.value);

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    token.value = data.token;
    user.value = data.user;
    localStorage.setItem("token", data.token);
  }

  async function register(email: string, password: string, displayName?: string) {
    const { data } = await api.post("/auth/register", { email, password, displayName });
    token.value = data.token;
    user.value = data.user;
    localStorage.setItem("token", data.token);
  }

  async function fetchMe() {
    if (!token.value) return;
    try {
      const { data } = await api.get("/auth/me");
      user.value = data.user;
    } catch {
      logout();
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem("token");
  }

  return { user, token, isAuthenticated, login, register, fetchMe, logout };
});
```

- [ ] **Step 3: Create LoginPage.vue and RegisterPage.vue**

Simple form components with email + password inputs, calling auth store methods.

- [ ] **Step 4: Commit**

```bash
git add web/src/stores/ web/src/api/ web/src/components/auth/
git commit -m "feat: add auth pages, store, and API client"
```

---

### Task 16: Document management components

**Files:**
- Create: `web/src/components/documents/DocumentList.vue`, `DocumentUpload.vue`, `DocumentDetail.vue`, `MarkdownEditor.vue`, `ParseStatusBadge.vue`
- Create: `web/src/stores/documents.ts`

- [ ] **Step 1: Create documents store**

```typescript
// web/src/stores/documents.ts
import { defineStore } from "pinia";
import { ref } from "vue";
import api from "../api/client.js";

export interface KnowledgeDocument {
  id: string;
  projectId: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  version: number;
  status: string;
  markdownContent?: string;
  createdAt: string;
  updatedAt: string;
}

export const useDocumentsStore = defineStore("documents", () => {
  const documents = ref<KnowledgeDocument[]>([]);
  const loading = ref(false);

  async function fetchDocuments(projectId: string) {
    loading.value = true;
    try {
      const { data } = await api.get(`/projects/${projectId}/documents`);
      documents.value = data.documents;
    } finally {
      loading.value = false;
    }
  }

  async function uploadDocument(projectId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post(`/projects/${projectId}/documents/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    documents.value.unshift(data.document);
    return data.document;
  }

  async function getMarkdown(documentId: string) {
    const { data } = await api.get(`/documents/${documentId}/markdown`);
    return data;
  }

  async function updateMarkdown(documentId: string, markdown: string) {
    await api.put(`/documents/${documentId}/markdown`, { markdown });
  }

  async function startIngest(documentId: string) {
    await api.post(`/documents/${documentId}/ingest`);
  }

  async function archiveDocument(documentId: string) {
    await api.post(`/documents/${documentId}/archive`);
    documents.value = documents.value.filter(d => d.id !== documentId);
  }

  return { documents, loading, fetchDocuments, uploadDocument, getMarkdown, updateMarkdown, startIngest, archiveDocument };
});
```

- [ ] **Step 2: Create DocumentList.vue**

Table view showing document name, status badge, file type, version, actions (preview markdown, edit, ingest, archive).

- [ ] **Step 3: Create DocumentUpload.vue**

Upload dialog/modal with drag-and-drop, file type validation (pdf, docx, pptx, xlsx, png, jpg), auto-triggers parse on upload.

- [ ] **Step 4: Create MarkdownEditor.vue**

Split-pane view: left = rendered Markdown preview (using `marked`), right = editable textarea. Save button triggers `updateMarkdown()`.

- [ ] **Step 5: Create ParseStatusBadge.vue**

Visual indicator showing the status pipeline:
```
UPLOADING → PENDING → PARSING → PARSED → INGESTING → READY
```
with color-coded badges and error state.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/documents/ web/src/stores/documents.ts
git commit -m "feat: add document list, upload, markdown editor, and status badge"
```

---

### Task 17: Chat interface

**Files:**
- Create: `web/src/components/chat/ChatView.vue`, `ChatMessage.vue`, `ChatInput.vue`
- Create: `web/src/stores/chat.ts`

- [ ] **Step 1: Create chat store**

```typescript
// web/src/stores/chat.ts
import { defineStore } from "pinia";
import { ref } from "vue";
import api from "../api/client.js";

export interface ChatSession {
  id: string;
  projectId: string;
  title: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: string;
}

export interface Citation {
  chunkId: string;
  heading?: string;
  content: string;
  score: number;
}

export const useChatStore = defineStore("chat", () => {
  const sessions = ref<ChatSession[]>([]);
  const activeSessionId = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const streaming = ref(false);

  async function fetchSessions(projectId: string) {
    const { data } = await api.get(`/projects/${projectId}/chat/sessions`);
    sessions.value = data.sessions;
  }

  async function createSession(projectId: string, title?: string) {
    const { data } = await api.post(`/projects/${projectId}/chat/sessions`, { title });
    sessions.value.unshift(data.session);
    activeSessionId.value = data.session.id;
    messages.value = [];
    return data.session;
  }

  async function fetchMessages(sessionId: string) {
    const { data } = await api.get(`/chat/sessions/${sessionId}`);
    messages.value = data.messages;
  }

  async function sendMessage(sessionId: string, content: string, onChunk: (text: string) => void): Promise<void> {
    streaming.value = true;
    // Add user message immediately
    messages.value.push({ id: "", role: "user", content, createdAt: new Date().toISOString() });

    // Placeholder for assistant
    const assistantIdx = messages.value.length;
    messages.value.push({ id: "", role: "assistant", content: "", createdAt: "" });

    const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: JSON.stringify({ content }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events
      for (const line of buffer.split("\n")) {
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));
          if (data.content) {
            messages.value[assistantIdx].content += data.content;
            onChunk(data.content);
          }
        }
      }
      buffer = "";
    }

    streaming.value = false;
    await fetchMessages(sessionId);
  }

  return { sessions, activeSessionId, messages, streaming, fetchSessions, createSession, fetchMessages, sendMessage };
});
```

- [ ] **Step 2: Create ChatView.vue**

Full chat interface with message list (scrollable), input area at bottom, session selector in sidebar area.

- [ ] **Step 3: Create ChatMessage.vue**

Message bubble with role-based styling. Assistant messages show citations as expandable footnotes.

- [ ] **Step 4: Create ChatInput.vue**

Textarea with auto-resize, Enter to send, Shift+Enter for newline. Optional project selector if not already in a project context.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/chat/ web/src/stores/chat.ts
git commit -m "feat: add chat interface with SSE streaming and citations"
```

---

### Task 18: Knowledge graph visualization

**Files:**
- Create: `web/src/components/graph/KnowledgeGraph.vue`

- [ ] **Step 1: Implement interactive graph visualization**

Since we can't use `@xyflow/react` (React-specific), implement a canvas-based or SVG-based force-directed graph using D3.js or a Vue-compatible library.

Options:
- Use `d3-force` directly for layout + SVG rendering
- Use `v-network-graph` (Vue-native graph visualization)
- Use `vis-network` with Vue wrapper

Simplest approach for MVP: render entities as nodes and events/relations as edges using SVG with simple force layout.

```vue
<!-- web/src/components/graph/KnowledgeGraph.vue -->
<template>
  <div class="h-full p-4">
    <div v-if="loading" class="flex items-center justify-center h-full">
      <span class="text-gray-400">加载图谱数据...</span>
    </div>
    <div v-else ref="container" class="w-full h-full border rounded-lg bg-white relative">
      <svg :width="width" :height="height">
        <!-- Edges -->
        <line
          v-for="edge in edges" :key="edge.id"
          :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
          stroke="#ccc" stroke-width="1"
        />
        <!-- Entity nodes -->
        <g v-for="node in nodes" :key="node.id" :transform="`translate(${node.x}, ${node.y})`">
          <circle :r="node.radius" :fill="entityColor(node.type)" stroke="#fff" stroke-width="2" />
          <text :y="node.radius + 14" text-anchor="middle" font-size="11" fill="#333">
            {{ node.name }}
          </text>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useProjectsStore } from "../../stores/projects.js";
import api from "../../api/client.js";

const props = defineProps<{ projectId: string }>();
const loading = ref(true);
const nodes = ref<any[]>([]);
const edges = ref<any[]>([]);
const width = ref(800);
const height = ref(600);

function entityColor(type: string): string {
  const colors: Record<string, string> = {
    person: "#f59e0b", organization: "#3b82f6", subject: "#10b981",
    location: "#ef4444", time: "#8b5cf6", product: "#ec4899",
    metric: "#06b6d4", action: "#f97316", work: "#84cc16",
    group: "#6b7280", tags: "#9ca3af",
  };
  return colors[type] ?? "#6b7280";
}

onMounted(async () => {
  const { data } = await api.get(`/projects/${props.projectId}/graph`);
  // Layout entities and events from graph data
  const graph = data.graph;
  const entities = graph.entities ?? [];
  const events = graph.events ?? [];
  const graphEdges = graph.edges ?? [];

  // Simple grid layout for now
  const cols = Math.ceil(Math.sqrt(entities.length));
  const cellW = width.value / (cols + 1);
  const cellH = 60;

  nodes.value = entities.map((e: any, i: number) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    radius: Math.min(20, 8 + e.eventCount * 2),
    x: ((i % cols) + 1) * cellW,
    y: Math.floor(i / cols) * cellH + 40,
  }));

  edges.value = graphEdges.map((edge: any) => {
    const entityNode = nodes.value.find(n => n.id === edge.entityId);
    const eventId = edge.eventId;
    const event = events.find((ev: any) => ev.id === eventId);
    // Position event nodes near the center of their connected entities
    if (entityNode && event) {
      return {
        id: `${edge.entityId}-${edge.eventId}`,
        x1: entityNode.x, y1: entityNode.y,
        x2: entityNode.x + 30, y2: entityNode.y - 30,
      };
    }
    return null;
  }).filter(Boolean);

  loading.value = false;
});
</script>
```

Note: For a production-quality graph visualization, integrate a proper library like `v-network-graph` or `d3-force` with zoom/pan/drag. The above is an MVP placeholder.

- [ ] **Step 2: Commit**

```bash
git add web/src/components/graph/
git commit -m "feat: add knowledge graph visualization component"
```

---

## Phase 4: Deployment

### Task 19: Docker Compose production deployment

**Files:**
- Create: `Dockerfile.api`, `Dockerfile.web`, full `docker-compose.yml`
- Create: `scripts/offline-setup.sh`

- [ ] **Step 1: Create Dockerfile.api**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY dist/ dist/
COPY migrations/ migrations/
EXPOSE 4173
CMD ["node", "dist/src/index.js"]
```

- [ ] **Step 2: Create Dockerfile.web**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Create nginx.conf for the web container**

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://api:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    # SSE support for chat streaming
    location /api/chat/ {
        proxy_pass http://api:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 4: Create final docker-compose.yml**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: knowledge
      POSTGRES_PASSWORD: knowledge_pass
      POSTGRES_DB: knowledge_engine
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "knowledge"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://knowledge:knowledge_pass@postgres:5432/knowledge_engine
      REDIS_URL: redis://redis:6379
      STORAGE_PATH: /data/storage
      HTTP_HOST: 0.0.0.0
      HTTP_PORT: 4173
      AUTH_SECRET: ${AUTH_SECRET}
      MINERU_API_URL: http://mineru-router:8002
      LLM_API_KEY: ${LLM_API_KEY}
      LLM_BASE_URL: ${LLM_BASE_URL}
      LLM_MODEL: ${LLM_MODEL}
      EMBEDDING_API_KEY: ${EMBEDDING_API_KEY}
      EMBEDDING_BASE_URL: ${EMBEDDING_BASE_URL}
      EMBEDDING_MODEL: ${EMBEDDING_MODEL}
      RERANK_BASE_URL: ${RERANK_BASE_URL}
      RERANK_MODEL: ${RERANK_MODEL}
    volumes:
      - storage:/data/storage
      - ./migrations:/app/migrations:ro
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: >
      sh -c "node dist/src/db/migrate.js && node dist/src/index.js"

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    ports:
      - "80:80"
    depends_on:
      - api

  mineru-router:
    image: lpdswing/mineru-web-mineru-api:v3.4.0
    runtime: nvidia
    environment:
      NVIDIA_VISIBLE_DEVICES: all
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    volumes:
      - mineru-cache:/root/.cache

volumes:
  pgdata:
  redisdata:
  storage:
  mineru-cache:
```

- [ ] **Step 4: Create offline setup script**

```bash
#!/bin/bash
# scripts/offline-setup.sh
# For internal network deployment: pre-download all Docker images and npm packages

echo "=== Pulling Docker images for offline transfer ==="
docker pull pgvector/pgvector:pg16
docker pull redis:7-alpine
docker pull node:20-alpine
docker pull nginx:alpine
docker pull lpdswing/mineru-web-mineru-api:v3.4.0

echo "=== Saving images to tar ==="
docker save pgvector/pgvector:pg16 redis:7-alpine node:20-alpine nginx:alpine lpdswing/mineru-web-mineru-api:v3.4.0 -o knowledge-engine-images.tar

echo "=== Installing npm packages for offline ==="
npm ci --prefer-offline
cd web && npm ci --prefer-offline && cd ..

echo "=== Done ==="
echo "Transfer knowledge-engine-images.tar and the project directory to the target server."
echo "On target server: docker load -i knowledge-engine-images.tar"
echo "Then: docker compose up -d"
```

- [ ] **Step 5: Commit**

```bash
git add Dockerfile.api Dockerfile.web docker-compose.yml scripts/
git commit -m "feat: add Docker Compose production deployment and offline setup script"
```

---

### Task 20: Integration test and smoke test

**Files:**
- Create: `test/integration.test.ts`

- [ ] **Step 1: Write integration test covering the full flow**

```typescript
// test/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildHttpServer } from "../src/api/server.js";

describe("API Integration", () => {
  const app = buildHttpServer();
  let token: string;

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it("POST /api/auth/register creates user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "test@test.com", password: "test123456" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe("test@test.com");
    expect(body.token).toBeTruthy();
    token = body.token;
  });

  it("GET /api/projects returns empty list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).projects).toEqual([]);
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `npx vitest run test/integration.test.ts`
Expected: PASS (requires PostgreSQL and Redis running)

- [ ] **Step 3: Commit**

```bash
git add test/integration.test.ts
git commit -m "test: add API integration smoke tests"
```

---

## Execution Order Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-4 | Project scaffold, SAG code copy, types, DB setup |
| 2 | 5-12 | Auth, file, MinerU, BullMQ, SAG services, API routes |
| 3 | 13-18 | Vue 3 frontend: layout, auth, documents, chat, graph |
| 4 | 19-20 | Docker deployment, integration tests |

**Total: 20 tasks**

## Key Dependencies

- Tasks 2-3 depend on Task 1 (scaffold)
- Tasks 4 depends on Task 2 (vector utils) and Task 3 (config)
- Tasks 5 (auth) can be done in parallel with 6 (file), 7 (MinerU)
- Task 8 (workers) depends on 6 (file) and 7 (MinerU)
- Task 9 (SAG services) depends on 2 (AI clients, chunking)
- Task 11 (chat) depends on 9 (search service)
- Task 12 (server) depends on all backend services (5-11)
- Frontend tasks (13-18) depend on API routes (12) for integration testing
- Task 19 (deployment) depends on all code being complete

## Design Decisions (from grilling session)

| # | Decision |
|---|---|
| 1 | TypeScript + Fastify unified backend |
| 2 | Vue 3 frontend |
| 3 | PostgreSQL + pgvector |
| 4 | Local filesystem storage |
| 5 | AI: env-var-configured, OpenAI-compatible |
| 6 | Upload → Parse → Preview/Edit → Ingest → Search flow |
| 7 | User auth with JWT, CAS placeholder |
| 8 | BullMQ + Redis async tasks |
| 9 | Project > Document two-level hierarchy |
| 10 | Document model with extensible metadata/status |
| 11 | Full rebuild on re-ingest (no incremental update) |
| 12 | MinerU as independent HTTP service |
| 13 | Chat mode with multi-turn context (query rewriting) |
| 14 | Docker Compose offline deployment |
| 15 | Image content not vectorized in v1 |
| 16 | Cross-document search within project |
| 17 | Document status pipeline: UPLOADING→PENDING→PARSING→PARSED→INGESTING→READY→ARCHIVED |
| 18 | Explicit version chain (document_id + version) |
| 19 | Three-column layout: NavBar | SideBar | Main (Documents / Chat / Graph tabs) |
