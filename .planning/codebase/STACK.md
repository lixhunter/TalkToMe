# Technology Stack

**Analysis Date:** 2026-06-13

## Languages

**Primary:**
- Python 3.14 - All application code (scraping, RAG processing, ingestion)

**Secondary:**
- JavaScript (Node.js subset) - n8n workflow code nodes (`rag_scraper_workflow.json`, `rag_record_manager_workflow.json`)
- JSON - Workflow definitions, data interchange format (JSONL chunks)

## Runtime

**Environment:**
- Python 3.14.5 (CPython, confirmed via `.venv`)

**Package Manager:**
- pip with venv (`.venv/` directory present)
- Lockfile: Not present — no `requirements.txt`, `pyproject.toml`, `Pipfile`, or `uv.lock` detected

## Frameworks

**Core:**
- None — plain Python scripts (no web framework)

**Testing:**
- Not detected

**Build/Dev:**
- n8n (workflow automation) — used as the orchestration layer via JSON workflow definitions

## Key Dependencies

**Critical:**
- `requests` 2.34.2 — HTTP client for web scraping and LMStudio embedding API calls (`knowledge_base/scraper.py`, `ingest_to_postgres.py`)
- `psycopg2-binary` 2.9.12 — PostgreSQL driver for connecting to pgvector database (`ingest_to_postgres.py`)
- `beautifulsoup4` — HTML parsing for web scraper (imported in `knowledge_base/scraper.py` as `bs4`; not in venv dist-info, likely pre-installed system-wide or missing from venv)

**Infrastructure:**
- `certifi` 2026.5.20 — TLS certificate bundle (transitive dependency of `requests`)
- `charset-normalizer` 3.4.7 — Character encoding detection (transitive dependency of `requests`)
- `idna` 3.18 — Internationalized domain name support (transitive dependency of `requests`)
- `urllib3` 2.7.0 — HTTP connection pooling (transitive dependency of `requests`)

## Configuration

**Environment:**
- No `.env` file or environment variable loading detected in code
- Database credentials and service URLs are hardcoded in `ingest_to_postgres.py`:
  - `PG_CONFIG` dict (host, port, dbname, user, password)
  - `LMSTUDIO_URL` constant
  - `LMSTUDIO_MODEL` constant
- n8n credential IDs are placeholders (`REPLACE_POSTGRES_CRED_ID`, `REPLACE_OPENAI_CRED_ID`) in workflow JSON files

**Build:**
- No build config files — scripts are run directly with `python3`

## Platform Requirements

**Development:**
- Python 3.14+
- Access to a running PostgreSQL instance with `pgvector` extension
- Access to a running LMStudio instance (local LLM server) OR Ollama (used in n8n workflow)
- n8n instance for running automation workflows

**Production:**
- No deployment target defined
- Appears designed for local/LAN operation (IP addresses `192.168.2.185` hardcoded)

---

*Stack analysis: 2026-06-13*
