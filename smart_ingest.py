#!/usr/bin/env python3
"""
smart_ingest.py — Seitentyp-bewusstes Chunking + Azure Embedding + PostgreSQL-Upsert

Strategie pro Seitentyp:
  /unser-team              → 1 Chunk/Person (aus bestehendem JSONL, da Namen vorhanden)
  fachgruppen-arbeitskreise → 1 Chunk/Fachgruppe (dedup, regex-split)
  news_articles             → 1 Chunk/Artikel (Titel + Datum + Text)
  events_archive            → 1 Chunk/Event
  org_pages (klein)         → 1 Chunk/Seite nach Bereinigung
  org_pages (groß)          → Split nach Abschnitten, max. ~600 Wörter/Chunk

Embedding: Azure text-embedding-3-small (1536 Dimensionen)
"""

import json, re, uuid, os, sys
import psycopg2, requests
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────────────

def load_env(path=".env"):
    """Minimaler .env-Parser — kein externes Paket nötig."""
    env_path = Path(path)
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

load_env()

AZURE_ENDPOINT   = os.environ["AZURE_OPENAI_ENDPOINT"].rstrip("/")
AZURE_KEY        = os.environ["AZURE_OPENAI_API_KEY"]
AZURE_DEPLOYMENT = os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "text-embedding-3-small")
AZURE_API_VER    = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-02-01")
EMBED_DIMS       = 1536

PG_CONFIG = {
    "host":     os.environ.get("PG_HOST", "192.168.2.185"),
    "port":     int(os.environ.get("PG_PORT", "5432")),
    "dbname":   os.environ.get("PG_DB", "rag_db"),
    "user":     os.environ.get("PG_USER", "rag_user"),
    "password": os.environ.get("PG_PASSWORD", "rag_password"),
}

RAW_JSON       = "knowledge_base/raw/jena_digital_full.json"
EXISTING_JSONL = "knowledge_base/chunks/jena_digital_chunks.jsonl"
MAX_WORDS      = 600   # Wörter pro Chunk bei generischen Seiten
OVERLAP_WORDS  = 50


# ── Azure Embedding ────────────────────────────────────────────────────────────

