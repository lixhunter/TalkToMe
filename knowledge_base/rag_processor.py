"""
RAG-Prozessor für jena-digital.de
Chunking-Strategie: eine Seite = ein Chunk.
Seiten > MAX_PAGE_WORDS werden mit Fixed-Size + Overlap aufgeteilt.
"""

import json
import re
import uuid
from collections import Counter
from urllib.parse import urlparse

INPUT_FILE  = "raw/jena_digital_full.json"
OUTPUT_FILE = "chunks/jena_digital_chunks.jsonl"

MAX_PAGE_WORDS = 1500  # ~2000 Token — Grenze für einen einzelnen Chunk
OVERLAP_WORDS  = 75    # Wörter Überlappung bei Seitenaufteilung

# ── Text-Cleaning ─────────────────────────────────────────────────────────────

NOISE_PATTERNS = [
    r"mehr erfahren",
    r"Jetzt anmelden",
    r"zur Anmeldung",
    r"hier klicken",
    r"\xa0",
    r"^\s*[\|\-–]\s*$",
    r"Cookie.*?akzeptieren",
]

def rejoin_orphaned_lines(text: str) -> str:
    """
    TYPO3 erzeugt Waise-Zeilen aus <strong>/<a>-Tags.
    Regel: eine Zeile mit < 6 Wörtern ohne Satzabschluss wird mit
    der nächsten Zeile zusammengeführt.
    """
    lines = text.split("\n")
    result: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            result.append("")
            continue
        if (result
                and result[-1]
                and len(result[-1].split()) < 6
                and not result[-1].rstrip().endswith((".", "!", "?", ":", ";"))):
            result[-1] = result[-1].rstrip() + " " + stripped
        else:
            result.append(stripped)
    return "\n".join(result)


def clean_text(text: str) -> str:
    for pattern in NOISE_PATTERNS:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)
    text = rejoin_orphaned_lines(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"^\s+|\s+$", "", text, flags=re.MULTILINE)
    return text.strip()


# ── Dokument-Typ-Klassifizierung ──────────────────────────────────────────────

def classify_doc_type(path: str, headings: list) -> str:
    if "aktuelles/detail" in path:
        return "news_article"
    if "veranstaltungen" in path:
        return "event"
    if "mitglied-werden" in path or "satzung" in path.lower():
        return "legal_doc"
    heading_text = " ".join(headings).lower()
    if any(kw in heading_text for kw in ("satzung", "compliance", "beitragsordnung")):
        return "legal_doc"
    return "org_page"


# ── Chunking ──────────────────────────────────────────────────────────────────

def page_to_chunks(text: str) -> list[str]:
    """Eine Seite = ein Chunk. Nur bei sehr langen Seiten aufteilen."""
    words = text.split()
    if len(words) <= MAX_PAGE_WORDS:
        return [text]
    parts = []
    start = 0
    while start < len(words):
        end = min(start + MAX_PAGE_WORDS, len(words))
        parts.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start += MAX_PAGE_WORDS - OVERLAP_WORDS
    return parts


# ── Chunk-Builder ─────────────────────────────────────────────────────────────

def build_chunk(text: str, url: str, path: str, doc_type: str,
                title: str, date: str | None,
                part_index: int = 0, total_parts: int = 1) -> dict:
    meta = {
        "source":        url,
        "path":          path,
        "doc_type":      doc_type,
        "source_format": "html",
        "title":         title,
        "date":          date,
        "site":          "jena-digital.de",
    }
    if total_parts > 1:
        meta["part_index"]  = part_index
        meta["total_parts"] = total_parts
    return {"id": str(uuid.uuid4()), "text": text, "metadata": meta}


# ── Haupt-Prozessierung ───────────────────────────────────────────────────────

def process_document(text: str, title: str, url: str, path: str,
                     date: str | None, headings: list,
                     doc_type_override: str | None = None) -> list[dict]:
    text = clean_text(text)
    if not text or len(text.split()) < 20:
        return []

    doc_type = doc_type_override or classify_doc_type(path, headings)
    parts    = page_to_chunks(text)

    return [
        build_chunk(part, url, path, doc_type, title, date, i, len(parts))
        for i, part in enumerate(parts)
    ]


def dedup_chunks(chunks: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    result = []
    for c in chunks:
        key = (c["text"].strip(), c["metadata"]["path"])
        if key not in seen:
            seen.add(key)
            result.append(c)
    return result


def main():
    data = json.load(open(INPUT_FILE, encoding="utf-8"))
    all_chunks: list[dict] = []

    # ── Navigationsseiten ─────────────────────────────────────────────────────
    print("Verarbeite Navigationsseiten...")
    for path, page in data["pages"].items():
        url      = page.get("url", f"https://jena-digital.de{path}")
        title    = page.get("title", path)
        text     = page.get("content", "")
        headings = page.get("headings", [])
        chunks   = process_document(text, title, url, path, None, headings)
        all_chunks.extend(chunks)
        print(f"  {path}: {len(chunks)} Chunk(s), {len(text.split())} Wörter")

    # ── News-Artikel (Volltext) ───────────────────────────────────────────────
    print("\nVerarbeite News-Artikel...")
    for article in data.get("news_articles", []):
        content = article.get("content")
        if not content:
            print(f"  FEHLT (Timeout): {article['path'][-60:]}")
            continue
        url   = content.get("url", f"https://jena-digital.de{article['path']}")
        title = content.get("title", article["path"])
        text  = content.get("content", "")
        date  = extract_date_from_text(text)
        chunks = process_document(text, title, url, article["path"], date,
                                  content.get("headings", []))
        all_chunks.extend(chunks)
        print(f"  {article['path'][-60:]}: {len(chunks)} Chunk(s)")

    # ── Events-Archiv ─────────────────────────────────────────────────────────
    print("\nVerarbeite Events-Archiv...")
    for event in data.get("events_archive", []):
        content = event.get("content")
        if not content:
            continue
        url   = content.get("url", f"https://jena-digital.de{event['path']}")
        title = content.get("title", event["path"])
        text  = content.get("content", "")
        date  = extract_date_from_text(text)
        chunks = process_document(text, title, url, event["path"], date,
                                  content.get("headings", []))
        all_chunks.extend(chunks)
        print(f"  {event['path'][-60:]}: {len(chunks)} Chunk(s)")

    # ── Post-Processing ───────────────────────────────────────────────────────
    before = len(all_chunks)
    all_chunks = dedup_chunks(all_chunks)
    print(f"\nPost-Processing: {before} → {len(all_chunks)} Chunks (Duplikate entfernt)")

    # ── JSONL schreiben ───────────────────────────────────────────────────────
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        for chunk in all_chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + "\n")

    print(f"\n✓ {len(all_chunks)} Chunks → {OUTPUT_FILE}")

    doc_types = Counter(c["metadata"]["doc_type"] for c in all_chunks)
    print("\nChunks nach Dokument-Typ:")
    for k, v in doc_types.most_common():
        print(f"  {k}: {v}")

    lens = [len(c["text"].split()) for c in all_chunks]
    print(f"\nText-Länge (Wörter): min={min(lens)}  avg={round(sum(lens)/len(lens))}  max={max(lens)}")


def extract_date_from_text(text: str) -> str | None:
    m = re.search(r"\b\d{1,2}\.\d{1,2}\.\d{4}\b", text)
    return m.group() if m else None


if __name__ == "__main__":
    main()
