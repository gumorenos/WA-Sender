# Auditoría P0 final pre-beta — WA-Sender

Fecha: 2026-08-26

## Alcance y referencia

Esta auditoría se realizó sobre la cadena acumulada de PRs pre-beta, no sobre `main`.

- PR #28: `agent/prebeta-privacy-retention-runner`.
- PR #29: `agent/prebeta-rate-limit-fail-closed`.
- PR #30: `agent/prebeta-final-p0-audit`.
- Base de código auditada después de las correcciones runtime: `8ee7aa0947acdb8fc07f8c3f75ece232c98f4f2b`.

Los commits documentales posteriores a ese SHA no cambian semántica runtime.

`REAL_SENDING_ENABLED=false` y `AGENT_REAL_REPLY_ENABLED=false` siguen siendo requisitos hasta completar la beta técnica controlada con infraestructura/proveedores reales.

## Resultado

No quedan P0 de código conocidos después de las correcciones listadas abajo.

Esto **no** equivale todavía a declarar el sistema listo para beta privada: faltan CI del HEAD final, QA real, infraestructura, OAuth/WhatsApp/Evolution reales, pruebas de fallos y restore off-host.

## P0 acumulados cerrados al final de la cadena

### PR #29 — rate limiting distribuido fail-closed

Problema: en un despliegue multi-réplica, una caída de Redis podía degradar el limiter a contadores locales por proceso y multiplicar el límite efectivo.

Cierre:

- producción exige Redis para rate limiting;
- indisponibilidad del limiter distribuido falla cerrado;
- desarrollo local puede mantener fallback explícito;
- CI de #29: success sobre `ed08088ff31bd91e0b82719278d0752cade31426`.

### PR #30 — body público del webhook Evolution limitado

Problema: el endpoint público autenticado de Evolution parseaba JSON sin límite de bytes; un body grande podía consumir memoria antes de aplicar límites de dominio.

Cierre:

- lectura streaming reutilizando `readJsonBodyWithLimit`;
- `EVOLUTION_WEBHOOK_MAX_BODY_BYTES`, 1 MiB por defecto;
- techo de configuración 10 MiB;
- HTTP 413 / `WEBHOOK_BODY_TOO_LARGE` antes de parsear un body excedido;
- JSON malformado conserva respuesta 400;
- tests unitarios de defaults, overrides, valores inválidos y clamp.

### PR #30 — budget LLM del playground

Problema: el playground tenía rate limit por minuto, pero no consumía `AGENT_DAILY_LLM_LIMIT`; con proveedor real era una vía alternativa de gasto fuera del presupuesto diario atómico del workspace.

Cierre:

- cada intento LLM del playground reserva `reserveAgentLlmAttempt` antes del proveedor;
- comparte el mismo contador diario/lock PostgreSQL de los auto-replies;
- límite agotado devuelve 429 / `AGENT_DAILY_LLM_LIMIT`;
- logging/auditoría registran solo metadata operacional del presupuesto.

### PR #30 — bypass del kill switch de replies en confirmación de opt-out

Problema: la confirmación automática de STOP/BAJA llamaba directamente a `sendEvolutionTextMessage`. Si campañas reales estaban habilitadas con `REAL_SENDING_ENABLED=true` pero replies seguían deshabilitados, la confirmación podía salir realmente pese a `AGENT_REAL_REPLY_ENABLED=false`.

Cierre:

- el cliente Evolution de replies exige ambos gates antes de cualquier `fetch` real;
- `REAL_SENDING_ENABLED=true` + `AGENT_REAL_REPLY_ENABLED=false` falla antes de red;
- mock/real-sending deshabilitado sigue siendo seguro para tests;
- tests cubren bloqueo, mock y provider call únicamente con ambos gates activos.

### PR #30 — heartbeat de backup falso positivo

Problema: `backup.sh` podía omitir una base por configuración incompleta y terminar escribiendo heartbeat. En el peor caso podía aparentar un backup sano sin dumps válidos.

Cierre:

- app DB y Evolution DB son targets obligatorios del servicio de backup de producción;
- host, puerto, usuario, password y database se validan antes de cada dump;
- cada dump debe existir y ser no vacío;
- cualquier configuración incompleta falla cerrado antes del heartbeat;
- CI incluye un caso negativo que exige fallo, ausencia de heartbeat y ausencia de dumps;
- se preservaron sin cambios los smoke tests preexistentes de retention/Docker/restore.

## Áreas auditadas sin P0 adicional conocido

### Concurrencia y duplicados

- claims de campaign worker y recovery conservan locks/transiciones condicionales;
- un resultado posterior a `PROVIDER_CALL_STARTED` no se reintenta a ciegas;
- stale post-provider termina en `UNKNOWN_PROVIDER_RESULT`;
- `assistant_generating`, `assistant_pending` y `assistant_unknown` mantienen leases/cuarentena/reconciliación explícita;
- webhook ledger exige mismo hash para reclaim autorizado y no reproduce payload almacenado.

