# QA pre-beta — PR #28 Privacy Retention Runner

Este archivo complementa `docs/QA_PENDING.md` y `docs/QA_PREBETA_PENDING.md` sin sustituirlos.

## Evidencia automatizada

- PR #28: `agent/prebeta-privacy-retention-runner`.
- SHA validado: `8d10ca231a8068a1dfcb39180e0a97c55edea762`.
- CI run `32911870049` (#154), job `98007570357`: `success`.
- `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- Prisma generate + migraciones 0001–0008.
- Lint, checks de scripts y Compose local/producción: PASS.
- 201/201 tests, 48 archivos.
- Next 16.3.1 build + TypeScript: PASS.
- Backup/restore round-trip: PASS.
- Docker build: PASS.
- Smoke del runner de retención dentro de la imagen productiva: PASS.
- Heartbeat `success`: PASS.
- SIGTERM limpio con Node como PID 1: PASS.
- Runtime smoke normal, PostgreSQL + Redis readiness: PASS.

## Garantías implementadas

- `PRIVACY_RETENTION_ENABLED=false` por defecto; el borrado programado requiere opt-in explícito.
- Runner separado de app/worker y dependiente solo de PostgreSQL.
- Advisory transaction lock global impide sweeps simultáneos.
- Heartbeat solo acredita ciclos correctos; fallo de sweep no rejuvenece éxito.
- `OptOut` se preserva.
- Webhooks unresolved no se purgan automáticamente.
- `HUMAN_HANDOFF` queda en hold.
- `assistant_generating`, `assistant_pending` y `assistant_unknown` quedan en hold.
- Logs del runner exponen conteos/política, no contenido ni teléfonos.

## QA manual / infraestructura pendiente

- [ ] Habilitar `PRIVACY_RETENTION_ENABLED=true` únicamente en staging después de backup+restore verificados.
- [ ] Ejecutar sobre una base no vacía representativa y comprobar conteos antes/después.
- [ ] Ejecutar dos runners reales simultáneos y verificar un solo sweep efectivo.
- [ ] Matar/reiniciar runner y PostgreSQL durante un ciclo y comprobar recovery/heartbeat.
- [ ] Configurar alerta real por heartbeat stale.
- [ ] Validar holds reales de HUMAN_HANDOFF, assistant_generating/pending/unknown, OptOut y webhooks unresolved.
- [ ] Medir tiempo de sweep y locks con volumen alto.
- [ ] Añadir batching e índices de retención antes de volumen significativo.
- [ ] Validar interacción con backup/restore y datos antiguos.
- [ ] Mantener `PRIVACY_RETENTION_ENABLED=false` hasta cerrar este QA.
- [ ] Mantener `REAL_SENDING_ENABLED=false` y `AGENT_REAL_REPLY_ENABLED=false`.
