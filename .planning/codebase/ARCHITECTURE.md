<!-- refreshed: 2026-06-13 -->
# Architecture

**Analysis Date:** 2026-06-13

## System Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│                  Data Ingestion Layer (Triggers)                  │
├───────────────────────────────┬──────────────────────────────────┤
│     Scraper Workflow          │     Ingest Script / Record Mgr   │
│ `rag_scraper_workflow.json`   │  `ingest_to_postgres.py`         │
│ `rag_record_manager_workflow` │  `rag_record_manager_workflow`   │
└───────────────┬───────────────┴──────────────┬───────────────────┘
                │                              │
                ▼                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Knowledge Base (Local Files)                    │
│  `knowledge_base/raw/jena_digital_full.json`   (raw scraped)     │
│  `knowledge_base/chunks/jena_digital_chunks.jsonl` (processed)   │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              Embedding Layer (LM Studio / Ollama)                │
│  Local model: `text-embedding-embeddinggemma-300m-qat` (768d)    │
│  Alt model:   `bge-m3` (1024d)                                   │
│  Endpoint:    http://192.168.2.185:1234/v1/embeddings            │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│          Vector Store (PostgreSQL + pgvector)                     │
│  Host: 192.168.2.185:5432   DB: rag_db                           │
│  Tables: document_embeddings, document_records                   │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Scraper Workflow | Fetches jena-digital.de pages, extracts and chunks HTML content, sends to Record Manager webhook | `rag_scraper_workflow.json` |
| Record Manager Workflow | Deduplicates by file hash, deletes stale vectors, triggers re-embedding and vector store insert | `rag_record_manager_workflow.json` |
| Ingest Script | Standalone Python alternative to the n8n record manager; embeds and inserts JSONL chunks into PostgreSQL | `ingest_to_postgres.py` |
| Raw Knowledge Base | Structured JSON of all scraped jena-digital.de pages (navigation, articles, events) | `knowledge_base/raw/jena_digital_full.json` |
| Chunked Knowledge Base | JSONL file of text chunks with metadata, ready for embedding | `knowledge_base/chunks/jena_digital_chunks.jsonl` |
| Embedding Service | Local LLM server (LM Studio or Ollama) providing embedding vectors over HTTP | External — http://192.168.2.185:1234 |
| Vector Store | PostgreSQL with pgvector extension; stores embeddings and tracks document records | External — 192.168.2.185:5432 |

## Pattern Overview

**Overall:** RAG (Retrieval-Augmented Generation) data pipeline — no application server or query layer exists in this repo yet. The repo covers only the data preparation and ingestion side of a RAG system.

**Key Characteristics:**
- Data flows one direction: scrape → chunk → embed → store
- Idempotent ingestion via SHA-256 hash-based record manager (skip if unchanged, delete-then-reinsert if changed)
- Two parallel implementations of the ingestion step: an n8n workflow (`rag_record_manager_workflow.json`) and a standalone Python script (`ingest_to_postgres.py`)
- All AI inference runs locally on a LAN server (192.168.2.185), not via cloud APIs
- No application layer, no query/retrieval endpoint, no frontend yet

## Layers

