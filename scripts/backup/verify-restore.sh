#!/bin/sh
set -eu

BACKUP_FILE="${1:-}"
VERIFY_DB="${VERIFY_DB:-wa_sender_restore_check}"
TARGET_HOST="${POSTGRES_APP_HOST:-postgres-app}"
TARGET_PORT="${POSTGRES_APP_PORT:-5432}"
TARGET_USER="${POSTGRES_USER:-}"
TARGET_PASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: verify-restore.sh /backups/20260507T010000Z/wa_sender_app.dump" >&2
  exit 2
fi

if [ -z "${TARGET_USER}" ]; then
  echo "POSTGRES_USER is required." >&2
  exit 2
fi

echo "Creating temporary restore database ${VERIFY_DB}."
PGPASSWORD="${TARGET_PASSWORD}" dropdb --if-exists --host="${TARGET_HOST}" --port="${TARGET_PORT}" --username="${TARGET_USER}" "${VERIFY_DB}"
PGPASSWORD="${TARGET_PASSWORD}" createdb --host="${TARGET_HOST}" --port="${TARGET_PORT}" --username="${TARGET_USER}" "${VERIFY_DB}"

sh /scripts/restore.sh "${BACKUP_FILE}" "${TARGET_HOST}" "${VERIFY_DB}" "${TARGET_USER}" "${TARGET_PORT}" "${TARGET_PASSWORD}"

echo "Checking restored table count."
PGPASSWORD="${TARGET_PASSWORD}" psql \
  --host="${TARGET_HOST}" \
  --port="${TARGET_PORT}" \
  --username="${TARGET_USER}" \
  --dbname="${VERIFY_DB}" \
  --set=ON_ERROR_STOP=1 \
  --command="SELECT COUNT(*) AS restored_tables FROM information_schema.tables WHERE table_schema = 'public';"

PGPASSWORD="${TARGET_PASSWORD}" dropdb --host="${TARGET_HOST}" --port="${TARGET_PORT}" --username="${TARGET_USER}" "${VERIFY_DB}"
echo "Restore verification completed."
