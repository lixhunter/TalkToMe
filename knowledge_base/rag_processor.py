"""
RAG-Prozessor für jena-digital.de
Chunking-Strategie nach Artikel-Typ:
  news_article  → Sentence Window  (1 Satz Node, ±2 Sätze Kontext)
  event         → Fixed-Size       (512 Token ≈ 384 Wörter, 50 Token Overlap)
  org_page      → Hierarchical     (Seite → Abschnitt → Absatz, ~96 Wörter Leaf)
  legal_doc     → Hierarchical
"""

import json
import re
import uuid

INPUT_FILE  = "raw/jena_digital_full.json"
OUTPUT_FILE = "chunks/jena_digital_chunks.jsonl"

# Leaf-Node Zielgröße: ~128 Token ≈ 96 Wörter (AutoMerging-Prinzip)
TARGET_LEAF_WORDS = 96
MAX_LEAF_WORDS    = 220   # Obergrenze: ~256 Token

# Fixed-Size Parameter
MAX_WORDS = 384   # ~512 Token
OVERLAP   = 38    # ~50 Token

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
    Beispiel: "Jena Digital Safari 2026\n. Mehr als 50 Studierende..."
    Regel: eine Zeile mit < 6 Wörtern ohne Satzabschluss wird mit
    der nächsten Zeile zusammengeführt — kein Inhalt geht verloren.
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


# ── Satz-Splitter (Deutsch) ───────────────────────────────────────────────────

def split_sentences(text: str) -> list[str]:
    # Trenne an .!? gefolgt von Leerzeichen + Großbuchstabe (auch Umlaute)
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-ZÜÄÖA-Z])', text)
    # Filtere sehr kurze Fragmente (<= 20 Zeichen)
    return [s.strip() for s in sentences if len(s.strip()) > 20]


# ── Absatz-Splitter ───────────────────────────────────────────────────────────

def split_paragraphs(text: str) -> list[str]:
    paras = re.split(r"\n{2,}", text)
    return [p.strip() for p in paras if len(p.strip()) > 40]


# ── Abschnitt-Splitter (nach Headings) ───────────────────────────────────────

def split_sections(text: str) -> list[dict]:
    """Teilt Text an Heading-Grenzen. Gibt [{heading, body}] zurück."""
    # Zeilen die komplett in Großbuchstaben sind oder kurz und isoliert stehen
    lines = text.split("\n")
    sections = []
    current_heading = "Einleitung"
    current_body = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # Heading-Heuristik: kurze Zeile (<= 80 Zeichen), kein Satzende, gefolgt von Content
        is_heading = (
            len(stripped) <= 80
            and not stripped.endswith((".", ",", ";", ":"))
            and stripped[0].isupper()
            and len(stripped.split()) <= 10
        )
        if is_heading and current_body:
            sections.append({"heading": current_heading, "body": "\n".join(current_body)})
            current_heading = stripped
            current_body = []
        else:
            current_body.append(stripped)

    if current_body:
        sections.append({"heading": current_heading, "body": "\n".join(current_body)})

    return sections


# ── Chunking-Strategien ───────────────────────────────────────────────────────

def sentence_window_chunks(text: str, window: int = 2) -> list[dict]:
    """
    1 Satz pro Node (für Embedding), ±window Sätze als Kontext.
    Kurzfragmente (< 8 Wörter) werden mit dem vorherigen Satz zusammengeführt
    damit kein Inhalt verloren geht.
    """
    raw = split_sentences(text)

    # Fragmente < 8 Wörter an vorherigen Satz anhängen (kein Informationsverlust)
    sentences: list[str] = []
    for s in raw:
        if sentences and len(s.split()) < 8:
            sentences[-1] = sentences[-1].rstrip(". ") + " " + s
        else:
            sentences.append(s)

    chunks = []
    for i, sentence in enumerate(sentences):
        start   = max(0, i - window)
        end     = min(len(sentences), i + window + 1)
        context = " ".join(sentences[start:end])
        chunks.append({
            "text":            sentence,
            "context_window":  context,
            "chunk_strategy":  "sentence_window",
            "sentence_index":  i,
            "total_sentences": len(sentences),
        })
    return chunks


