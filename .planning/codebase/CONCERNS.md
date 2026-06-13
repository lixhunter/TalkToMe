# Codebase Concerns

**Analysis Date:** 2026-06-13

## Tech Debt

**Hardcoded credentials and internal IP addresses:**
- Issue: Database password, username, host IP, and embedding API URL are hardcoded as module-level constants directly in source code rather than read from environment variables or a config file.
- Files: `ingest_to_postgres.py` (lines 15–23): `LMSTUDIO_URL = "http://192.168.2.185:1234/v1/embeddings"`, `PG_CONFIG = {"host": "192.168.2.185", "password": "rag_password", ...}`
- Impact: Credentials are committed to version history. Any collaborator (or future git host) gains full database access. The hardcoded LAN IP means the script silently breaks on any machine other than the developer's own network.
- Fix approach: Move all connection parameters to a `.env` file (not committed), load with `python-dotenv` or `os.environ`, and add `.env` to `.gitignore`.

**No `requirements.txt` or `pyproject.toml`:**
- Issue: There is no dependency manifest for the project. The `.venv` contains `requests`, `psycopg2-binary`, `certifi`, `charset-normalizer`, `idna`, and `urllib3`, but `BeautifulSoup4` (required by `scraper.py`) is absent from the venv entirely.
- Files: `knowledge_base/scraper.py` (line 15: `from bs4 import BeautifulSoup`) — this import will fail at runtime with the current venv.
- Impact: `scraper.py` cannot be executed without a manual `pip install beautifulsoup4`. New contributors have no way to reconstruct a working environment.
- Fix approach: Create `requirements.txt` pinning `requests`, `psycopg2-binary`, `beautifulsoup4`, and any other runtime deps. Optionally use `pyproject.toml` with a build backend.

**Duplicated scraping and chunking logic across two separate pipelines:**
- Issue: The scraping and chunking pipeline is implemented twice: once in Python (`knowledge_base/scraper.py` + `knowledge_base/rag_processor.py`) and again redundantly inside the n8n workflow (`rag_scraper_workflow.json` — "Extract & Chunk" node). The chunking parameters differ: Python uses `MAX_PAGE_WORDS=1500` with `OVERLAP_WORDS=75`; the n8n JavaScript uses `wordsPerChunk=200` with `overlap=30`.
- Files: `knowledge_base/rag_processor.py` (lines 16–17), `rag_scraper_workflow.json` ("Extract & Chunk" node, `chunkText` function)
- Impact: The two pipelines produce structurally different chunks, leading to inconsistent vector store contents depending on which pipeline was run last. Bugs fixed in one location will not propagate to the other.
- Fix approach: Designate one pipeline as canonical (Python scripts are more featureful and better tested by inspection). The n8n workflow should delegate extraction to a Python subprocess call or an HTTP endpoint, not re-implement the logic in JavaScript.

**Divergent URL/page coverage between the two pipelines:**
- Issue: The Python scraper's `NAV_PAGES` list (11 paths, including `/jedi`, `/dehub`, `/veranstaltungen/archiv`, `/unser-oekosystem/fachgruppen-arbeitskreise`, `/unser-team`) differs from the n8n workflow's `navUrls` array (8 URLs, which omits all of the above and adds `/ueber-uns/netzwerk-foerderung` and `/vernetzung`).
- Files: `knowledge_base/scraper.py` (lines 36–48), `rag_scraper_workflow.json` ("Build URL List" node)
- Impact: Depending on which pipeline is run, different sections of the site end up in the vector store, causing incomplete or inconsistent answers from the RAG system.
- Fix approach: Maintain a single source-of-truth URL list (e.g., a JSON config file) consumed by both pipelines, or eliminate the n8n scraper in favour of the Python scraper.

**Relative path dependency requires specific working directory:**
- Issue: `knowledge_base/rag_processor.py` uses `INPUT_FILE = "raw/jena_digital_full.json"` and `OUTPUT_FILE = "chunks/jena_digital_chunks.jsonl"` — paths relative to the `knowledge_base/` directory. The script silently fails with `FileNotFoundError` if run from the project root.
- Files: `knowledge_base/rag_processor.py` (lines 13–14)
- Impact: Non-obvious execution requirement; newcomers will encounter opaque errors. `ingest_to_postgres.py` at the project root correctly uses `knowledge_base/chunks/jena_digital_chunks.jsonl`, showing the inconsistency.
- Fix approach: Use `pathlib.Path(__file__).parent` to build absolute paths relative to the script's own location.