def get_embedding(text: str) -> list[float]:
    url = (
        f"{AZURE_ENDPOINT}/openai/deployments/{AZURE_DEPLOYMENT}"
        f"/embeddings?api-version={AZURE_API_VER}"
    )
    resp = requests.post(
        url,
        headers={"api-key": AZURE_KEY, "Content-Type": "application/json"},
        json={"input": text},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


# ── Text-Bereinigung ───────────────────────────────────────────────────────────

_NOISE_RE = re.compile(
    r"(mehr erfahren|Jetzt anmelden|zur Anmeldung|hier klicken"
    r"|Cookie.*?akzeptieren|MEHR INFOS|Previous|Next|\xa0)",
    flags=re.IGNORECASE,
)

def clean_text(text: str) -> str:
    text = _NOISE_RE.sub("", text)
    # TYPO3: kurze Waise-Zeilen an folgende Zeile hängen
    lines = text.split("\n")
    out: list[str] = []
    for line in lines:
        s = line.strip()
        if not s:
            out.append("")
            continue
        if (out and out[-1]
                and len(out[-1].split()) < 5
                and not out[-1].rstrip().endswith((".", "!", "?", ":", ";", ")"))):
            out[-1] = out[-1].rstrip() + " " + s
        else:
            out.append(s)
    text = "\n".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


def dedup_paragraphs(text: str) -> str:
    """Entfernt doppelte Absätze (TYPO3-Duplikat-Problem)."""
    seen: set[str] = set()
    result: list[str] = []
    for para in text.split("\n\n"):
        key = para.strip()[:100]
        if key and key not in seen:
            seen.add(key)
            result.append(para.strip())
    return "\n\n".join(result)


def split_by_words(text: str, max_words=MAX_WORDS, overlap=OVERLAP_WORDS) -> list[str]:
    """Wortbasierter Split mit Überlappung, hält Absatzgrenzen."""
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current: list[str] = []
    current_words = 0

    for para in paragraphs:
        pw = len(para.split())
        if current_words + pw > max_words and current:
            chunks.append("\n\n".join(current))
            # Letzten Absatz für Overlap behalten
            current = current[-1:] if overlap else []
            current_words = len(current[0].split()) if current else 0
        current.append(para)
        current_words += pw

    if current:
        chunks.append("\n\n".join(current))
    return chunks


# ── Chunk-Builder ──────────────────────────────────────────────────────────────

def make_chunk(text: str, url: str, path: str, doc_type: str,
               title: str, date: str | None = None,
               extra: dict | None = None) -> dict:
    meta = {
        "source":   url,
        "path":     path,
        "doc_type": doc_type,
        "title":    title,
        "date":     date,
        "site":     "jena-digital.de",
        **(extra or {}),
    }
    return {"id": str(uuid.uuid4()), "text": text.strip(), "metadata": meta}


def extract_date(text: str) -> str | None:
    m = re.search(r"\b\d{1,2}\.\d{1,2}\.\d{4}\b", text)
    return m.group() if m else None


# ── Chunking-Strategien ────────────────────────────────────────────────────────

_FG_NAME_VERBS = re.compile(
    r"\s+(stärkt|fördert|beschäftigt|setzt\s+sich|begleitet|identifiziert"
    r"|richtet\s+sich|macht|dient|umfasst|bietet|unterstützt|vernetzt)\b",
    re.IGNORECASE,
)
_GENERIC_STARTS = {
    "hat", "richtet", "macht", "diskutiert", "versteht", "stärkt", "umfasst",
    "bietet", "alle", "die", "den", "der", "das", "und", "ist", "sich", "eine",
    "an", "als",
}


def _fg_proper_name(raw: str) -> str | None:
    """Extrahiert den Eigennamen aus dem rohen Post-Split-Text.

    Gibt None zurück wenn es kein echter Fachgruppen-Name ist
    (z.B. 'hat den Anspruch...' oder 'richtet sich an...').
    """
    # Name steht vor dem ersten Hauptverb oder Zeilenumbruch
    lines = [l.strip() for l in raw.split("\n") if l.strip()]
    if not lines:
        return None

    # Ersten Satz nehmen, bis zum ersten Verb abschneiden
    first_line = lines[0]
    m = _FG_NAME_VERBS.search(first_line)
    name = first_line[:m.start()].strip() if m else first_line.strip()

    # Manchmal zweizeilig: "Digital\nExperiences" (nur wenn nächstes Wort auch Eigenname)
    if len(name.split()) < 2 and len(lines) > 1:
        next_word = lines[1].split()[0] if lines[1].split() else ""
        if (next_word and next_word[0].isupper()
                and next_word.lower() not in _GENERIC_STARTS):
            candidate = f"{name} {next_word}".strip()
            if len(candidate.split()) <= 5:
                name = candidate

    # Kein echter Eigenname wenn mit Verb oder Artikel beginnt
    first_word = name.split()[0].lower() if name else ""
    if first_word in _GENERIC_STARTS or not name or not name[0].isupper():
        return None

    return name


def chunk_fachgruppen(content: str, url: str, path: str) -> list[dict]:
    """1 Chunk pro Fachgruppe, interne Querverweise werden zusammengeführt."""
    # Inhalt ist ~3× wiederholt — nur erste Kopie behalten
    sig = "zentrales Organ"
    first = content.find(sig)
    second = content.find(sig, first + len(sig))
    if second > 0:
        content = content[:second - 30]

    content = clean_text(content)

    # Grob aufteilen: jede Section beginnt mit "Die Fachgruppe"
    parts = re.split(r"Die\s+Fachgruppe\b", content)

    chunks: list[dict] = []
    seen_names: set[str] = set()
    pending_text: str = ""   # Puffer für Teile ohne echten Namen (interne Refs)
    pending_name: str = ""

    def flush(name: str, text: str):
        nonlocal chunks
        if len(text.split()) < 10:
            return
        chunks.append(make_chunk(
            clean_text(text), url, path, "fachgruppe",
            f"Jena Digital Fachgruppe: {name}",
            extra={"fachgruppe": name},
        ))

    # Erster Teil = allgemeine Einführung (vor erstem "Die Fachgruppe")
    if parts and len(parts[0].split()) > 15:
        intro_text = f"Fachgruppen bei Jena Digital\n\n{parts[0].strip()}"
        chunks.append(make_chunk(
            intro_text, url, path, "fachgruppe",
            "Jena Digital: Fachgruppen Übersicht",
            extra={"fachgruppe": "Übersicht"},
        ))

    for part in parts[1:]:
        part = part.strip()
        if not part:
            continue

        name = _fg_proper_name(part)

        if name is None:
            # Kein echter Name → gehört zum vorherigen Chunk
            if pending_name:
                pending_text += "\n\n" + f"Die Fachgruppe {part}"
            continue

        # Echter Name gefunden
        name_key = name.lower()

        if pending_name and name_key == pending_name.lower():
            # Gleiche Fachgruppe, weiterer Abschnitt → anhängen
            pending_text += "\n\nDie Fachgruppe " + part
            continue

        if name_key in seen_names:
            # Globales Duplikat (Content-Wiederholung) → überspringen
            continue

        # Vorherigen Chunk flushen
        if pending_name:
            flush(pending_name, pending_text)
            seen_names.add(pending_name.lower())

        pending_name = name
        pending_text = f"Fachgruppe {part}"

    # Letzten Chunk flushen
    if pending_name and pending_name.lower() not in seen_names:
        flush(pending_name, pending_text)

    return chunks


def chunk_news_articles(articles: list) -> list[dict]:
    """1 Chunk pro News-Artikel."""
    chunks: list[dict] = []
    for article in articles:
        content = article.get("content")
        if not isinstance(content, dict):
            continue
        text  = content.get("content", "").strip()
        title = content.get("title", article["path"])
        url   = content.get("url", f"https://jena-digital.de{article['path']}")
        date  = extract_date(text)

        text = clean_text(dedup_paragraphs(text))
        if len(text.split()) < 15:
            continue
        chunks.append(make_chunk(text, url, article["path"], "news_article", title, date))
    return chunks


def chunk_events(events: list) -> list[dict]:
    """1 Chunk pro Event."""
    chunks: list[dict] = []
    for event in events:
        content = event.get("content")
        if not isinstance(content, dict):
            continue
        text  = content.get("content", "").strip()
        title = content.get("title", event["path"])
        url   = content.get("url", f"https://jena-digital.de{event['path']}")
        date  = extract_date(text)

        text = clean_text(dedup_paragraphs(text))
        if len(text.split()) < 10:
            continue
        chunks.append(make_chunk(text, url, event["path"], "event", title, date))
    return chunks


_FORM_NOISE_RE = re.compile(
    r"(Firmenname|Branche|Vertretungsberechtigte|Vollzeitäquivalente|Gründungsjahr"
    r"|Str,\s*Nr\.|PLZ,\s*Ort|Logo hochladen|jpeg oder png|Ansprechperson"
    r"|Wofür möchtet|Ich nehme die|Ich beantrage|Hiermit bestätige)",
    re.IGNORECASE,
)


def chunk_mitglied_werden(content: str, url: str, path: str, title: str) -> list[dict]:
    """Mitglied-werden: Vorteile + Mitgliedschaftstypen — Formularfelder weglassen."""
    content = clean_text(dedup_paragraphs(content))
    paras = [p for p in content.split("\n\n") if p.strip()]

    useful: list[str] = []
    for para in paras:
        # Absatz überspringen wenn er primär Formular-Noise enthält
        if _FORM_NOISE_RE.search(para):
            continue
        useful.append(para)

    text = "\n\n".join(useful)
    if len(text.split()) < 15:
        return []
    return chunk_generic_page(text, url, path, title, "org_page")


def chunk_members(content: str, url: str, path: str, title: str) -> list[dict]:
    """Mitgliederliste: 1 Intro-Chunk + 1 Mitglieder-Chunk."""
    content = clean_text(dedup_paragraphs(content))
    paragraphs = [p for p in content.split("\n\n") if p.strip()]

    # Erster Absatz = inhaltliche Einführung
    intro_parts = []
    list_parts  = []
    in_list = False
    for para in paragraphs:
        # Mitgliederliste beginnt mit "Mitglieder\nAlle\n..." Filterzeile
        if re.match(r"^Mitglieder\b", para) or in_list:
            in_list = True
            list_parts.append(para)
        else:
            intro_parts.append(para)

    chunks: list[dict] = []
    if intro_parts:
        chunks.append(make_chunk(
            "\n\n".join(intro_parts), url, path, "org_page",
            title + " – Über die Mitgliedschaft",
        ))
    if list_parts:
        chunks.append(make_chunk(
            "\n\n".join(list_parts), url, path, "org_page",
            title + " – Mitgliederliste",
        ))
    return chunks


def chunk_generic_page(content: str, url: str, path: str,
                       title: str, doc_type: str) -> list[dict]:
    """Standard-Seiten: dedup, bereinigen, bei Bedarf aufteilen."""
    content = clean_text(dedup_paragraphs(content))
    if len(content.split()) < 15:
        return []

    parts = split_by_words(content)
    chunks = []
    for i, part in enumerate(parts):
        t = title if len(parts) == 1 else f"{title} (Teil {i + 1}/{len(parts)})"
        chunks.append(make_chunk(part, url, path, doc_type, t))
    return chunks


# ── Haupt-Chunking ─────────────────────────────────────────────────────────────

def build_all_chunks(data: dict, existing_team_chunks: list[dict]) -> list[dict]:
    all_chunks: list[dict] = []

    print("── Team (aus bestehendem JSONL) ──────────────────────────────────")
    all_chunks.extend(existing_team_chunks)
    print(f"   {len(existing_team_chunks)} Team-Chunks übernommen")

    print("\n── Navigationsseiten ─────────────────────────────────────────────")
    for path, page in data["pages"].items():
        if path == "/unser-team":
            continue  # already handled above

        url     = page.get("url", f"https://jena-digital.de{path}")
        title   = page.get("title", path)
        content = page.get("content", "")

        if "fachgruppen" in path:
            chunks = chunk_fachgruppen(content, url, path)
        elif "unsere-mitglieder" in path:
            chunks = chunk_members(content, url, path, title)
        elif "mitglied-werden" in path:
            chunks = chunk_mitglied_werden(content, url, path, title)
        else:
            doc_type = "org_page"
            chunks = chunk_generic_page(content, url, path, title, doc_type)

        all_chunks.extend(chunks)
        words = sum(len(c["text"].split()) for c in chunks)
        print(f"   {path}: {len(chunks)} Chunk(s), {words} Wörter gesamt")

    print("\n── News-Artikel ──────────────────────────────────────────────────")
    news_chunks = chunk_news_articles(data.get("news_articles", []))
    all_chunks.extend(news_chunks)
    print(f"   {len(news_chunks)} Artikel-Chunks")

    print("\n── Events-Archiv ─────────────────────────────────────────────────")
    event_chunks = chunk_events(data.get("events_archive", []))
    all_chunks.extend(event_chunks)
    print(f"   {len(event_chunks)} Event-Chunks")

    # Globale Dedup (exakt gleicher Text)
    seen: set[str] = set()
    deduped: list[dict] = []
    for c in all_chunks:
        key = c["text"].strip()[:120]
        if key not in seen:
            seen.add(key)
            deduped.append(c)

    removed = len(all_chunks) - len(deduped)
    if removed:
        print(f"\n   ⚠  {removed} exakt-doppelte Chunks entfernt")

    return deduped


# ── PostgreSQL ─────────────────────────────────────────────────────────────────

def vec_to_pg(v: list[float]) -> str:
    return "[" + ",".join(str(x) for x in v) + "]"


def prepare_db(conn):
    """Stellt sicher dass document_embeddings vector(1536) hat und leer ist."""
    cur = conn.cursor()

    # Aktuelle Dimension prüfen
    cur.execute("""
        SELECT atttypmod
        FROM   pg_attribute
        WHERE  attrelid = 'document_embeddings'::regclass
          AND  attname  = 'embedding'
    """)
    row = cur.fetchone()

    if row is None:
        # Tabelle existiert nicht → anlegen
        print("[db] Tabelle document_embeddings wird angelegt ...")
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS document_embeddings (
                id        BIGSERIAL PRIMARY KEY,
                text      TEXT,
                metadata  JSONB,
                embedding vector({EMBED_DIMS})
            )
        """)
    else:
        current_dim = row[0]  # atttypmod = dim für vector
        if current_dim != EMBED_DIMS:
            print(f"[db] Dimension {current_dim} → {EMBED_DIMS}: Spalte wird umgebaut ...")
            cur.execute("ALTER TABLE document_embeddings DROP COLUMN embedding")
            cur.execute(f"ALTER TABLE document_embeddings ADD COLUMN embedding vector({EMBED_DIMS})")

        print("[db] Bestehende Embeddings löschen ...")
        cur.execute("TRUNCATE document_embeddings")

    cur.execute("TRUNCATE document_records")
    conn.commit()
    cur.close()


def insert_chunks(conn, chunks: list[dict]):
    cur = conn.cursor()
    for i, chunk in enumerate(chunks, 1):
        title  = chunk["metadata"].get("title", "")[:60]
        path   = chunk["metadata"].get("path", "")
        print(f"  [{i:>3}/{len(chunks)}] {path}  {title}")

        embedding = get_embedding(chunk["text"])
        assert len(embedding) == EMBED_DIMS, f"Dim-Fehler: {len(embedding)}"

        meta = {**chunk["metadata"], "chunk_id": chunk["id"]}
        cur.execute(
            "INSERT INTO document_embeddings (text, metadata, embedding) "
            "VALUES (%s, %s, %s::vector)",
            (chunk["text"], json.dumps(meta, ensure_ascii=False), vec_to_pg(embedding)),
        )

        cur.execute(
            """
            INSERT INTO document_records (filename, file_hash)
            VALUES (%s, %s)
            ON CONFLICT (filename) DO UPDATE
                SET file_hash = EXCLUDED.file_hash, updated_at = NOW()
            """,
            (path, chunk["id"]),
        )

        if i % 10 == 0:
            conn.commit()
            print(f"       → {i} Chunks committed")

    conn.commit()
    cur.close()


# ── Einstiegspunkt ─────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  smart_ingest.py — Jena Digital RAG")
    print("=" * 60)

    # Rohdaten laden
    print(f"\n[1/4] Lade {RAW_JSON} ...")
    with open(RAW_JSON, encoding="utf-8") as f:
        data = json.load(f)

    # Bestehende Team-Chunks laden (haben Personennamen)
    print(f"[1/4] Lade Team-Chunks aus {EXISTING_JSONL} ...")
    team_chunks: list[dict] = []
    if Path(EXISTING_JSONL).exists():
        with open(EXISTING_JSONL, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                c = json.loads(line)
                if c.get("metadata", {}).get("path") == "/unser-team":
                    team_chunks.append(c)
    print(f"       → {len(team_chunks)} Team-Chunks geladen")

    # Smart Chunking
    print("\n[2/4] Smart Chunking ...")
    chunks = build_all_chunks(data, team_chunks)
    print(f"\n       ✓ {len(chunks)} Chunks total")

    word_lens = [len(c["text"].split()) for c in chunks]
    print(f"       Wörter: min={min(word_lens)}  avg={round(sum(word_lens)/len(word_lens))}  max={max(word_lens)}")

    from collections import Counter
    types = Counter(c["metadata"]["doc_type"] for c in chunks)
    for dt, n in types.most_common():
        print(f"       {dt}: {n}")

    # PostgreSQL verbinden + vorbereiten
    print(f"\n[3/4] PostgreSQL ({PG_CONFIG['host']}) ...")
    try:
        conn = psycopg2.connect(**PG_CONFIG)
    except Exception as e:
        print(f"[FEHLER] Verbindung fehlgeschlagen: {e}")
        sys.exit(1)

    prepare_db(conn)

    # Embeddings erzeugen + einfügen
    print(f"\n[4/4] Embedding ({AZURE_DEPLOYMENT}) + Upsert ...")
    try:
        insert_chunks(conn, chunks)
    except Exception as e:
        conn.rollback()
        print(f"\n[FEHLER] {e}")
        conn.close()
        sys.exit(1)

    conn.close()
    print(f"\n{'=' * 60}")
    print(f"  ✓ {len(chunks)} Chunks erfolgreich eingebettet und gespeichert.")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
