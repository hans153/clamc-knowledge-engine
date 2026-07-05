# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs API + web concurrently)
npm run dev

# Build
npm run build            # both API (tsc) and web (vite)
npm run build:api        # API only
npm run build:web        # web only

# Type checking
npm run typecheck        # both workspaces

# Testing
npm test                 # vitest run (single suite: test/integration.test.ts)
npm run test:watch       # vitest watch mode

# Database
npm run db:migrate       # run SQL migrations from migrations/
npm run db:setup         # migrate + seed
npm run seed             # seed entity_types
```

## Architecture

### Stack
- **Backend**: Fastify 5 (Node.js, ESM) with pgvector (PostgreSQL) and BullMQ (Redis)
- **Frontend**: Vue 3 SPA with Vite, Vue Router, Pinia, Tailwind CSS
- **Infrastructure**: Docker Compose (postgres + redis + api + web + optional GPU mineru)

### High-level flow

```
User uploads PDF → MinerU parses → Markdown → chunk → embed → extract events/entities → write knowledge graph
                                                                          ↓
User asks question → search (entity-centric multi-hop SAG) → chat (RAG with SSE streaming)
```

### Two-layer data model

The system has two tiers of data:

1. **SAG layer** (`src/db/repositories.ts`) — the core knowledge graph: `sources`, `entities`, `events`, `source_chunks`, `documents`, `event_entities`. All scoped by `tenant_id`. Provides vector search, entity search, event graph traversal, and multi-hop expansion.

2. **KE (Knowledge Engine) layer** — user-facing constructs: `users`, `projects`, `knowledge_documents`, `chat_sessions`, `chat_messages`. Each project maps to one SAG source. Documents flow through statuses: `UPLOADING → PARSING → PARSED → INGESTING → READY`.

### Search pipeline (SAG)

The core search (`src/services/search-service.ts`) is an entity-centric multi-hop retrieval:

1. **Entity extraction** — LLM extracts named entities from the query (standard mode) or BM25 matches entities directly (fast mode)
2. **Entity retrieval** — Exact name match + vector similarity over entity embeddings
3. **Event recall** — Get events linked to matched entities + title-vector-relevant events
4. **Multi-hop expansion** — Walk entity-event relationships up to `maxHops` to find connected events
5. **Coarse ranking** — Content-embedding cosine similarity
6. **Rerank** — Reranker model (fast) or LLM selection (standard)
7. **Section retrieval** — Fetch original chunks from selected events, supplement with vector chunk search

Two strategies: `vector` (simple vector chunk search) and `multi` (the full SAG pipeline above).

### Workers

Two BullMQ workers run in-process at startup, connected via Redis:

- **Parse worker** (`src/worker/parse-worker.ts`): Takes `ParseJobData`, sends file to MinerU API, extracts markdown + images from returned zip, stores result. Concurrency: 2.
- **Ingest worker** (`src/worker/ingest-worker.ts`): Takes `IngestJobData`, calls `ingestionService.ingestDocument()` to run the full SAG pipeline (chunk → embed → extract events → write graph). Concurrency: 1.

### AI clients

All AI clients are OpenAI-compatible (configurable base URL + API key):

- **Embedding** (`src/ai/embedding-client.ts`): When no `EMBEDDING_API_KEY`, falls back to deterministic SHA256-based local embeddings (reproducible, no network required)
- **LLM** (`src/ai/llm-client.ts`): Chat, streaming (SSE), structured JSON extraction. When no `LLM_API_KEY`, event extraction falls back to regex/local heuristics. Has retry logic with exponential backoff.
- **Rerank** (`src/ai/rerank-client.ts`): Optional reranker endpoint

### Key design decisions

- **Environment config**: `src/config/env.ts` uses Zod schema with defaults — no `.env` file required if defaults work. Supports hot-reload via `ai_provider_settings` DB table for AI provider settings.
- **Auth**: JWT via `@fastify/cookie` + Bearer tokens. Middleware at `src/api/auth.ts` attaches `userId` and `userEmail` to requests.
- **Route pattern**: Each route file exports an async function registered as a Fastify plugin. Zod validation in handlers. Error responses follow `{ error: { code, message } }` shape.
- **Repository pattern**: All DB access goes through functions in `src/db/repositories.ts` and `src/db/pool.ts`. Pool max is 20 connections.
- **Chunking**: `src/ingestion/chunking/markdown.ts` supports `heading_strict` (split on headings) and `token` (sliding window) modes, using `gpt-tokenizer` for token counting.

### Frontend routes

- `/login`, `/register` — Auth pages
- `/knowledge` — Main app with sidebar (projects), document list, markdown editor, chat view, and knowledge graph visualization

### Config note

`config.DEFAULT_TENANT_ID` ("default") is used as the tenant for all SAG operations. This is a single-tenant deployment pattern — the KE layer's `project_id` provides multi-tenancy at the application level.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