**`rag_processor.py` opens file without context manager:**
- Issue: Line 147 uses `json.load(open(INPUT_FILE, encoding="utf-8"))` — the file handle is never explicitly closed.
- Files: `knowledge_base/rag_processor.py` (line 147)
- Impact: File descriptor leak; harmless for a short-lived script but poor practice.
- Fix approach: Replace with `with open(INPUT_FILE, encoding="utf-8") as f: data = json.load(f)`.

## Known Bugs

**`scraper.py` import fails in current venv:**
- Symptoms: `ImportError: No module named 'bs4'` when running `python knowledge_base/scraper.py`.
- Files: `knowledge_base/scraper.py` (line 15)
- Trigger: Any attempt to run the scraper with the project's `.venv` active.
- Workaround: `pip install beautifulsoup4` manually before running.

**n8n scraper sends all page HTML to regex without rate-limiting:**
- Symptoms: The n8n workflow "Fetch Each Page" node fires HTTP requests to jena-digital.de for all discovered URLs in rapid succession with no inter-request delay (Python scraper waits 3–7 seconds between requests).
- Files: `rag_scraper_workflow.json` ("Fetch Each Page" node — no delay/wait between requests)
- Trigger: Running the n8n scraper workflow.
- Workaround: Use the Python `scraper.py` instead, which implements polite delays.

**Partial ingestion leaves database in inconsistent state:**
- Symptoms: If `ingest_to_postgres.py` fails mid-loop (e.g., LM Studio embedding API times out on chunk 20 of 34), the script has already deleted all old vectors, inserted some new ones, but `conn.commit()` at line 107 is never reached. psycopg2 auto-rolls back the transaction on connection close, leaving the table empty for that filename.
- Files: `ingest_to_postgres.py` (lines 58–107: delete, loop-insert, then single commit with no per-chunk commit or error recovery)
- Trigger: Any network interruption to LM Studio during the embedding loop.
- Workaround: Re-run the script; the hash check will detect no matching hash and re-attempt full ingestion.

## Security Considerations

**Plaintext database password in source code:**
- Risk: `"password": "rag_password"` is committed to git history in `ingest_to_postgres.py`.
- Files: `ingest_to_postgres.py` (line 22)
- Current mitigation: The database is on a private LAN IP (192.168.2.185) not publicly exposed.
- Recommendations: Remove from source immediately, rotate the password, use environment variables. Add `*.env` and a credential config pattern to `.gitignore`.

**n8n workflow credential placeholders committed as template:**
- Risk: The workflow JSONs contain `"id": "REPLACE_POSTGRES_CRED_ID"` and `"id": "REPLACE_OPENAI_CRED_ID"`. If someone imports these without substituting real values, the workflows silently reference non-existent credentials, but the placeholder pattern also signals the credential management is manual/error-prone.
- Files: `rag_record_manager_workflow.json` (lines 47, 96, 116, 149, 168), `rag_scraper_workflow.json` (line 110: `http://REPLACE_N8N_HOST:5678/webhook/rag-ingest`)
- Current mitigation: None — relies on manual substitution before import.
- Recommendations: Add a `SETUP.md` with explicit substitution instructions; consider templating via `envsubst` in a setup script.

**Web scraper User-Agent misrepresentation:**
- Risk: `scraper.py` uses a Chrome browser User-Agent string (`Mozilla/5.0 ... Chrome/124.0.0.0`) while `rag_scraper_workflow.json` uses `Mozilla/5.0 (compatible; RAGBot/1.0)`. The Python scraper impersonates a real browser, which may violate jena-digital.de's ToS and circumvent bot-detection mitigations.
- Files: `knowledge_base/scraper.py` (lines 21–26)
- Current mitigation: `scraper.py` does check `robots.txt` (line 62–68), which partially mitigates ethical risk.
- Recommendations: Align both pipelines to use the transparent `RAGBot/1.0` User-Agent used in the n8n workflow.

