#!/bin/sh
set -eu

INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

case "${INTERVAL_SECONDS}" in
  ''|*[!0-9]*|0)
    echo "Invalid BACKUP_INTERVAL_SECONDS: expected a positive integer." >&2
    exit 2
    ;;
esac

if [ "${BACKUP_RUN_ON_START:-true}" = "true" ]; then
  sh /scripts/backup.sh
fi

while true; do
  sleep "${INTERVAL_SECONDS}"
  sh /scripts/backup.sh
done