def fixed_size_chunks(text: str, max_words: int = MAX_WORDS, overlap: int = OVERLAP) -> list[dict]:
    """512-Token-Fenster mit 50-Token-Overlap (in Wörtern approximiert)."""
    words  = text.split()
    chunks = []
    start  = 0
    idx    = 0
    while start < len(words):
        end   = min(start + max_words, len(words))
        chunk = " ".join(words[start:end])
        chunks.append({
            "text":           chunk,
            "context_window": chunk,
            "chunk_strategy": "fixed_size",
            "chunk_index":    idx,
            "total_chunks":   None,  # wird unten gesetzt
        })
        if end == len(words):
            break
        start += max_words - overlap
        idx   += 1
    for c in chunks:
        c["total_chunks"] = len(chunks)
    return chunks


def split_oversized(text: str) -> list[str]:
    """
    Teilt einen einzelnen Absatz der MAX_LEAF_WORDS überschreitet mit
    Fixed-Size + Overlap. Kein Inhalt geht verloren.
    """
    words = text.split()
    parts = []
    start = 0
    while start < len(words):
        end = min(start + MAX_LEAF_WORDS, len(words))
        parts.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start += MAX_LEAF_WORDS - OVERLAP
    return parts


def merge_to_leaf_nodes(paragraphs: list[str]) -> list[str]:
    """
    Führt Geschwister-Absätze innerhalb einer Section zusammen bis
    TARGET_LEAF_WORDS erreicht sind (AutoMerging-Prinzip aus dem Artikel).
    Absätze > MAX_LEAF_WORDS werden vorher mit Fixed-Size gesplittet.
    Nie über Sektionsgrenzen hinweg — kein Inhalt geht verloren.
    """
    # Erst oversized Absätze aufbrechen
    expanded: list[str] = []
    for para in paragraphs:
        if len(para.split()) > MAX_LEAF_WORDS:
            expanded.extend(split_oversized(para))
        else:
            expanded.append(para)

    # Dann kleine Geschwister zusammenführen
    nodes: list[str] = []
    current_parts: list[str] = []
    current_words = 0

    for para in expanded:
        para_words = len(para.split())
        if current_words == 0:
            current_parts.append(para)
            current_words = para_words
        elif current_words + para_words <= MAX_LEAF_WORDS:
            current_parts.append(para)
            current_words += para_words
            if current_words >= TARGET_LEAF_WORDS:
                nodes.append("\n\n".join(current_parts))
                current_parts = []
                current_words = 0
        else:
            nodes.append("\n\n".join(current_parts))
            current_parts = [para]
            current_words = para_words

    if current_parts:
        nodes.append("\n\n".join(current_parts))

    return nodes


def hierarchical_chunks(text: str, page_title: str) -> list[dict]:
    """
    3-stufige Hierarchie: Seite → Abschnitt → Leaf-Node.
    Leaf-Nodes: ~96 Wörter (≈128 Token).
    context_window = voller Abschnittstext (für Generation via AutoMerge).
    """
    chunks = []
    sections = split_sections(text)

    for sec_idx, section in enumerate(sections):
        paragraphs = split_paragraphs(section["body"])
        if not paragraphs:
            paragraphs = [section["body"]]

        leaf_nodes = merge_to_leaf_nodes(paragraphs)

        for node_idx, node_text in enumerate(leaf_nodes):
            chunks.append({
                "text":            node_text,
                "context_window":  section["body"],   # Parent-Section als Kontext
                "chunk_strategy":  "hierarchical",
                "level":           "paragraph",
                "parent_section":  section["heading"],
                "parent_page":     page_title,
                "section_index":   sec_idx,
                "node_index":      node_idx,
                "total_nodes":     len(leaf_nodes),
                "total_sections":  len(sections),
            })

    return chunks


# ── Routing ───────────────────────────────────────────────────────────────────

def route_and_chunk(text: str, doc_type: str, page_title: str) -> list[dict]:
    # Artikel-Routing nach Dokument-Typ (Tabelle aus dem Artikel)
    if doc_type == "news_article":
        return sentence_window_chunks(text)
    if doc_type == "event":
        return fixed_size_chunks(text)
    if doc_type in ("org_page", "legal_doc"):
        return hierarchical_chunks(text, page_title)
    # Fallback: Fixed-Size 512/50
    return fixed_size_chunks(text)


