#!/bin/bash
set -e

source .env

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: ./restore.sh <backup_file.sql>"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "File not found: $BACKUP_FILE"
    exit 1
fi

echo "Restoring from: $BACKUP_FILE"
docker exec -i rag_postgres psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    < "$BACKUP_FILE"

echo "Restore complete."
