#!/bin/sh
set -eu

HEARTBEAT_FILE="${BACKUP_HEARTBEAT_FILE:-/tmp/wa-sender-backup-heartbeat}"
MAX_AGE_SECONDS="${BACKUP_HEALTH_MAX_AGE_SECONDS:-172800}"

case "${MAX_AGE_SECONDS}" in
  ''|*[!0-9]*|0)
    echo "Invalid BACKUP_HEALTH_MAX_AGE_SECONDS." >&2
    exit 2
    ;;
esac

if [ ! -f "${HEARTBEAT_FILE}" ]; then
  echo "Backup heartbeat is missing: ${HEARTBEAT_FILE}" >&2
  exit 1
fi

heartbeat_epoch="$(stat -c %Y "${HEARTBEAT_FILE}")"
now_epoch="$(date +%s)"
age_seconds="$((now_epoch - heartbeat_epoch))"

if [ "${age_seconds}" -lt 0 ]; then
  age_seconds=0
fi

if [ "${age_seconds}" -gt "${MAX_AGE_SECONDS}" ]; then
  echo "Backup heartbeat is stale: ${age_seconds}s > ${MAX_AGE_SECONDS}s." >&2
  exit 1
fi

printf 'backup heartbeat fresh: %ss\n' "${age_seconds}"
