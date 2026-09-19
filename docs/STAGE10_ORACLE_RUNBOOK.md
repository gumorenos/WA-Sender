# Stage 10 — Oracle technical staging runbook

Target: `vnic-gumorenos` (`linux/arm64`) behind Cloudflare Tunnel. This is technical staging, not production.

## Non-negotiable safety gates

The staging preflight refuses to continue unless all are exact:

- `REAL_SENDING_ENABLED=false`
- `AGENT_AUTOREPLY_ENABLED=false`
- `AGENT_REAL_REPLY_ENABLED=false`
- `PRIVACY_RETENTION_ENABLED=false`
- `MOCK_LLM_ENABLED=true`
- `LLM_PROVIDER=mock`

Do not bypass the preflight to make a deployment pass.

## Network topology

Public traffic must terminate at Cloudflare Tunnel and reach only `127.0.0.1:3045`. The Oracle override disables the bundled Caddy by default. PostgreSQL, Redis and Evolution remain Docker-internal. Do not publish Evolution.

## Preflight

1. Use a CI-green immutable commit SHA, detached checkout and clean working tree.
2. Keep `.env.production` mode `0600`.
3. Configure Google OAuth for the staging hostname and closed-beta allowlist.
4. Run:

```sh
EXPECTED_APP_HOST=wasender.gumorenos.space node scripts/staging-preflight.mjs .env.production
./scripts/staging-compose.sh config -q
```

Any failure is a STOP condition. Infrastructure operators must not edit application code to work around it.

## Build and infrastructure

```sh
./scripts/staging-compose.sh build next-app
./scripts/staging-compose.sh up -d postgres-app redis postgres-evolution evolution-api
./scripts/staging-compose.sh --profile migrate run --rm app-migrate
./scripts/staging-compose.sh up -d next-app app-worker privacy-retention postgres-backup
```

Do not start `caddy` or `uptime-kuma` in this staging topology.

## Local validation before Cloudflare

```sh
./scripts/staging-compose.sh ps
curl -fsS http://127.0.0.1:3045/api/health
curl -fsS http://127.0.0.1:3045/api/health/ready
```

Confirm the app bind is loopback-only and no new public host ports appeared.

## Public ingress and OAuth

Cloudflare public hostname: `wasender.gumorenos.space` -> `http://127.0.0.1:3045`.

Google OAuth redirect URI: `https://wasender.gumorenos.space/api/auth/callback/google`.

Validate HTTPS, closed-beta login and tenant isolation before testing provider flows.

## Evolution validation

Use the pinned Evolution image from `.env.production.example`. Validate ARM64 startup, DB/Redis connectivity, instance creation, QR/status/reconnect and inbound webhook delivery. Evolution remains private.

Do not enable real sending during this phase. Use only deliberately controlled own-number tests after a separate explicit approval to change the sending gates.

## Failure/recovery QA

After baseline health is green, test one failure at a time and restore health between cases:

- restart app worker;
- duplicate webhook;
- stale webhook recovery;
- Redis unavailable;
- Evolution unavailable/timeout;
- LLM timeout using a controlled provider test later;
- unresolved provider result/reconciliation;
- backup creation and checksum;
- restore into an isolated database, never destructively over the active staging DB.

## Release evidence

Record immutable SHA, CI runs, architecture, Compose config validation, service health, OAuth, Evolution/QR, webhook, campaigns, agents, recovery tests, backup/restore and all residual warnings. A release candidate is not accepted while a required check or P0 is unresolved.
