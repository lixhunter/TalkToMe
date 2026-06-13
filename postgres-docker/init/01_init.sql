-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tracks ingested pages and their content hash (one row per URL)
CREATE TABLE IF NOT EXISTS document_records (
    filename   TEXT PRIMARY KEY,
    file_hash  TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector store — UUID primary key matches LangChain PGVector's expected schema
-- Column name "text" is the LangChain default content column in n8n 2.x
CREATE TABLE IF NOT EXISTS document_embeddings (
    id        UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    text      TEXT,
    metadata  JSONB,
    embedding VECTOR(1024)
);

-- Index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS document_embeddings_embedding_idx
    ON document_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