### Auth, roles y tenancy

- reconciliaciones manuales de campaña y reply incierto: OWNER/ADMIN;
- start/pause de campañas: OWNER/ADMIN;
- handoff humano y assignments: OWNER/ADMIN;
- recursos sensibles se vuelven a resolver por `workspaceId` en backend/transacción;
- MEMBER permanece lectura en superficies revisadas.

### Privacidad y retención

- retention usa advisory transaction lock global;
- OptOut no se purga;
- webhooks solo se purgan en `PROCESSED`;
- `HUMAN_HANDOFF` se preserva;
- `assistant_generating`, `assistant_pending` y `assistant_unknown` se preservan;
- logs del runner reportan conteos/estado, no contenido/PII.

### SSRF / URL handling / secrets

- Evolution base URL es configuración de servidor, no input tenant/user;
- se valida protocolo HTTP/HTTPS;
- nombres de instancia están restringidos y se usan con `encodeURIComponent` en paths;
- proveedores LLM revisados usan endpoints definidos por código/configuración, no URLs suministradas por usuario;
- ejemplos de producción contienen placeholders y mantienen gates de envío apagados.

### Caddy / exposición de red

- el `docker/caddy/Caddyfile` activo expone solo la app;
- Evolution queda en red interna en Compose;
- ejemplos que exponen Evolution añaden Basic Auth, pero no son el Caddyfile montado por defecto;
- app publica headers de HSTS, nosniff, frame deny, referrer y permissions policy.

### Migraciones / budgets

- cuota diaria de campaña tiene índices de workspace/fecha/release;
- `agent_daily_usage` tiene unique `(workspace_id, usage_date)` y FK cascade;
- los budgets se serializan con PostgreSQL advisory transaction lock en aplicación.

### Backup / restore

- pg_dump custom + SHA-256 por dump;
- heartbeat solo después de ciclo exitoso;
- restore CI realiza round-trip real;
- `restore.sh` usa `--clean --if-exists --exit-on-error` y verifica checksum cuando existe.

## Riesgos no P0 / trabajo posterior

Estos puntos no justifican seguir agregando código antes de staging, salvo nueva evidencia:

1. **P1 — consistencia instancia Evolution/local:** un fallo después de crear/borrar remoto y antes de persistir localmente puede dejar un remoto huérfano o un registro local desalineado. Necesita reconciliación operacional, no implica retry de mensajes.
2. **P1 — caps de responses de upstream internos:** extracción Evolution sí tiene cap; respuestas ordinarias Evolution, campaign worker y JSON LLM siguen confiando en timeout/tamaño razonable del upstream configurado. Endurecimiento futuro.
3. **P1 — bodies autenticados:** algunas APIs OWNER/ADMIN todavía usan `request.json()` directo con schemas acotados. El endpoint público de webhook ya quedó limitado.
4. **P1 — confirmación de opt-out incierta:** no se reintenta automáticamente, pero la confirmación de compliance no tiene hoy un marcador dedicado equivalente a `assistant_unknown`.
5. **P1 — restore manual:** checksum se valida si existe; una restauración manual de un dump externo sin `.sha256` no se bloquea. El flujo normal de backup sí genera checksum.
6. **Etapa 10 — observabilidad real:** alertas de worker stale, UNKNOWN, assistant_unknown, budgets, backup stale, disco, Evolution y restart VPS.
7. **Etapa 10 — backup real:** copia off-host, cifrado, restore desde copia externa y estrategia explícita para sesiones Evolution.
8. **Producto/privacidad futura:** borrado/anonymización por contacto, workspace deletion, suppression mínima, redacción de OptOut.reason, batching/índices de purge.

## Evidencia automática conocida

- #28 HEAD actual observado: `09de3df3d8bcb44654322f3eebab373680311c16`; workflow #155: `success`.
- #29 HEAD: `ed08088ff31bd91e0b82719278d0752cade31426`; workflow #157: `success`; evidencia del PR: 204/204 tests, 48 archivos.
- #30: las escrituras realizadas por el GitHub connector no dispararon un workflow automáticamente. Por tanto **no se declara CI green para #30** hasta obtener un run real del HEAD final.

## Gate para release candidate

No crear/deplegar un RC operativo hasta que se cumpla todo:

- [ ] CI real del HEAD final de #30 en `success`.
- [ ] `npm audit --audit-level=moderate` sin vulnerabilidades bloqueantes.
- [ ] migraciones, lint, tests y build en verde.
- [ ] backup/restore round-trip en verde.
- [ ] Docker build + runtime smoke + retention smoke en verde.
- [ ] protección/ruleset de `main` validada/configurada; hoy el API de rulesets devuelve lista vacía y el conector no pudo leer branch protection clásica por permisos.
- [ ] generar una referencia RC reproducible desde un único SHA acumulado, nunca desplegar una colección manual de branches.

Después de ese gate empieza la Etapa 10 con infraestructura y proveedores reales, manteniendo los dos gates de envío apagados salvo ensayos deliberados y acotados.
