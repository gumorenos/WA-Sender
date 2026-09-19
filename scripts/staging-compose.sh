#!/bin/sh
set -eu

ENV_FILE="${COMPOSE_ENV_FILE:-.env.production}"
EXPECTED_APP_HOST="${EXPECTED_APP_HOST:-wasender.gumorenos.space}"

node scripts/staging-preflight.mjs "$ENV_FILE"

exec docker compose \
  --env-file "$ENV_FILE" \
  -f docker-compose.yml \
  -f docker-compose.oracle.yml \
  "$@"
