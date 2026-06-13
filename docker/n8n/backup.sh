#!/bin/bash
set -e

source .env

BACKUP_FILE="rag_backup_$(date +%Y%m%d_%H%M%S).sql"

echo "Creating backup: $BACKUP_FILE"
docker exec rag_postgres pg_dump \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --no-owner \
    --no-acl \
    > "$BACKUP_FILE"

echo "Done: $BACKUP_FILE"