# ── Post-Processing: winzige Geschwister zusammenführen ──────────────────────

MIN_CHUNK_WORDS = 30   # Chunks unter dieser Grenze werden gemergt

def dedup_chunks(chunks: list[dict]) -> list[dict]:
    """Entfernt exakte Duplikate (gleicher text + gleicher path)."""
    seen: set[tuple] = set()
    result = []
    for c in chunks:
        key = (c["text"].strip(), c["metadata"]["path"])
        if key not in seen:
            seen.add(key)
            result.append(c)
    return result


def merge_tiny_siblings(chunks: list[dict]) -> list[dict]:
    """
    Führt aufeinanderfolgende hierarchical-Chunks zusammen:
    - Innerhalb gleicher Section: immer wenn unter MAX_LEAF_WORDS
    - Über Sektionsgrenzen: nur wenn BEIDE Chunks < MIN_CHUNK_WORDS
      (z.B. Firmennamen-Listen die der Section-Splitter falsch trennt)
    Kein Inhalt geht verloren.
    """
    if not chunks:
        return chunks

    result: list[dict] = []
    i = 0
    while i < len(chunks):
        c = chunks[i]
        if c["metadata"]["chunk_strategy"] != "hierarchical":
            result.append(c)
            i += 1
            continue

        c_words = len(c["text"].split())
        if c_words >= MIN_CHUNK_WORDS:
            result.append(c)
            i += 1
            continue

        # Sammle Nachfolger die gemergt werden können
        group = [c]
        j = i + 1
        while j < len(chunks):
            nxt = chunks[j]
            if nxt["metadata"]["chunk_strategy"] != "hierarchical":
                break
            if nxt["metadata"]["path"] != c["metadata"]["path"]:
                break

            nxt_words     = len(nxt["text"].split())
            combined      = sum(len(g["text"].split()) for g in group) + nxt_words
            same_section  = nxt["metadata"]["parent_section"] == c["metadata"]["parent_section"]
            both_tiny     = nxt_words < MIN_CHUNK_WORDS

            can_merge = combined <= MAX_LEAF_WORDS and (same_section or both_tiny)
            if not can_merge:
                break

            group.append(nxt)
            j += 1

        if len(group) == 1:
            result.append(c)
        else:
            merged_text = "\n\n".join(g["text"] for g in group)
            merged = dict(group[0])
            merged["id"]   = str(uuid.uuid4())
            merged["text"] = merged_text
            merged["metadata"] = dict(group[0]["metadata"])
            merged["metadata"]["context_window"] = group[0]["metadata"]["context_window"]
            merged["metadata"]["total_nodes"]    = 1
            result.append(merged)

        i = j

    return result


# ── Chunk-Builder ─────────────────────────────────────────────────────────────

def build_chunk(raw: dict, extra_meta: dict) -> dict:
    """Fügt Standard-Metadaten zu einem rohen Chunk hinzu."""
    return {
        "id":       str(uuid.uuid4()),
        "text":     raw["text"],
        "metadata": {
            **extra_meta,
            "context_window":  raw.get("context_window"),
            "chunk_strategy":  raw.get("chunk_strategy"),
            # Strategie-spezifische Felder
            **{k: v for k, v in raw.items()
               if k not in ("text", "context_window", "chunk_strategy")},
        },
    }


# ── Haupt-Prozessierung ───────────────────────────────────────────────────────

def process_document(text: str, title: str, url: str, path: str,
                     date: str | None, headings: list) -> list[dict]:
    text = clean_text(text)
    if not text or len(text.split()) < 20:
        return []

    doc_type = classify_doc_type(path, headings)
    raw_chunks = route_and_chunk(text, doc_type, title or path)

    base_meta = {
        "source":        url,
        "path":          path,
        "doc_type":      doc_type,
        "source_format": "html",
        "title":         title,
        "date":          date,
        "site":          "jena-digital.de",
    }

    return [build_chunk(rc, base_meta) for rc in raw_chunks]


