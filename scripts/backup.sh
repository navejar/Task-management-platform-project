#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_FILE="taskmanager_backup_${TIMESTAMP}.sql.gz"
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-taskmanager}"
DB_USER="${DB_USER:-postgres}"
SPACES_BUCKET="${DO_SPACES_BUCKET:?DO_SPACES_BUCKET is required}"
SPACES_REGION="${DO_SPACES_REGION:-nyc3}"
SPACES_ENDPOINT="https://${SPACES_REGION}.digitaloceanspaces.com"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD is required}"

pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"

echo "[$(date)] Backup created: ${BACKUP_FILE} ($(du -h "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1))"

export AWS_ACCESS_KEY_ID="${DO_SPACES_KEY:?DO_SPACES_KEY is required}"
export AWS_SECRET_ACCESS_KEY="${DO_SPACES_SECRET:?DO_SPACES_SECRET is required}"
export AWS_DEFAULT_REGION="$SPACES_REGION"

s3cmd put "${BACKUP_DIR}/${BACKUP_FILE}" \
  "s3://${SPACES_BUCKET}/backups/${BACKUP_FILE}" \
  --access_key="${DO_SPACES_KEY:?DO_SPACES_KEY is required}" \
  --secret_key="${DO_SPACES_SECRET:?DO_SPACES_SECRET is required}" \
  --host="${SPACES_REGION}.digitaloceanspaces.com" \
  --host-bucket="%(bucket)s.${SPACES_REGION}.digitaloceanspaces.com"

echo "[$(date)] Backup uploaded to Spaces: s3://${SPACES_BUCKET}/backups/${BACKUP_FILE}"

find "$BACKUP_DIR" -name 'taskmanager_backup_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "[$(date)] Backup process complete."
