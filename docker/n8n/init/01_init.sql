-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Tracks ingested documents and their content hash
CREATE TABLE IF NOT EXISTS document_records (
    filename   TEXT PRIMARY KEY,
    file_hash  TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores text chunks + embeddings (1024 dimensions — fits mxbai-embed-large, bge-m3, etc.)
-- n8n's PGVector node expects: id, text, metadata (jsonb), embedding (vector)
CREATE TABLE IF NOT EXISTS document_embeddings (
    id        BIGSERIAL PRIMARY KEY,
    text      TEXT,
    metadata  JSONB,
    embedding VECTOR(1024)
);

-- Index for fast similarity search
CREATE INDEX IF NOT EXISTS document_embeddings_embedding_idx
    ON document_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