**Large scraped data files not in `.gitignore`:**
- Risk: `knowledge_base/raw/jena_digital_full.json` (153 KB) and `knowledge_base/chunks/jena_digital_chunks.jsonl` (130 KB) are not excluded by `.gitignore`. These files contain scraped website content and will be committed to git, bloating history and potentially including personal data from the scraped site.
- Files: `.gitignore` (only excludes `__pycache__/`, `*.py[cod]`, `.venv/`, `venv/`)
- Current mitigation: None.
- Recommendations: Add `knowledge_base/raw/` and `knowledge_base/chunks/` to `.gitignore`. Document how to regenerate them via the scraper and processor.

## Performance Bottlenecks

**Sequential per-chunk embedding with single-item HTTP calls:**
- Problem: `ingest_to_postgres.py` calls the LM Studio embedding API once per chunk in a sequential loop. For 34 chunks this is tolerable, but as the knowledge base grows each run takes O(N) embedding API round-trips with no batching.
- Files: `ingest_to_postgres.py` (lines 75–93: `for i, chunk in enumerate(chunks, 1): ... embedding = get_embedding(chunk["text"])`)
- Cause: `get_embedding()` sends a single-item request each time; the LM Studio API supports batch input (`"input": [text1, text2, ...]`).
- Improvement path: Batch chunks into groups of 8–16 and send a single API call per batch; process results in order.

**Full file re-read into memory for SHA-256 hash:**
- Problem: `ingest_to_postgres.py` reads the entire JSONL file into memory (`f.read()`) solely to compute its hash, then reads it again line-by-line to process chunks.
- Files: `ingest_to_postgres.py` (lines 44–46 vs lines 66–70)
- Cause: Two separate `open()` calls: one binary for hashing, one text for parsing.
- Improvement path: Compute the hash incrementally while streaming the file, or combine into a single pass.

## Fragile Areas

**`extract_news_cards` / `extract_event_cards` tied to TYPO3 CSS class names:**
- Files: `knowledge_base/scraper.py` (lines 157–199)
- Why fragile: Both functions hard-code CSS selectors `div.latest-news`, `.articletype-0`, `.articletype-2`. A TYPO3 theme update or CSS refactor on jena-digital.de will silently produce zero results with no error.
- Safe modification: Add a non-zero assertion or log a warning when `cards` is empty after crawling the homepage. Consider falling back to generic article-link discovery.

**`rejoin_orphaned_lines` heuristic is brittle:**
- Files: `knowledge_base/rag_processor.py` (lines 31–51)
- Why fragile: The 6-word threshold and sentence-ending punctuation check are arbitrary. Content changes on the source site (e.g., longer navigation link text) could cause legitimate headings to be merged with body text, corrupting chunks used for embedding.
- Safe modification: Treat this function as requiring re-tuning whenever the scraper output changes significantly. Add a sample-based smoke test against known fixtures.

**`classify_doc_type` relies on URL path patterns:**
- Files: `knowledge_base/rag_processor.py` (lines 66–76)
- Why fragile: Classification depends on path substrings like `"aktuelles/detail"`, `"veranstaltungen"`, `"satzung"`. URL restructuring on jena-digital.de will silently misclassify all documents as `"org_page"`.
- Safe modification: Log classification results during processing to catch unexpected `"org_page"` spikes after re-scraping.

**`extract_date_from_text` returns the first date found anywhere in text:**
- Files: `knowledge_base/rag_processor.py` (lines 213–215), `knowledge_base/scraper.py` (line 33)
- Why fragile: The regex `\b\d{1,2}\.\d{1,2}\.\d{4}\b` matches any German-format date in the text. For news articles that reference past events, the first date found may be a referenced date, not the article's publication date.
- Safe modification: Restrict date search to the first N words or to known date-container HTML elements in the scraper.

## Scaling Limits

