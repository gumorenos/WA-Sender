#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
EXPORT_DIR="${BACKUP_EXPORT_DIR:-}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
LOG_RETENTION_DAYS="${BACKUP_LOG_RETENTION_DAYS:-90}"
HEARTBEAT_FILE="${BACKUP_HEARTBEAT_FILE:-/tmp/wa-sender-backup-heartbeat}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="${BACKUP_DIR}/${TIMESTAMP}"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

require_positive_integer() {
  name="$1"
  value="$2"

  case "${value}" in
    ''|*[!0-9]*|0)
      log "Invalid ${name}: expected a positive integer, received '${value}'."
      exit 2
      ;;
  esac
}

require_positive_integer "BACKUP_RETENTION_DAYS" "${RETENTION_DAYS}"
require_positive_integer "BACKUP_LOG_RETENTION_DAYS" "${LOG_RETENTION_DAYS}"

mkdir -p "${RUN_DIR}"

dump_database() {
  name="$1"
  host="$2"
  port="$3"
  user="$4"
  password="$5"
  database="$6"
  output="${RUN_DIR}/${name}.dump"

  if [ -z "${host}" ] || [ -z "${user}" ] || [ -z "${database}" ]; then
    log "Skipping ${name}: missing host, user or database."
    return 0
  fi

  log "Backing up ${name} from ${host}:${port}/${database}."
  PGPASSWORD="${password}" pg_dump \
    --host="${host}" \
    --port="${port}" \
    --username="${user}" \
    --dbname="${database}" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-acl \
    --file="${output}"

  (cd "${RUN_DIR}" && sha256sum "$(basename "${output}")" > "$(basename "${output}").sha256")
}

cleanup_app_logs() {
  if [ "${BACKUP_CLEANUP_LOGS:-true}" != "true" ]; then
    log "Skipping app log cleanup."
    return 0
  fi

  if [ -z "${POSTGRES_APP_HOST:-}" ] || [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_DB:-}" ]; then
    log "Skipping app log cleanup: app database config missing."
    return 0
  fi

  log "Cleaning app logs older than ${LOG_RETENTION_DAYS} days."
  PGPASSWORD="${POSTGRES_PASSWORD:-}" psql \
    --host="${POSTGRES_APP_HOST}" \
    --port="${POSTGRES_APP_PORT:-5432}" \
    --username="${POSTGRES_USER}" \
    --dbname="${POSTGRES_DB}" \
    --set=ON_ERROR_STOP=1 \
    --set=retention_days="${LOG_RETENTION_DAYS}" \
    --command="
      DELETE FROM campaign_events
      WHERE created_at < NOW() - make_interval(days => :'retention_days'::int);

      DELETE FROM audit_logs
      WHERE created_at < NOW() - make_interval(days => :'retention_days'::int)
        AND action NOT IN ('CREATED', 'UPDATED', 'DELETED', 'OPT_IN_CONFIRMED', 'OPT_OUT_REGISTERED');

      DELETE FROM playground_sessions
      WHERE updated_at < NOW() - make_interval(days => :'retention_days'::int);
    "
}

write_manifest() {
  manifest="${RUN_DIR}/manifest.txt"
  {
    echo "timestamp=${TIMESTAMP}"
    echo "retention_days=${RETENTION_DAYS}"
    echo "log_retention_days=${LOG_RETENTION_DAYS}"
    echo "contains_env_secrets=false"
    echo "contains_sensitive_data=true"
    echo "format=pg_dump_custom"
    echo "files="
    for file in "${RUN_DIR}"/*.dump; do
      if [ -f "${file}" ]; then
        echo "  $(basename "${file}")"
      fi
    done
  } > "${manifest}"
}

copy_to_export_dir() {
  if [ -z "${EXPORT_DIR}" ]; then
    return 0
  fi

  if [ ! -d "${EXPORT_DIR}" ] || [ ! -w "${EXPORT_DIR}" ]; then
    log "Export dir ${EXPORT_DIR} is not writable; skipping external copy."
    return 0
  fi

  export_run_dir="${EXPORT_DIR}/${TIMESTAMP}"
  mkdir -p "${export_run_dir}"
  cp -a "${RUN_DIR}/." "${export_run_dir}/"
  log "Copied backup to ${export_run_dir}."
}

prune_old_backups() {
  log "Pruning local backups older than ${RETENTION_DAYS} days."
  find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} \;

  if [ -n "${EXPORT_DIR}" ] && [ -d "${EXPORT_DIR}" ]; then
    log "Pruning exported backups older than ${RETENTION_DAYS} days."
    find "${EXPORT_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} \;
  fi
}

record_success() {
  heartbeat_dir="$(dirname "${HEARTBEAT_FILE}")"
  mkdir -p "${heartbeat_dir}"
  printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${HEARTBEAT_FILE}"
}

dump_database \
  "wa_sender_app" \
  "${POSTGRES_APP_HOST:-postgres-app}" \
  "${POSTGRES_APP_PORT:-5432}" \
  "${POSTGRES_USER:-}" \
  "${POSTGRES_PASSWORD:-}" \
  "${POSTGRES_DB:-}"

dump_database \
  "evolution" \
  "${POSTGRES_EVOLUTION_HOST:-postgres-evolution}" \
  "${POSTGRES_EVOLUTION_PORT:-5432}" \
  "${EVOLUTION_POSTGRES_USER:-}" \
  "${EVOLUTION_POSTGRES_PASSWORD:-}" \
  "${EVOLUTION_POSTGRES_DB:-}"

cleanup_app_logs
write_manifest
copy_to_export_dir
prune_old_backups
record_success

log "Backup completed: ${RUN_DIR}"
