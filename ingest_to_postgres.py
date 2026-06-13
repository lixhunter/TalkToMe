#!/usr/bin/env python3
"""
One-shot ingestion script: reads a JSONL chunk file and inserts into PostgreSQL + pgvector.
Implements Record Manager logic: skips if file hash is unchanged, deletes old vectors first.
"""

import json
import hashlib
import sys
import psycopg2
import requests

# ── Config ────────────────────────────────────────────────────────────────────
JSONL_FILE      = "knowledge_base/chunks/jena_digital_chunks.jsonl"
LMSTUDIO_URL    = "http://192.168.2.185:1234/v1/embeddings"
LMSTUDIO_MODEL  = "text-embedding-embeddinggemma-300m-qat"  # 768 dims
PG_CONFIG    = {
    "host":     "192.168.2.185",
    "port":     5432,
    "dbname":   "rag_db",
    "user":     "rag_user",
    "password": "rag_password",
}
# ─────────────────────────────────────────────────────────────────────────────


def get_embedding(text: str) -> list[float]:
    resp = requests.post(
        LMSTUDIO_URL,
        json={"model": LMSTUDIO_MODEL, "input": text},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


def vec_to_pg(embedding: list[float]) -> str:
    return "[" + ",".join(str(x) for x in embedding) + "]"


def main():
    filename = JSONL_FILE.split("/")[-1]

    # Compute hash of entire file
    with open(JSONL_FILE, "rb") as f:
        file_hash = hashlib.sha256(f.read()).hexdigest()

    conn = psycopg2.connect(**PG_CONFIG)
    cur  = conn.cursor()

    # ── Record Manager check ──────────────────────────────────────────────────
    cur.execute("SELECT file_hash FROM document_records WHERE filename = %s", (filename,))
    row = cur.fetchone()
    if row and row[0] == file_hash:
        print(f"[skip] '{filename}' ist unverändert (Hash match). Nichts zu tun.")
        cur.close(); conn.close(); return

    # ── Delete old vectors ────────────────────────────────────────────────────
    cur.execute("DELETE FROM document_embeddings WHERE metadata->>'filename' = %s", (filename,))
    deleted = cur.rowcount
    if deleted:
        print(f"[clean] {deleted} alte Vektoren gelöscht.")

    # ── Load chunks ───────────────────────────────────────────────────────────
    chunks = []
    with open(JSONL_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                chunks.append(json.loads(line))

    print(f"[info] {len(chunks)} Chunks geladen. Starte Embedding mit '{LMSTUDIO_MODEL}'...\n")

    # ── Embed + insert ────────────────────────────────────────────────────────
    for i, chunk in enumerate(chunks, 1):
        title = chunk.get("metadata", {}).get("title", "")[:60]
        print(f"  [{i:>3}/{len(chunks)}] {title}")

        embedding = get_embedding(chunk["text"])
        print(f"         dims={len(embedding)}  text_len={len(chunk['text'])} Zeichen")

        metadata = {
            **chunk.get("metadata", {}),
            "filename":  filename,
            "file_hash": file_hash,
            "chunk_id":  chunk.get("id", ""),
        }

        cur.execute(
            "INSERT INTO document_embeddings (text, metadata, embedding) VALUES (%s, %s, %s::vector)",
            (chunk["text"], json.dumps(metadata, ensure_ascii=False), vec_to_pg(embedding))
        )
        print(f"         → INSERT OK")

    # ── Upsert record ─────────────────────────────────────────────────────────
    cur.execute(
        """
        INSERT INTO document_records (filename, file_hash)
        VALUES (%s, %s)
        ON CONFLICT (filename) DO UPDATE
            SET file_hash = EXCLUDED.file_hash,
                updated_at = NOW()
        """,
        (filename, file_hash)
    )

    conn.commit()
    cur.close()
    conn.close()
    print(f"\n[done] {len(chunks)} Chunks erfolgreich in PostgreSQL gespeichert.")


if __name__ == "__main__":
    main()
