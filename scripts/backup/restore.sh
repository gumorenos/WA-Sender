#!/bin/sh
set -eu

BACKUP_FILE="${1:-}"
TARGET_HOST="${2:-}"
TARGET_DB="${3:-}"
TARGET_USER="${4:-}"
TARGET_PORT="${5:-5432}"
TARGET_PASSWORD="${6:-${PGPASSWORD:-}}"

if [ -z "${BACKUP_FILE}" ] || [ -z "${TARGET_HOST}" ] || [ -z "${TARGET_DB}" ] || [ -z "${TARGET_USER}" ]; then
  cat >&2 <<'USAGE'
Usage:
  restore.sh /backups/20260507T010000Z/wa_sender_app.dump postgres-app wa_sender wa_sender 5432

Environment:
  PGPASSWORD must contain the target database password, or pass it as argument 6.
USAGE
  exit 2
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [ -f "${BACKUP_FILE}.sha256" ]; then
  (cd "$(dirname "${BACKUP_FILE}")" && sha256sum -c "$(basename "${BACKUP_FILE}.sha256")")
fi

echo "Restoring ${BACKUP_FILE} into ${TARGET_HOST}:${TARGET_PORT}/${TARGET_DB}."
PGPASSWORD="${TARGET_PASSWORD}" pg_restore \
  --host="${TARGET_HOST}" \
  --port="${TARGET_PORT}" \
  --username="${TARGET_USER}" \
  --dbname="${TARGET_DB}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "${BACKUP_FILE}"

echo "Restore completed."
