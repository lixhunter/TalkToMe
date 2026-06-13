# Testing Patterns

**Analysis Date:** 2026-06-13

## Test Framework

**Runner:** Not detected — no test framework is installed or configured.

**Assertion Library:** None

**Run Commands:**
```bash
# No test commands available — no test runner configured
```

## Test File Organization

**Location:** No test files exist in the repository.

**Naming:** No convention established.

**Structure:**
```
# No test directory structure exists
knowledge_base/
├── scraper.py        # No accompanying test_scraper.py
├── rag_processor.py  # No accompanying test_rag_processor.py
ingest_to_postgres.py # No accompanying test file
```

## Test Structure

**Suite Organization:** Not applicable — no tests written.

**Patterns:** None established.

## Mocking

**Framework:** None

**What to Mock (recommendations for future tests):**
- `requests.Session.get` in `knowledge_base/scraper.py` — network calls in `polite_get()`
- `psycopg2.connect` in `ingest_to_postgres.py` — database connection
- `requests.post` in `ingest_to_postgres.py` — embedding API call to LM Studio
- `time.sleep` in `knowledge_base/scraper.py` — rate-limiting delays that slow tests

**What NOT to Mock:**
- Pure text-processing functions (`clean_text`, `rejoin_orphaned_lines`, `page_to_chunks`, `dedup_chunks`) — these are deterministic and should be tested with real input/output

## Fixtures and Factories

**Test Data:** None established.

**Location:** No fixture directory exists. Suggested location: `tests/fixtures/`.

**Available Data Files (usable as test fixtures):**
- `knowledge_base/raw/jena_digital_full.json` — real scraped output, usable as golden fixture for `rag_processor.py` tests
- `knowledge_base/chunks/jena_digital_chunks.jsonl` — real chunk output, usable for validating processor output format

## Coverage

**Requirements:** None enforced — no coverage tool configured.

**View Coverage:**
```bash
# No coverage tooling present; to add:
pip install pytest pytest-cov
pytest --cov=knowledge_base --cov=ingest_to_postgres
```

## Test Types

**Unit Tests:** Not present. High-value candidates:
- `knowledge_base/rag_processor.py`: `clean_text()`, `rejoin_orphaned_lines()`, `page_to_chunks()`, `classify_doc_type()`, `dedup_chunks()` — all pure functions with no external dependencies
- `knowledge_base/scraper.py`: `is_internal()`, `extract_news_cards()`, `extract_event_cards()`, `extract_contact()` — testable with a pre-parsed `BeautifulSoup` object from a HTML string

**Integration Tests:** Not present. High-value candidates:
- `knowledge_base/scraper.py`: Full `crawl()` against a mocked HTTP session
- `ingest_to_postgres.py`: `main()` against a test PostgreSQL database

**E2E Tests:** Not applicable — scripts are CLI tools, not a service.

## Common Patterns

**Async Testing:** Not applicable — codebase is fully synchronous.

**Error Testing (recommendations):**
```python
# Example pattern for testing polite_get retry logic
from unittest.mock import patch, MagicMock
import requests

def test_polite_get_retries_on_timeout():
    session = MagicMock()
    session.get.side_effect = requests.ReadTimeout
    with patch("time.sleep"):
        result = polite_get("http://example.com", session, retries=1)
    assert result is None
    assert session.get.call_count == 2  # initial + 1 retry
```

**Pure Function Testing (pattern for rag_processor.py):**
```python
def test_clean_text_removes_noise():
    from knowledge_base.rag_processor import clean_text
    raw = "mehr erfahren\n\nSome useful content here."
    result = clean_text(raw)
    assert "mehr erfahren" not in result
    assert "Some useful content here." in result

def test_page_to_chunks_splits_long_text():
    from knowledge_base.rag_processor import page_to_chunks, MAX_PAGE_WORDS
    words = ["word"] * (MAX_PAGE_WORDS + 100)
    text = " ".join(words)
    chunks = page_to_chunks(text)
    assert len(chunks) > 1
```

## Recommendations for Adding Tests

1. Create a `tests/` directory at the project root
2. Install `pytest`: `pip install pytest`
3. Start with pure functions in `knowledge_base/rag_processor.py` — no mocking required
4. Add `conftest.py` with a fixture providing a parsed `BeautifulSoup` from a sample HTML file for scraper tests
5. Use `pytest-cov` to track coverage as tests grow

---

*Testing analysis: 2026-06-13*
