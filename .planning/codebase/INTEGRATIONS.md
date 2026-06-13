# External Integrations

**Analysis Date:** 2026-06-13

## APIs & External Services

**Local LLM Inference (Embeddings):**
- LMStudio — OpenAI-compatible embedding API served locally
  - SDK/Client: `requests` (raw HTTP POST)
  - Endpoint: `http://192.168.2.185:1234/v1/embeddings`
  - Model: `text-embedding-embeddinggemma-300m-qat` (768 dimensions)
  - Auth: None (LAN-local, unauthenticated)
  - Used in: `ingest_to_postgres.py`

- Ollama — used as embedding backend in n8n workflow via OpenAI-compatible API
  - Node type: `@n8n/n8n-nodes-langchain.embeddingsOpenAi`
  - Model: `bge-m3` (1024 dimensions)
  - n8n credential name: `OpenAI account` (placeholder ID `REPLACE_OPENAI_CRED_ID`)
  - Used in: `rag_record_manager_workflow.json` ("Ollama Embeddings" node)

**Web Scraping Target:**
- jena-digital.de — public website crawled for RAG knowledge base
  - Accessed via: `requests.Session` with polite crawl delays (3–7s)
  - robots.txt: respected via `urllib.robotparser`
  - Used in: `knowledge_base/scraper.py`

**n8n Workflow Automation:**
- n8n — self-hosted workflow automation platform
  - Webhook endpoint: `http://REPLACE_N8N_HOST:5678/webhook/rag-ingest`
  - Used for: orchestrating scrape → chunk → embed → store pipeline
  - Workflow files: `rag_scraper_workflow.json`, `rag_record_manager_workflow.json`

## Data Storage

**Databases:**
- PostgreSQL with pgvector extension
  - Host: `192.168.2.185:5432` (hardcoded in `ingest_to_postgres.py`)
  - Database: `rag_db`
  - User: `rag_user`
  - Client: `psycopg2-binary` 2.9.12 (raw SQL, no ORM)
  - Tables:
    - `document_embeddings` — stores text chunks + vector embeddings + JSONB metadata
    - `document_records` — tracks ingested filenames with SHA-256 hashes (record manager pattern)
  - n8n credential name: `PostgreSQL` (placeholder ID `REPLACE_POSTGRES_CRED_ID`)
  - Also accessed directly from n8n via `n8n-nodes-base.postgres` and `@n8n/n8n-nodes-langchain.vectorStorePGVector`

**File Storage:**
- Local filesystem only
  - Input: `knowledge_base/raw/jena_digital_full.json` (scraped data)
  - Intermediate: `knowledge_base/chunks/jena_digital_chunks.jsonl` (processed chunks)
  - Hardcoded absolute path in n8n workflow: `/home/lars/Documents/TalkToMe/knowledge_base/chunks/jena_digital_chunks.jsonl`

**Caching:**
- None (record manager provides idempotent re-ingestion via SHA-256 file hashing)

## Authentication & Identity

**Auth Provider:**
- None — no user authentication system present
- Database uses hardcoded credentials (`rag_user` / `rag_password`) in `ingest_to_postgres.py`
- LMStudio and n8n webhook are unauthenticated (LAN-local assumed)

## Monitoring & Observability

**Error Tracking:**
- None

**Logs:**
- `print()` statements to stdout only in all Python scripts
- n8n `console.log()` in code nodes

## CI/CD & Deployment

**Hosting:**
- No deployment configuration detected
- Appears to be a local development/prototype setup

**CI Pipeline:**
- None

## Environment Configuration

**Required env vars:**
- None — all configuration is hardcoded directly in source files

**Secrets location:**
- Hardcoded in `ingest_to_postgres.py` (PG_CONFIG dict with password)
- n8n credential placeholders in workflow JSON files must be replaced with actual n8n credential IDs before importing

## Webhooks & Callbacks

**Incoming:**
- `POST /webhook/rag-ingest` — n8n webhook endpoint that receives chunked data from the scraper workflow
  - Defined in: `rag_scraper_workflow.json` ("Send to Record Manager" node)
  - URL template: `http://REPLACE_N8N_HOST:5678/webhook/rag-ingest`

**Outgoing:**
- HTTP GET requests to `https://jena-digital.de/*` (web scraper)
- HTTP POST to `http://192.168.2.185:1234/v1/embeddings` (LMStudio embedding API)

---

*Integration audit: 2026-06-13*
