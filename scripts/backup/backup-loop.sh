#!/bin/sh
set -eu

INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

if [ "${BACKUP_RUN_ON_START:-true}" = "true" ]; then
  sh /scripts/backup.sh
fi

while true; do
  sleep "${INTERVAL_SECONDS}"
  sh /scripts/backup.sh
done
