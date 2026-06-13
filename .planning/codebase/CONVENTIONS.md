# Coding Conventions

**Analysis Date:** 2026-06-13

## Naming Patterns

**Files:**
- `snake_case.py` for all Python modules: `scraper.py`, `rag_processor.py`, `ingest_to_postgres.py`
- Names reflect primary purpose: ingestion script (`ingest_to_postgres.py`), processing script (`rag_processor.py`), scraping script (`scraper.py`)

**Functions:**
- `snake_case` throughout: `check_robots_txt`, `extract_page_content`, `build_chunk`, `dedup_chunks`
- Verbs prefix data-extraction functions: `extract_`, `collect_`, `build_`, `process_`
- Boolean-returning helpers use `is_` prefix: `is_internal`
- Entry point is always `main()`

**Variables:**
- `snake_case` for all local and module-level variables: `all_chunks`, `file_hash`, `base_url`
- Constants in `UPPER_SNAKE_CASE`: `BASE_URL`, `OUTPUT_FILE`, `HEADERS`, `MIN_DELAY`, `MAX_PAGE_WORDS`, `NOISE_SELECTORS`, `PG_CONFIG`
- Short, meaningful abbreviations acceptable for loop iterables: `r` (response), `rp` (robotparser), `c` (chunk), `a` (anchor)

**Types:**
- No custom classes — pure procedural style, data represented as `dict`, `list`, and primitives
- Module-level constants typed implicitly (no annotation on constants)

## Code Style

**Formatting:**
- No automated formatter detected (no `.black`, `.prettierrc`, `pyproject.toml` with tool config)
- 4-space indentation throughout
- Single blank line between logical blocks within functions; double blank lines between top-level function definitions
- Inline comments use German language matching docstrings and print output

**Linting:**
- No linting config detected (no `.flake8`, `.pylintrc`, `mypy.ini`, `ruff.toml`)
- Style is manually consistent across the three files

**String Style:**
- f-strings used exclusively for interpolation: `f"  {path}: {len(page_data['content'])} Zeichen"`
- Double quotes for string literals; single quotes used inside f-strings for dict key access

## Import Organization

**Order:**
1. Standard library imports (alphabetical within block): `hashlib`, `json`, `random`, `re`, `time`, `uuid`
2. Third-party imports: `psycopg2`, `requests`, `bs4`
3. No local package imports (project has no package structure)

**Path Aliases:**
- None — no package structure, scripts run from their containing directories

**Example from `knowledge_base/scraper.py`:**
```python
import time
import json
import random
import re
import urllib.robotparser
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
```

## Error Handling

**Patterns:**
- HTTP errors are caught per-exception type and logged to stdout, then the function returns `None`; callers check for `None` before proceeding
- Broad `except Exception: pass` used only for non-critical setup (robots.txt fetch in `knowledge_base/scraper.py:66`)
- `raise_for_status()` used for embedding API calls in `ingest_to_postgres.py:33` — HTTP failures propagate as exceptions (no try/except wrapper)
- Database operations in `ingest_to_postgres.py` have no explicit error handling; failures propagate up and terminate the script
- Guard clauses with early `return []` or `return None` for empty/insufficient data (e.g., `rag_processor.py:123-124`)

**Retry logic pattern (`knowledge_base/scraper.py:76-99`):**
```python
for attempt in range(retries + 1):
    try:
        r = session.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        return r
    except requests.HTTPError as e:
        print(f"    HTTP-Fehler {e.response.status_code} – übersprungen.")
        return None
    except requests.ReadTimeout:
        if attempt < retries:
            ...
        else:
            return None
    except requests.RequestException as e:
        print(f"    Fehler: {e} – übersprungen.")
        return None
```

## Logging

**Framework:** `print()` — no logging library used

**Patterns:**
- Progress output uses section headers: `print("\n=== Hauptseite ===")`
- Indented sub-items use 2-space or 4-space indent in print strings to convey hierarchy
- Prefix tags used in `ingest_to_postgres.py`: `[skip]`, `[clean]`, `[info]`, `[done]`
- Counts and stats printed as summary at end of `main()` in every script
- Unicode checkmark used for success: `✓ Fertig. {n} Seiten gecrawlt.`

## Comments

**When to Comment:**
- Section dividers for logical blocks, using `# ── Section Name ──────` pattern with em-dash and box-drawing characters
- Inline comments explain non-obvious business logic (delay rationale, TYPO3-specific selectors)
- Comments are in German matching the surrounding print output and docstrings

**Docstrings:**
- Module-level docstring on every file (triple-quoted, 2–3 lines)
- Function docstrings used selectively: only when the purpose isn't obvious from the name
- Single-line docstrings preferred: `"""Entfernt Rauschen (Nav, Footer, Scripts) aus dem Soup-Objekt."""`
- Multi-line docstrings used when explaining algorithm or domain rule (e.g., `rejoin_orphaned_lines` in `knowledge_base/rag_processor.py:32-36`)

## Function Design

**Size:** Functions stay focused — typically 10–30 lines. `crawl()` in `knowledge_base/scraper.py` is the longest at ~100 lines, subdivided by section comments.

**Parameters:**
- Typed using Python 3.10+ union syntax: `str | None`, `requests.Response | None`
- Default parameters used for optional config: `retries: int = 2`, `doc_type_override: str | None = None`
- Functions accept only what they need — `BeautifulSoup` object passed in, not a URL to fetch internally

**Return Values:**
- Return type annotations present on all public functions
- Return `None` explicitly (via `-> ... | None`) for fallible operations
- Return empty `[]` or `{}` rather than `None` when caller iterates the result

## Module Design

**Structure:**
- Each script is a standalone executable module: `if __name__ == "__main__": main()`
- No shared library/package — scripts import only from stdlib and third-party packages
- Module-level constants serve as configuration (hardcoded values, not env-var driven)
- Functions grouped by logical role, separated by `# ── Section ──` dividers

**Exports:**
- No `__all__` — not intended for import as a library
- Scripts are run directly, not imported

---

*Convention analysis: 2026-06-13*