**Single-file knowledge base:**
- Current capacity: One JSONL file (`jena_digital_chunks.jsonl`) representing one scraped website. The record manager's hash check and delete-then-reinsert logic operates on the entire file as one atomic unit.
- Limit: Adding a second source (e.g., a different organisation's website) requires adding a separate ingest run with a different `JSONL_FILE` constant, as both the Python script and n8n workflow hardcode the filename. There is no multi-source management.
- Scaling path: Parameterise the ingest script to accept a filename argument (`sys.argv[1]`) and make the n8n workflow driven by a webhook payload containing `filename` and `chunks`.

**No pgvector index defined in schema:**
- Current capacity: Vector similarity search works but performs a full sequential scan on `document_embeddings` for every query.
- Limit: Query latency grows linearly with the number of stored vectors. Already 34 vectors; will degrade noticeably beyond ~10,000 rows.
- Scaling path: Create an IVFFlat or HNSW index: `CREATE INDEX ON document_embeddings USING hnsw (embedding vector_cosine_ops);`. No schema file exists in the repo — the table DDL must be documented.

## Dependencies at Risk

**`psycopg2-binary` on Python 3.14:**
- Risk: `psycopg2-binary` 2.9.12 is installed in a Python 3.14 venv. psycopg2 is a C extension that historically lags behind new Python versions. Python 3.14 is very recent (released 2025); pre-built wheels may not be fully stable or officially supported.
- Impact: Potential import errors or subtle runtime bugs on future Python patch releases.
- Migration plan: Consider migrating to `psycopg` (psycopg3, the async-capable successor) which has broader Python version support and is the recommended path for new projects.

**`beautifulsoup4` missing from venv entirely:**
- Risk: `scraper.py` requires `bs4` but it is not installed in the project venv (only `requests`, `psycopg2-binary`, `certifi`, `charset-normalizer`, `idna`, `urllib3` are present).
- Impact: `scraper.py` is currently unrunnable in the provided environment.
- Migration plan: Add `beautifulsoup4` and `lxml` (faster parser) to `requirements.txt` and install.

**n8n "Ollama Embeddings" node uses `embeddingsOpenAi` type:**
- Risk: The node named "Ollama Embeddings" in `rag_record_manager_workflow.json` uses `"type": "@n8n/n8n-nodes-langchain.embeddingsOpenAi"` with model `bge-m3` at 1024 dimensions. This is a misnamed node using an OpenAI-compatible shim to talk to a local Ollama endpoint. The Python ingest script uses a different model (`text-embedding-embeddinggemma-300m-qat`) at 768 dimensions.
- Files: `rag_record_manager_workflow.json` (lines 155–169), `ingest_to_postgres.py` (lines 15–16)
- Impact: Vectors inserted by the Python path and vectors inserted by the n8n path have different dimensionalities (768 vs 1024) and are produced by different models, making them incomparable for similarity search. The pgvector column must have a fixed declared dimension; one of the two pipelines will produce a cast error at insert time.
- Migration plan: Standardise on a single embedding model and dimension across both pipelines. Update the pgvector column declaration to match.

## Missing Critical Features

**No database schema / DDL in the repository:**
- Problem: The `document_embeddings` and `document_records` tables are referenced throughout `ingest_to_postgres.py` and both n8n workflows, but no `CREATE TABLE` statements exist anywhere in the repository.
- Blocks: A fresh environment setup is impossible without out-of-band knowledge of the schema. The vector column dimension must match the embedding model (768 or 1024) but is undocumented.
- Recommended fix: Add `schema.sql` to the project root containing the full DDL including the pgvector extension setup, table definitions, and index creation.

**No environment setup instructions:**
- Problem: There is no `SETUP.md`, `Makefile`, or script guiding how to configure the `.env`, install dependencies, set up PostgreSQL+pgvector, load the n8n workflows, and run the pipeline end-to-end.
- Blocks: Onboarding any collaborator requires significant reverse-engineering.

**No automation / scheduled re-scraping:**
- Problem: Both pipelines are triggered manually (n8n "Manual Trigger" node; Python scripts run by hand). There is no cron job, scheduled n8n trigger, or other mechanism to keep the knowledge base current as the website is updated.
- Blocks: The RAG system will silently return stale information after the website publishes new articles or events.

## Test Coverage Gaps

**No tests exist:**
- What's not tested: The entire codebase has zero test files. All logic in `rag_processor.py` (chunking, text cleaning, deduplication, date extraction, doc-type classification), `scraper.py` (HTML parsing, link collection, robots.txt enforcement), and `ingest_to_postgres.py` (hash comparison, database operations) is untested.
- Files: All source files — `ingest_to_postgres.py`, `knowledge_base/rag_processor.py`, `knowledge_base/scraper.py`
- Risk: Any refactor or content change on the target website could silently break chunking quality, date extraction accuracy, or deduplication correctness with no regression signal.
- Priority: High — especially for `rag_processor.py` where the `rejoin_orphaned_lines` and `extract_date_from_text` heuristics are fragile and hard to validate by inspection alone.

---

*Concerns audit: 2026-06-13*