**Scraping Layer:**
- Purpose: Discover and fetch pages from jena-digital.de, clean HTML, chunk text
- Location: `rag_scraper_workflow.json` (n8n nodes: Fetch News Listing, Build URL List, Fetch Each Page, Extract & Chunk)
- Contains: HTTP fetch logic, HTML cleaning regex, sliding-window text chunker (200 words, 30-word overlap), doc_type classifier
- Depends on: External website (https://jena-digital.de), n8n runtime
- Used by: Record Manager layer (via webhook POST to `/webhook/rag-ingest`)

**Knowledge Base Layer:**
- Purpose: Persist scraped and chunked content as local files for reproducibility and re-ingestion
- Location: `knowledge_base/raw/`, `knowledge_base/chunks/`
- Contains: `jena_digital_full.json` (full structured scrape), `jena_digital_chunks.jsonl` (one chunk per line with metadata)
- Depends on: Scraping layer output
- Used by: Ingestion layer (both Python script and n8n record manager workflow)

**Ingestion / Record Manager Layer:**
- Purpose: Deduplicate by file hash, delete stale embeddings, trigger embedding, insert new vectors
- Location: `ingest_to_postgres.py`, `rag_record_manager_workflow.json`
- Contains: SHA-256 file hash check, conditional delete of old `document_embeddings` rows, upsert of `document_records`, batch embedding calls, vector INSERT
- Depends on: Embedding service (LM Studio/Ollama), PostgreSQL/pgvector
- Used by: Nothing downstream in this repo (terminal layer)

**Embedding Service (External):**
- Purpose: Convert text chunks into dense float vectors
- Location: http://192.168.2.185:1234/v1/embeddings (OpenAI-compatible API)
- Models: `text-embedding-embeddinggemma-300m-qat` (768 dims, used by Python script), `bge-m3` (1024 dims, used by n8n workflow)
- Depends on: Local LM Studio or Ollama server on LAN

**Vector Store (External):**
- Purpose: Store and retrieve embeddings for RAG queries
- Tables: `document_embeddings` (text, metadata JSONB, embedding vector), `document_records` (filename, file_hash, updated_at)
- Location: PostgreSQL at 192.168.2.185:5432, database `rag_db`

## Data Flow

### Primary Ingestion Path (Python Script)

1. Read JSONL file from disk (`knowledge_base/chunks/jena_digital_chunks.jsonl`) — `ingest_to_postgres.py:45`
2. Compute SHA-256 hash of entire file — `ingest_to_postgres.py:46`
3. Query `document_records` to check stored hash — `ingest_to_postgres.py:52-55`
4. If hash unchanged: exit early (no-op) — `ingest_to_postgres.py:54-56`
5. Delete all existing rows in `document_embeddings` for this filename — `ingest_to_postgres.py:59`
6. For each chunk: call LM Studio embedding API — `ingest_to_postgres.py:79`
7. INSERT chunk text + metadata + vector into `document_embeddings` — `ingest_to_postgres.py:89-93`
8. Upsert `document_records` with new hash — `ingest_to_postgres.py:96-105`

### Scraper + n8n Record Manager Path

1. Manual trigger fires in n8n
2. HTTP GET `https://jena-digital.de/ueber-uns/aktuelles` to get news listing HTML — `rag_scraper_workflow.json` node "Fetch News Listing"
3. Regex discovery of article URLs + static nav URLs combined into list — node "Build URL List"
4. HTTP GET each URL in parallel — node "Fetch Each Page"
5. Strip scripts/styles/nav/header/footer, extract title and date, chunk into 200-word sliding windows — node "Extract & Chunk"
6. Aggregate all chunks into one payload — node "Aggregate All Chunks"
7. Compute SHA-256 of combined chunk texts, assign UUIDs to chunks — node "Build Payload"
8. POST payload to n8n Record Manager webhook (`/webhook/rag-ingest`) — node "Send to Record Manager"
9. Record Manager workflow: hash check → delete old → upsert record → embed with Ollama bge-m3 → insert into pgvector — `rag_record_manager_workflow.json`

**State Management:**
- Ingestion state is tracked via the `document_records` PostgreSQL table (filename → file_hash)
- No in-memory state; all state is persisted to the database

## Key Abstractions

**Document Chunk:**
- Purpose: The atomic unit of knowledge — a ~200-word text slice with source metadata
- Examples: `knowledge_base/chunks/jena_digital_chunks.jsonl` (each line), `ingest_to_postgres.py:76-87`
- Schema: `{ id, text, metadata: { source, site, title, date, doc_type, chunk_index, total_chunks, filename, file_hash, chunk_id } }`

**Record Manager:**
- Purpose: Idempotency layer that prevents re-embedding unchanged content
- Examples: `ingest_to_postgres.py:52-56`, `rag_record_manager_workflow.json` nodes "Check File Hash" / "Hash Unchanged?"
- Pattern: SHA-256 of file content → compare to stored hash → skip or delete-then-reinsert

**Document Type Classifier:**
- Purpose: Categorize chunks by content type for metadata enrichment
- Location: `rag_scraper_workflow.json` node "Extract & Chunk" (inline JS)
- Values: `org_page`, `news_article`, `event`, `legal_doc` (based on URL path patterns)

## Entry Points

**Python Ingest Script:**
- Location: `ingest_to_postgres.py`
- Triggers: Run manually via `python ingest_to_postgres.py`
- Responsibilities: Full ingest pipeline for the static JSONL chunk file — hash check, cleanup, embed, insert

**n8n Scraper Workflow:**
- Location: `rag_scraper_workflow.json`
- Triggers: Manual trigger in n8n UI (import JSON into n8n, then click Execute)
- Responsibilities: End-to-end scrape from jena-digital.de through to sending payload to Record Manager webhook

**n8n Record Manager Workflow:**
- Location: `rag_record_manager_workflow.json`
- Triggers: Webhook POST to `/webhook/rag-ingest` (called by scraper workflow) or Manual trigger
- Responsibilities: Deduplication, deletion of stale vectors, Ollama embedding, pgvector insert

## Architectural Constraints

- **Threading:** Single-threaded Python script; n8n workflows handle concurrency internally
- **Global state:** Config constants hardcoded at module level in `ingest_to_postgres.py:13-23` (JSONL_FILE, LMSTUDIO_URL, LMSTUDIO_MODEL, PG_CONFIG) — change these before running
- **Circular imports:** None (single-file Python script; no modules)
- **Embedding dimension mismatch:** Python script uses 768-dim model (`embeddinggemma-300m-qat`); n8n workflow uses 1024-dim model (`bge-m3`). Both write to the same `document_embeddings` table, which will cause a vector dimension conflict if both paths are used with the same table schema
- **No query/retrieval layer:** This repo contains only the ingestion side; no RAG query API, chat interface, or avatar logic exists here yet
- **Hardcoded LAN IP:** All services (PostgreSQL, LM Studio) are addressed by hardcoded LAN IP `192.168.2.185`

## Anti-Patterns

### Hardcoded credentials and network addresses

**What happens:** Database password (`rag_password`), host IP, port, and model URLs are literal strings in `ingest_to_postgres.py:17-23` and placeholder strings in workflow JSON files.
**Why it's wrong:** Credentials in source code get committed to git; changing the server requires editing source files.
**Do this instead:** Read from environment variables (`os.environ`) or a `.env` file (already in `.gitignore`). Use `python-dotenv` or similar.

### Duplicate ingestion implementations

**What happens:** Two separate implementations of the record manager exist — `ingest_to_postgres.py` (Python) and `rag_record_manager_workflow.json` (n8n).
**Why it's wrong:** They use different embedding models (768 vs 1024 dims), making their outputs incompatible in the same vector table. Maintaining two implementations doubles the change surface.
**Do this instead:** Pick one canonical ingestion path; document the other as deprecated or remove it.

## Error Handling

**Strategy:** Minimal — rely on exception propagation.

**Patterns:**
- Python script: no try/except; uncaught exceptions from `requests`, `psycopg2`, or file I/O abort the script with a traceback
- n8n workflows: n8n's built-in error handling (node-level retry not configured); HTTP requests use a 30-second timeout
- No dead-letter queue, no partial-failure recovery, no retry logic

## Cross-Cutting Concerns

**Logging:** Python script uses `print()` statements with `[skip]`, `[clean]`, `[info]`, `[done]` prefixes. n8n uses `console.log()` in Code nodes.
**Validation:** No schema validation on chunk format; assumes JSONL lines conform to expected structure.
**Authentication:** No authentication on the LM Studio embedding endpoint. PostgreSQL uses plaintext username/password in config.

---

*Architecture analysis: 2026-06-13*