def main():
    data = json.load(open(INPUT_FILE, encoding="utf-8"))
    all_chunks: list[dict] = []

    # ── Hauptseite: News + Event Teaser ──────────────────────────────────────
    print("Verarbeite Startseite...")
    hp = data["homepage"]
    for item in hp.get("news_teaser", []):
        if not item.get("teaser"):
            continue
        text = f"{item['title']}\n{item['date'] or ''}\n{item['teaser']}"
        chunks = process_document(
            text, item["title"], item.get("url", ""), "/",
            item.get("date"), [],
        )
        # Override doc_type für Teaser
        for c in chunks:
            c["metadata"]["doc_type"] = "news_teaser"
        all_chunks.extend(chunks)

    for item in hp.get("events_teaser", []):
        if not item.get("teaser"):
            continue
        text = f"{item['title']}\n{item['date'] or ''}\n{item['teaser']}"
        chunks = process_document(
            text, item["title"], item.get("url", ""), "/",
            item.get("date"), [],
        )
        for c in chunks:
            c["metadata"]["doc_type"] = "event_teaser"
        all_chunks.extend(chunks)

    # ── Navigationsseiten ─────────────────────────────────────────────────────
    print("Verarbeite Navigationsseiten...")
    for path, page in data["pages"].items():
        url      = page.get("url", f"https://jena-digital.de{path}")
        title    = page.get("title", path)
        text     = page.get("content", "")
        headings = page.get("headings", [])
        chunks   = process_document(text, title, url, path, None, headings)
        all_chunks.extend(chunks)
        print(f"  {path}: {len(chunks)} Chunks")

    # ── News-Artikel (Volltext) ───────────────────────────────────────────────
    print("Verarbeite News-Artikel...")
    for article in data.get("news_articles", []):
        content = article.get("content")
        if not content:
            print(f"  FEHLT (Timeout): {article['path'][-60:]}")
            continue
        url   = content.get("url", urljoin_simple(article["path"]))
        title = content.get("title", article["path"])
        text  = content.get("content", "")
        date  = extract_date_from_text(text)
        chunks = process_document(text, title, url, article["path"], date, content.get("headings", []))
        all_chunks.extend(chunks)
        print(f"  {article['path'][-60:]}: {len(chunks)} Chunks")

    # ── Events-Archiv ─────────────────────────────────────────────────────────
    for event in data.get("events_archive", []):
        content = event.get("content")
        if not content:
            continue
        url   = content.get("url", urljoin_simple(event["path"]))
        title = content.get("title", event["path"])
        text  = content.get("content", "")
        date  = extract_date_from_text(text)
        chunks = process_document(text, title, url, event["path"], date, content.get("headings", []))
        all_chunks.extend(chunks)

    # ── Post-Processing ───────────────────────────────────────────────────────
    before = len(all_chunks)
    all_chunks = dedup_chunks(all_chunks)
    all_chunks = merge_tiny_siblings(all_chunks)
    print(f"\nPost-Processing: {before} → {len(all_chunks)} Chunks (Duplikate + Tiny-Merges)")

    # ── JSONL schreiben ───────────────────────────────────────────────────────
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        for chunk in all_chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + "\n")

    print(f"\n✓ {len(all_chunks)} Chunks → {OUTPUT_FILE}")

    # Statistik nach Strategie und Doc-Typ
    from collections import Counter
    strategies = Counter(c["metadata"]["chunk_strategy"] for c in all_chunks)
    doc_types  = Counter(c["metadata"]["doc_type"]       for c in all_chunks)
    print("\nChunks nach Strategie:")
    for k, v in strategies.most_common():
        print(f"  {k}: {v}")
    print("\nChunks nach Dokument-Typ:")
    for k, v in doc_types.most_common():
        print(f"  {k}: {v}")


def urljoin_simple(path: str) -> str:
    return f"https://jena-digital.de{path}"


def extract_date_from_text(text: str) -> str | None:
    m = re.search(r"\b\d{1,2}\.\d{1,2}\.\d{4}\b", text)
    return m.group() if m else None


if __name__ == "__main__":
    main()
