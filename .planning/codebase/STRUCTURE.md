# Codebase Structure

**Analysis Date:** 2026-06-13

## Directory Layout

```
TalkToMe/                              # Project root
├── ingest_to_postgres.py              # Python ingest script (standalone, runnable)
├── rag_scraper_workflow.json          # n8n workflow: scrape jena-digital.de
├── rag_record_manager_workflow.json   # n8n workflow: deduplicate + embed + insert
├── README.md                          # Project brief (bilingual DE/EN)
├── .gitignore                         # Ignores __pycache__, .venv/
├── knowledge_base/
│   ├── raw/
│   │   └── jena_digital_full.json    # Full structured scrape of jena-digital.de
│   └── chunks/
│       └── jena_digital_chunks.jsonl # Processed text chunks (one JSON object per line)
├── .planning/
│   └── codebase/                      # GSD codebase map documents
├── .venv/                             # Python virtual environment (not committed)
└── .git/                              # Git repository metadata
```

## Directory Purposes

**`knowledge_base/raw/`:**
- Purpose: Stores the full structured JSON output from web scraping
- Contains: One file per scraping run — structured JSON with navigation, articles, events
- Key files: `jena_digital_full.json` (scraped 2026-06-13, ~152 KB)
- Generated: Yes (by scraper tooling external to this repo or the n8n workflow)
- Committed: Yes

**`knowledge_base/chunks/`:**
- Purpose: Stores processed, chunked text ready for embedding and ingestion
- Contains: JSONL files where each line is a chunk object `{ id, text, metadata }`
- Key files: `jena_digital_chunks.jsonl` (~129 KB, ~200-word chunks with sliding overlap)
- Generated: Yes (derived from raw data via chunking logic)
- Committed: Yes

**`.planning/codebase/`:**
- Purpose: GSD architecture and convention maps consumed by planning/execution commands
- Contains: ARCHITECTURE.md, STRUCTURE.md, and other map documents
- Generated: Yes (by `/gsd:map-codebase`)
- Committed: Yes

**`.venv/`:**
- Purpose: Python virtual environment with project dependencies
- Contains: `psycopg2-binary`, `requests`, and transitive deps
- Generated: Yes
- Committed: No (in `.gitignore`)

## Key File Locations

**Entry Points:**
- `ingest_to_postgres.py`: Run directly with `python ingest_to_postgres.py` to embed and insert chunks
- `rag_scraper_workflow.json`: Import into n8n to run the full scrape pipeline
- `rag_record_manager_workflow.json`: Import into n8n to run the record manager (also called via webhook)

**Configuration (all hardcoded in source — no config files):**
- `ingest_to_postgres.py:13-23`: JSONL_FILE path, LM Studio URL+model, PostgreSQL connection config

**Knowledge Base Data:**
- `knowledge_base/raw/jena_digital_full.json`: Raw scraped site data (structured JSON)
- `knowledge_base/chunks/jena_digital_chunks.jsonl`: Chunked text ready for ingestion

**Workflow Definitions:**
- `rag_scraper_workflow.json`: n8n workflow JSON — import at http://[n8n-host]:5678
- `rag_record_manager_workflow.json`: n8n workflow JSON — import at http://[n8n-host]:5678

## Naming Conventions

**Files:**
- Python scripts: `snake_case.py` (e.g., `ingest_to_postgres.py`)
- n8n workflow exports: `snake_case_workflow.json` (e.g., `rag_scraper_workflow.json`)
- Knowledge base data: `[site]_[type].[ext]` (e.g., `jena_digital_chunks.jsonl`, `jena_digital_full.json`)

**Chunk IDs:**
- UUIDs (v4) assigned at chunk creation time (e.g., `468484e1-f80d-4b61-89cf-1e3cce383066`)

**Metadata fields in chunks:**
- `snake_case` (e.g., `doc_type`, `chunk_index`, `total_chunks`, `file_hash`)

**n8n node names:**
- Title Case natural language (e.g., "Fetch News Listing", "Extract & Chunk", "Hash Unchanged?")

## Where to Add New Code

**New data source (additional website to scrape):**
- Add a new n8n scraper workflow JSON modeled on `rag_scraper_workflow.json`
- Place resulting JSONL output in `knowledge_base/chunks/[source]_chunks.jsonl`
- Place raw structured data in `knowledge_base/raw/[source]_full.json`

**New ingestion script (alternative to Python script):**
- Place at root: `ingest_[target].py` (e.g., `ingest_to_qdrant.py`)
- Follow same hash-check + delete-old + embed + insert pattern as `ingest_to_postgres.py`

**New knowledge base content:**
- Raw data: `knowledge_base/raw/[descriptive_name].json`
- Chunked data: `knowledge_base/chunks/[descriptive_name]_chunks.jsonl`

**Configuration / secrets:**
- Create a `.env` file at project root (already in `.gitignore` pattern — add `*.env` or `.env` explicitly)
- Use `python-dotenv` in Python scripts to load vars instead of hardcoding in source

**Future query/retrieval layer:**
- No existing structure — create a new top-level directory (e.g., `api/` or `app/`) when adding a chat or REST API layer

## Special Directories

**`knowledge_base/`:**
- Purpose: Versioned snapshot of all knowledge fed into the RAG system
- Generated: Partially (raw and chunks are generated outputs, but committed for reproducibility)
- Committed: Yes — intentionally versioned so the knowledge state is reproducible without re-scraping

**`.venv/`:**
- Purpose: Isolated Python environment
- Generated: Yes (`python -m venv .venv && pip install psycopg2-binary requests`)
- Committed: No

**`.planning/`:**
- Purpose: GSD planning artifacts
- Generated: Yes (by GSD tooling)
- Committed: Yes (planning artifacts are part of the project record)

---

*Structure analysis: 2026-06-13*
