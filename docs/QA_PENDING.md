# QA pendiente — WA-Sender

Última actualización: 2026-08-23

Este documento es la **fuente de verdad del QA pendiente**. Debe actualizarse en cada etapa y separar con claridad:

1. implementación realizada;
2. validación automatizada con evidencia;
3. pruebas manuales, de infraestructura o con proveedor real que todavía faltan.

## Regla de cierre

Una prueba solo se marca como completada cuando existe evidencia reproducible: run de CI, salida de comando, consulta SQL, log estructurado o captura. **Inspeccionar el código no equivale a probarlo.**

`REAL_SENDING_ENABLED=false` debe permanecer así hasta cerrar los P0 de consentimiento, agentes, webhook, worker y beta técnica real.

---

# Estado actual

- Base original: `main` en `1147026f7dfabfa514efe2dd7a3fba3c8dac9991`.
- PR #2 — Etapa 1: consentimiento de campañas.
- PR #3 — Etapa 2: auto-reply y kill switches.
- PR #4 — Etapa 3: idempotencia de webhook.
- PR #5 — catch-up Etapa 0: dependencias / Next 16 / baseline de seguridad.
- PR #6 — Etapa 4: confiabilidad, concurrencia y recovery del worker.
- PR #7 — Etapa 5: beta cerrada, roles y aislamiento cross-tenant.
- PR #12 — Etapa 6: límites de plan, payloads y rate limiting distribuido.
- PR #13 — sincronización documental de Etapa 5 hacia la rama de Etapa 6; no toca `main`.
- PR #14 — Etapa 7 v2: privacidad, exports y retención sobre la Etapa 6 vigente.
- PR #15 — Etapa 8 v2: readiness, backup/restore y gates operacionales sobre la Etapa 7 v2.
- PR #16 — Etapa 9: release hardening, Actions v6 y smoke de imagen Docker arrancada.
- Rama actual de desarrollo: `agent/stage-09-release-hardening`.
- Los PRs permanecen draft mientras exista QA funcional/infraestructural pendiente.
- `main` no se modifica desde estas ramas de trabajo.

---

# Evidencia automatizada acumulada

## Etapa 0 / baseline de seguridad

- [x] Next `16.3.1`.
- [x] React / React DOM `19.2`.
- [x] NextAuth mínimo `4.24.15`.
- [x] Prisma y `@prisma/client` `6.12.0`.
- [x] CI read-only con `npm audit --audit-level=moderate` obligatorio.
- [x] Baseline final: `found 0 vulnerabilities`.
- [x] Run `32201500639`, job `95916115422`: install, audit, Prisma, migraciones, lint, 47 tests y build OK.
- [x] Run permanente read-only `32201705317`, job `95916716706`: install, audit, Prisma, migraciones, lint, tests y build OK.

## Etapa 1

- [x] SHA `d11abbcf3d913e1f544c4462fedb214c8c4f0e20`.
- [x] Run `32198937703`, job `95908484233`.
- [x] install / Prisma / migraciones / lint / tests / build.

## Etapa 2

- [x] SHA `239662dc2c6d42ebaa6c3beaa9d6b6bedbfcead3`.
- [x] Run `32199509481`, job `95910096775`.
- [x] install / Prisma / migraciones / lint / tests / build.

## Etapa 3

- [x] SHA `c6d0baf80f7c8540b225a348aac573f6576d3024`.
- [x] Run `32200313651`, job `95912529497`.
- [x] migración `0006_webhook_idempotency`.
- [x] duplicado secuencial y concurrente contra PostgreSQL.
- [x] lint / tests / build.

## Etapa 4

- [x] SHA final validado `9bd3b702db733d5cac2e1c6cf3985d29ced37dd9`.
- [x] Run `32209376970`, job `95938870274`.
- [x] PostgreSQL 16 healthcheck.
- [x] Redis 7 healthcheck y `REDIS_URL` obligatorio en CI.
- [x] `npm ci`.
- [x] `npm audit --audit-level=moderate`.
- [x] Prisma generate + migraciones 0001–0006.
- [x] lint.
- [x] integración PostgreSQL + Redis.
- [x] build Next 16.3.1.

## Etapa 5

- [x] SHA final validado `57e8adef2c84bc12d727142f116a78e896b76f02`.
- [x] Run `32210495880`, job `95942089552`.
- [x] PostgreSQL 16 + Redis 7.
- [x] `npm ci`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma generate + migraciones 0001–0006.
- [x] lint.
- [x] **68/68 tests, 15 archivos**.
- [x] build Next 16.3.1 + TypeScript.
- [x] pruebas de beta-access ACTIVE/SUSPENDED/allowlisted/no allowlisted.
- [x] integración cross-tenant de campaña y agente.

## Etapa 6

- [x] SHA de código validado `19de130f9a5d17b4b83a76c85c1c23a098e72027`.
- [x] Run `32617903402`, job `97141481234`.
- [x] PostgreSQL 16 + Redis 7 healthcheck.
- [x] `npm ci` y `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma generate + migraciones 0001–0006.
- [x] lint.
- [x] **85/85 tests, 22 archivos**.
- [x] build Next 16.3.1 + TypeScript.
- [x] integración concurrente `maxActiveCampaigns=1`: un solo Start efectivo.
- [x] integración concurrente `maxAgents=1`: un solo agente creado.
- [x] integración concurrente `maxInstances=1`: una sola instancia reservada.
- [x] Redis rate limit compartido probado; el contador persiste tras cerrar/recrear cliente.
- [x] guard estático detecta llamadas a `enforceRateLimit()` sin `await`.
- [x] límites de body/rawInput/filas y extracción de números cubiertos por tests.

## Etapa 7 v2

- [x] SHA validado `08520da267d615826ef9f6d67abe5bcfe50607ca`.
- [x] Run `32618356991`, job `97142601675`, conclusión `success`.
- [x] PostgreSQL 16 + Redis 7.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma generate + migraciones 0001–0006.
- [x] lint.
- [x] **94/94 tests, 25 archivos**.
- [x] build Next 16.3.1 + TypeScript.
- [x] CSV formula injection y escaping cubiertos por tests.
- [x] retención tenant-scoped de `ExtractedNumber` cubierta con integración PostgreSQL.
- [x] sweep global de conversaciones/mensajes/webhooks/playground/audit cubierto con integración PostgreSQL.
- [x] preservación de `OptOut`, datos recientes y webhooks `FAILED` verificada.

## Etapa 8 v2

- [x] SHA final de código `3c89047348c310151ab5ae4bc5af47fad3974074`.
- [x] Run final de código `32618800416`, job `97143671086`, conclusión `success`.
- [x] HEAD documental validado `4fe11960539b1d7b5f4f8f1208eef7747c0588b8`, run `32629182022`, job `97169181771`.
- [x] PostgreSQL 16 + Redis 7 healthcheck.
- [x] `npm ci` y `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma generate + migraciones 0001–0006.
- [x] scripts de backup/restore pasan `sh -n`.
- [x] heartbeat de backup fresco pasa y heartbeat stale falla como se espera.
- [x] `docker compose -f docker-compose.local.yml config -q`.
- [x] Compose de producción con `.env.production.example` valida.
- [x] lint.
- [x] **97/97 tests, 26 archivos**.
- [x] build Next 16.3.1 + TypeScript.
- [x] `/api/health/ready` cubierto contra PostgreSQL y Redis de CI.
- [x] autorización de deep health por header; token en query string rechazado por tests.
- [x] backup real con `pg_dump`, checksum y heartbeat.
- [x] restore real a PostgreSQL temporal y consultas posteriores a tablas restauradas.
- [x] Docker image build como gate de CI.
- [x] Dockerfile instala OpenSSL/CA para Prisma en build/runtime.
- [x] Docker build final ya no emite warning de Prisma por OpenSSL.
- [x] Docker build final ya no declara secretos Auth mediante `ARG/ENV` y no emite `SecretsUsedInArgOrEnv`.

## Etapa 9

- [x] PR #16 sobre la Etapa 8 v2, sin modificar `main`.
- [x] `actions/checkout@v6` y `actions/setup-node@v6`; la aplicación sigue ejecutando Node `20.20.2` en CI.
- [x] Run inicial `32629356777`, job `97169601076`: todos los gates previos pasaron y el nuevo runtime smoke **falló correctamente**, detectando que la imagen no contenía el Prisma Client generado.
- [x] Causa reproducida: el Dockerfile generaba Prisma en `builder` pero copiaba `node_modules` desde `deps` al runtime.
- [x] Fix SHA `c21aeef880c5ac7847269157436e32750d68896f`: runtime copia `node_modules` generado desde `builder` y luego ejecuta `npm prune --omit=dev`.
- [x] Run de código `32629521770`, job `97170009897`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] **97/97 tests, 26 archivos**.
- [x] Next build + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker image build.
- [x] Runtime image configurada con usuario no-root `node`.
- [x] Runtime image arranca y `/api/health/ready` responde `status=ok` con PostgreSQL y Redis `ok`.
- [x] Log de smoke: Next `Ready in 138ms`; readiness exitosa tras el arranque.
- [x] Checklist versionado `docs/RELEASE_CHECKLIST.md` con preflight, backup, migraciones, deploy, smoke, criterios de rollback, restore y evidencia.
- [x] Convención beta definida como SemVer pre-release `v0.1.0-beta.N`; tag inmutable asociado al SHA verde y registro de digest de imagen.

---

# Etapa 0 — plataforma / dependencias

## Ya implementado

- [x] Dependencias critical/high del baseline corregidas sin `npm audit fix --force`.
- [x] Audit obligatorio del CI.
- [x] CI con permisos `contents: read`.
- [x] `tsconfig.json` fija `jsx: react-jsx`.
- [x] Vitest con configuración ESM explícita.

## Regresión pendiente por Next 16 / Prisma 6.12

- [ ] Login Google OAuth real: inicio, callback y sesión.
- [ ] Usuario no autenticado es redirigido correctamente.
- [ ] Sesión persiste tras refresh/navegación.
- [ ] Logout invalida sesión.
- [ ] OAuth funciona detrás de HTTPS/Caddy productivo.
- [ ] CRUD principal sobre una base existente/no vacía.
- [ ] Migraciones 0001–0006 sobre copia de backup real.
- [ ] Servicio Docker de migraciones con Prisma 6.12.0 en staging real.
- [ ] Smoke de dashboard, campañas, instancias, extracción, agentes, playground y ops.
- [ ] Revisar consola del navegador por hydration/runtime warnings.

## Deuda técnica pendiente

- [ ] Migrar `middleware.ts` al convenio `proxy` de Next 16 y repetir auth/redirecciones.
- [ ] Refactorizar los siete componentes que hoy requieren excepción de `react-hooks/set-state-in-effect`.
- [ ] Volver a habilitar `react-hooks/set-state-in-effect` tras esos refactors.
- [ ] Eliminar warning heredado de helper `writeCampaignEvent` no usado.
- [x] Actualizar `actions/checkout` / `actions/setup-node` para eliminar la advertencia de runtime Node 20 de las Actions sin cambiar el Node 20 de la aplicación.
- [ ] Evaluar Prisma 7 en etapa independiente.

## Docker / ARM64 / host

- [x] `docker compose config` local en CI.
- [x] `docker compose --env-file .env.production.example config` en CI.
- [x] Docker build de app x86_64 en CI.
- [x] Runtime smoke x86_64 de imagen productiva contra PostgreSQL + Redis reales de CI.
- [ ] Docker build/ejecución ARM64.
- [ ] Registrar `docker --version` del host de staging.
- [ ] Registrar `docker compose version` del host de staging.
- [ ] Registrar `uname -m` del host de staging.
- [ ] Verificar `vm.overcommit_memory=1` en el host antes de depender de Redis.
- [ ] Levantar Postgres + Redis + app + worker + Evolution en staging.
- [ ] Healthchecks y orden de arranque reales.
- [ ] Reinicio completo del stack y recuperación.
- [ ] Confirmar que solo Caddy expone puertos públicos previstos.

---

# Etapa 1 — consentimiento de campañas

## Implementado / automatizado

- [x] UI exige atestación explícita.
- [x] UI exige fuente y referencia.
- [x] Backend exige `consentAttested=true` aunque se manipule el cliente.
- [x] Evento y AuditLog conservan actor, fecha, fuente, referencia y cantidad promovida.
- [x] `EXPLICITLY_DENIED` no se promueve.
- [x] Worker bloquea consentimiento no válido antes de Evolution.
- [x] Unit tests de schema.

## API / persistencia pendiente

- [ ] Start sin `consentAttested` -> 400.
- [ ] Start con `consentAttested=false` -> 400.
- [ ] Fuente ausente/inválida -> 400.
- [ ] Referencia ausente, <3 o >240 caracteres -> 400.
- [ ] Delay mínimo del plan sigue aplicándose.
- [ ] Instancia inactiva -> rechazo.
- [ ] Instancia de otro workspace -> rechazo.
- [ ] Campaña sin mensajes elegibles -> rechazo.
- [ ] Validar con SQL `UNKNOWN`, `NOT_REQUIRED_FOR_MOCK`, `EXPLICITLY_GRANTED`, `EXPLICITLY_DENIED`.
- [ ] Confirmar que otra campaña/workspace no cambia.
- [ ] Confirmar `optInStatus=CONFIRMED` solo donde corresponde.
- [ ] Confirmar `consentConfirmedAt`.
- [ ] Confirmar eventos de consentimiento/start y metadata de AuditLog.
- [ ] Forzar fallo transaccional y confirmar rollback completo.

## Worker / UI pendiente — P0

- [ ] `EXPLICITLY_DENIED` nunca llama Evolution y termina SKIPPED.
- [ ] `UNKNOWN` nunca llama Evolution y termina `CONSENT_UNCONFIRMED`.
- [ ] `NOT_REQUIRED_FOR_MOCK` no envía con real sending.
- [ ] `NOT_REQUIRED_FOR_MOCK` funciona únicamente en mock.
- [ ] `EXPLICITLY_GRANTED` avanza con los demás gates habilitados.
- [ ] Campaña legacy RUNNING con UNKNOWN queda bloqueada.
- [ ] Eventos/contadores consistentes al saltar mensajes.
- [ ] UI limpia la atestación al cambiar/iniciar campaña.
- [ ] UI mobile / desktop / teclado.

---

# Etapa 2 — agentes / auto-reply / kill switches

## Implementado / automatizado

- [x] Asignar agente no activa auto-reply.
- [x] `autoReplyEnabled=false` por defecto.
- [x] Gate global `AGENT_AUTOREPLY_ENABLED`.
- [x] Gate por agente `autoReplyEnabled`.
- [x] Gate adicional `AGENT_REAL_REPLY_ENABLED` en real sending.
- [x] Endpoint explícito de activación/desactivación.
- [x] Activación exige confirmación, agente ACTIVE y versión activa.
- [x] AuditLog.
- [x] Unit tests de gates.

## Funcional / integración pendiente — P0

- [ ] Asignar agente no altera setting en DB.
- [ ] Inbound se guarda pero no llama LLM/Evolution con setting false.
- [ ] Global off guarda inbound pero no responde.
- [ ] Global on + setting on permite reply mock.
- [ ] Real sending + real-reply off bloquea respuesta.
- [ ] Los tres gates habilitados permiten prueba real controlada.
- [ ] Agente INACTIVE no responde.
- [ ] Agente sin versión activa no responde.
- [ ] Activación sin `confirmed=true` -> 400.
- [ ] Activación DRAFT/INACTIVE -> 409.
- [ ] Cross-workspace no modifica agente ajeno.
- [ ] Activar/desactivar persiste actor y estado.
- [ ] Desasignar no altera auto-reply.
- [ ] Opt-out funciona con kill switch apagado.
- [ ] Contacto bloqueado no recibe reply.
- [ ] Quiet hours.
- [ ] Rate limit.
- [ ] Circuit breaker.
- [ ] UI mobile / desktop / teclado.

## Handoff humano — todavía pendiente de desarrollo

- [ ] Estado persistente de handoff por conversación.
- [ ] Keywords de derivación.
- [ ] Bloqueo de auto-reply con handoff activo.
- [ ] Acción explícita para reanudar agente.
- [ ] Audit de inicio/fin.

---

# Etapa 3 — idempotencia de webhook

## Automatizado / probado

- [x] Ledger `WebhookEvent` + migración 0006.
- [x] UNIQUE provider + instance + providerEventId.
- [x] providerMessageId / fallback SHA-256 canónico.
- [x] Claim antes de cualquier efecto.
- [x] Duplicado incrementa contador y no repite inbound.
- [x] Duplicado secuencial PostgreSQL.
- [x] Duplicado concurrente PostgreSQL.
- [x] Misma identidad permitida en instancias distintas.

## Pendiente

- [ ] 10 entregas iguales -> una acción, `duplicateCount=9`.
- [ ] Concurrencia >2 requests.
- [ ] Agente activo: duplicado no llama dos veces al LLM.
- [ ] Reply mock: duplicado no genera dos outbound.
- [ ] Opt-out duplicado produce una confirmación efectiva.
- [ ] Fallback hash end-to-end sin providerMessageId.
- [ ] Evolution real reentregando webhook duplicado.
- [ ] Detectar `PROCESSING` stale tras crash.
- [ ] Procedimiento seguro para reprocesar FAILED/stale.
- [ ] Vista/consulta operativa del ledger.

---

# Etapa 4 — worker / concurrencia / recovery

## Implementado y probado automáticamente

- [x] Job ID estable por campaña.
- [x] Redis real en CI.
- [x] Triggers repetidos deduplicados.
- [x] Job delayed puede reprogramarse sin crear duplicado.
- [x] Claim condicional `PENDING -> SENDING`.
- [x] Dos claims concurrentes -> un ganador.
- [x] Marcador `CLAIMED_NOT_SENT` antes del proveedor.
- [x] Marcador `PROVIDER_CALL_STARTED` antes del fetch.
- [x] `attemptCount` aumenta al iniciar realmente un intento.
- [x] Timeout/network/5xx ambiguo no vuelve ciegamente a PENDING.
- [x] `UNKNOWN_PROVIDER_RESULT` detiene la campaña.
- [x] Start/Resume bloquean resultados inciertos no reconciliados.
- [x] 429 clasificado como conocido/reintentable.
- [x] 4xx conocido clasificado como rechazo sin retry ciego.
- [x] Stale pre-provider puede volver seguro a PENDING.
- [x] Stale pre-provider en STOPPED -> CANCELLED.
- [x] Stale post-provider -> FAILED/UNKNOWN_PROVIDER_RESULT.
- [x] Campaña con fallos termina FAILED, no COMPLETED limpio.
- [x] Límite diario timezone-aware.
- [x] Start/Pause/Resume/Stop con transición optimista.
- [x] Doble Start -> un éxito y un 409 en integración.
- [x] Solo `SEND_RETRYABLE_EXHAUSTED` puede resetearse automáticamente al reiniciar.

## QA / integración real pendiente — P0

- [ ] Dos procesos worker reales simultáneos contra el mismo Redis/Postgres y un solo envío mock efectivo.
- [ ] Timeout del proveedor después de abrir conexión.
- [ ] HTTP 500 -> UNKNOWN.
- [ ] HTTP 408 -> UNKNOWN.
- [ ] HTTP 429 -> retry conocido.
- [ ] HTTP 400 -> fallo conocido final.
- [ ] 2xx con JSON inválido -> UNKNOWN.
- [ ] Proveedor acepta y DB falla antes de persistir SENT.
- [ ] Conservar providerMessageId en conflicto local posterior a aceptación.
- [ ] Reinicio entre CLAIMED_NOT_SENT y PROVIDER_CALL_STARTED.
- [ ] Reinicio después de PROVIDER_CALL_STARTED.
- [ ] Redis restart con jobs activos.
- [ ] PostgreSQL restart durante procesamiento.
- [ ] Pause durante request al proveedor.
- [ ] Stop durante request al proveedor.
- [ ] Mensaje aceptado puede cerrar SENT aun si la campaña se pausa/detiene durante el request, sin enviar el siguiente.
- [ ] Sweep global de SENDING stale también en PAUSED/STOPPED/FAILED.
- [ ] Reconciliación operativa de UNKNOWN_PROVIDER_RESULT.
- [ ] UI/ops para marcar unknown como “confirmado enviado” o “confirmado no enviado”.
- [ ] Contadores con mezcla SENT/FAILED/SKIPPED/CANCELLED/UNKNOWN.
- [ ] Quota alrededor de medianoche Lima y timezone con DST.
- [ ] Error de configuración Evolution conocido como no enviado: definir recuperación segura tras corregir config.

---

# Etapa 5 — beta cerrada / roles / tenant isolation

## Implementado y probado automáticamente

- [x] `BETA_REQUIRE_INVITE=true` por defecto.
- [x] `BETA_ALLOWED_EMAILS` como allowlist temporal.
- [x] Usuario ACTIVE existente puede regresar aunque no esté allowlisted.
- [x] Usuario SUSPENDED no entra aunque esté allowlisted.
- [x] Cuenta nueva no allowlisted queda bloqueada.
- [x] Cuenta nueva allowlisted puede continuar.
- [x] Gate solo se abre expresamente con `BETA_REQUIRE_INVITE=false`.
- [x] Lectura de sesión/workspace deja de crear workspaces como efecto lateral.
- [x] Guard de API devuelve 401/403 en lugar de redirects.
- [x] OWNER/ADMIN requeridos para mutaciones de campañas.
- [x] OWNER/ADMIN requeridos para creación/edición/status/assignment/auto-reply de agentes.
- [x] Playground LLM restringido a OWNER/ADMIN.
- [x] Crear/eliminar instancia restringido a OWNER/ADMIN.
- [x] QR/pairing code restringido a OWNER/ADMIN.
- [x] Extracción/persistencia de teléfonos restringida a OWNER/ADMIN.
- [x] MEMBER conserva lectura de los recursos principales.
- [x] Integración: workspace B no inicia campaña de A.
- [x] Integración: workspace B no modifica agente de A.

## Pendiente funcional / manual

- [ ] Login Google real con email allowlisted.
- [ ] Login Google real con email no allowlisted -> acceso denegado.
- [ ] Usuario ACTIVE existente no allowlisted puede volver a entrar.
- [ ] Usuario SUSPENDED pierde acceso real incluso con sesión anterior.
- [ ] Workspace SUSPENDED deja de operar.
- [ ] HTTP real: MEMBER puede GET campañas/agentes/instancias.
- [ ] HTTP real: MEMBER recibe 403 en create/start/pause/resume/stop/delete campaña.
- [ ] HTTP real: MEMBER recibe 403 en mutations de agentes.
- [ ] HTTP real: MEMBER recibe 403 en QR/create/delete instancia.
- [ ] HTTP real: MEMBER recibe 403 en extracción de contactos.
- [ ] HTTP real: OWNER y ADMIN sí pueden ejecutar esas acciones.
- [ ] Manipulación de IDs en URL/body no cruza tenants en endpoints restantes.
- [ ] UI oculta/deshabilita acciones que el backend ya prohíbe a MEMBER.
- [ ] Verificar usuario legacy ACTIVE sin membership: comportamiento y procedimiento de reparación si existiera alguno.

## Pendiente de desarrollo posterior

- [ ] Invitaciones persistentes en DB con expiración/uso único.
- [ ] UI/API para invitar y revocar usuarios.
- [ ] Selector de workspace si un usuario llega a pertenecer a varios.
- [ ] Gestión de membresías/roles desde UI.

---

# Etapa 6 — límites / abuso / costo

## Implementado y probado automáticamente

- [x] `maxActiveCampaigns` se aplica al Start/Restart; RUNNING/SCHEDULED/PAUSED consumen cupo.
- [x] Advisory lock transaccional por workspace evita que dos Starts de campañas distintas superen `maxActiveCampaigns`.
- [x] `maxAgents` se comprueba dentro de la misma transacción que crea agente/versión/settings y está protegido contra carrera concurrente.
- [x] `maxInstances` usa reserva transaccional por workspace y está protegido contra creación simultánea.
- [x] Daily message limit permanece timezone-aware en el worker/control existente.
- [x] Creación de campaña rechaza request body sobredimensionado antes de parsear completamente.
- [x] `CAMPAIGN_CREATE_MAX_BODY_BYTES` default 750000.
- [x] `CAMPAIGN_MAX_RAW_INPUT_BYTES` default 500000.
- [x] `CAMPAIGN_MAX_ROWS` default 1000 filas no vacías.
- [x] Extracción de contactos limita a `EXTRACT_NUMBERS_MAX_RECORDS` default 5000 registros normalizados y rechaza el lote completo antes de persistir si excede el máximo.
- [x] Rate limiting de APIs migrado de Map local a Redis mediante operación atómica Lua cuando `REDIS_URL` está disponible.
- [x] Las claves existentes por acción/workspace/usuario/IP se conservaron.
- [x] Campañas, agentes, playground, instancias, QR/status, extracción y webhook Evolution esperan explícitamente `enforceRateLimit()`.
- [x] Test estático falla si se añade una llamada de API a `enforceRateLimit()` sin `await`.
- [x] Redis rate limit conserva contador al cerrar y recrear el cliente.
- [x] Si Redis falla, el runtime registra `rate_limit_redis_fallback` y degrada a limiter local por proceso.

## Pendiente funcional / infraestructura

- [ ] HTTP real: body de campaña > límite -> 413 y no crea campaña/mensajes.
- [ ] HTTP real: `rawInput` > límite -> 413.
- [ ] HTTP real: >1000 filas -> 413 sin persistencia parcial.
- [ ] Dos procesos app reales contra el mismo Redis comparten el mismo rate limit.
- [ ] Verificar `Retry-After` real al superar límites de campañas/agentes/instancias/webhook.
- [ ] Caída de Redis genera `rate_limit_redis_fallback` observable y el limiter local continúa en una sola réplica.
- [ ] Antes de multi-réplica: decidir fail-closed/Redis obligatorio durante outage; el fallback local **no** garantiza límite global con varias réplicas.
- [ ] Limitar por bytes la respuesta HTTP bruta de Evolution antes de normalizar contactos; el tope de 5000 registros protege persistencia pero no una respuesta anormalmente grande en memoria.
- [ ] QA del límite diario alrededor de medianoche Lima y zonas con DST.

## Pendiente de producto/costo para etapa posterior

- [ ] Presupuesto LLM diario/mensual por workspace/agente.
- [ ] Métricas persistentes de tokens/costo.
- [ ] Límite de requests/tokens LLM por plan, además del rate limit de playground.
- [ ] Protección anti-loop bot-to-bot/self messages más allá de los gates actuales.
- [ ] Resolver proveedores LLM anunciados pero no implementados (GEMINI/GROQ): implementar o retirar opciones hasta que existan.

---

# Etapa 7 — privacidad / exports / retención

## Implementado y probado automáticamente

- [x] Neutralización de CSV formula injection para strings que empiezan, incluso tras espacios/tab, con `=`, `+`, `-` o `@`.
- [x] Teléfonos internacionales `+...` se neutralizan como texto en CSV.
- [x] Números negativos de tipo `number` permanecen numéricos.
- [x] XLSX usa `inlineStr` y no genera fórmulas con esos valores.
- [x] `EXTRACTED_NUMBER_RETENTION_DAYS=30` por defecto.
- [x] Purga tenant-scoped de `ExtractedNumber` vencido antes de persistir nueva extracción.
- [x] Sweep global transaccional con defaults configurables.
- [x] Conversaciones/mensajes: 90 días por defecto.
- [x] Webhook `PROCESSED`: 30 días por defecto.
- [x] Playground: 30 días por defecto.
- [x] Audit: 365 días por defecto.
- [x] `OptOut` no se purga automáticamente.
- [x] Webhooks `FAILED`/`PROCESSING` no se purgan automáticamente.
- [x] Logs/auditoría de webhook evitan teléfono completo y usan hash + últimos 4 cuando necesitan referenciar contacto.

## Pendiente de desarrollo / funcional

- [ ] Conectar el sweep global a un scheduler/cron operacional seguro.
- [ ] Añadir índices de retención coherentes en `schema.prisma` + migración antes de volumen alto.
- [ ] Erasure/anominización por contacto: borrar contenido/personalización preservando suppression mínima.
- [ ] Estandarizar/redactar `OptOut.reason` para no conservar texto original innecesario.
- [ ] Eliminación completa de workspace con política explícita sobre auditoría, backups y suppression.
- [ ] Revisar nuevamente logs con tráfico real para confirmar que no aparecen teléfonos/contenido sensible en capas externas.
- [ ] Backups cifrados / gestión de claves.
- [ ] Smoke CSV/XLSX en Excel/LibreOffice/Google Sheets con celdas maliciosas representativas.
- [ ] Medir duración/locks del sweep con volumen representativo antes de programarlo automáticamente.

---

# Etapa 8 — observabilidad / recuperación

## Implementado y probado automáticamente

- [x] `/api/health/ready` comprueba PostgreSQL + Redis y devuelve 503 ante fallo.
- [x] Healthcheck de `next-app` usa readiness y no solo liveness HTTP.
- [x] Deep health rechaza token en query string y usa `x-healthcheck-token`.
- [x] Comparación del token de deep health mediante digest + `timingSafeEqual`.
- [x] `Cache-Control: no-store` en health profundo/readiness según corresponda.
- [x] Deep health existente comprueba database, Redis, Evolution, worker heartbeat, instancias WhatsApp, fallos LLM y disco.
- [x] Backup heartbeat solo se registra al completar backup exitoso.
- [x] Backup container health depende de heartbeat fresco.
- [x] Parámetros numéricos de backup/intervalo/health se validan.
- [x] Backup y restore round-trip real en CI.
- [x] Checksum del dump validado antes de restore.
- [x] Docker build real como gate.
- [x] Documentación separa retención de backups de retención de datos de aplicación.

## Pendiente funcional / infraestructura

- [ ] Probar `/api/health/ready` en contenedores reales y observar 503 al detener PostgreSQL.
- [ ] Probar `/api/health/ready` y health del contenedor al detener Redis.
- [ ] Probar heartbeat/health de worker real, incluyendo heartbeat stale y reinicio.
- [ ] Configurar monitor/alerta real para Redis down.
- [ ] Configurar monitor/alerta real para PostgreSQL down.
- [ ] Configurar monitor/alerta real para Evolution down.
- [ ] Configurar alerta real de disco; el deep health hoy advierte >=80% y falla >=90%.
- [ ] Probar deep health con Evolution desconectado.
- [ ] Probar deep health con worker stale.
- [ ] Backup automático fuera del VPS.
- [ ] Restore desde la copia externa, no solo desde dump local/CI.
- [ ] Restore sobre copia de base real/no vacía.
- [ ] Backup/restore coherente del volumen `evolution_instances` si la versión de Evolution lo requiere.
- [ ] Kill switch operacional probado durante tráfico de prueba.
- [ ] Runbook de incidente general.
- [ ] Runbook de rollback de aplicación/migración.
- [ ] Runbook de rotación/revocación de secretos.
- [ ] Validar recuperación tras reinicio completo del host.

---

# Etapa 9 — CI / release

## Implementado / validado automáticamente

- [x] PostgreSQL 16 en CI.
- [x] Redis 7 en CI.
- [x] `npm ci`.
- [x] `npm audit --audit-level=moderate` estricto.
- [x] Prisma generate + migrate deploy.
- [x] validación de scripts shell de backup/restore.
- [x] test de freshness del backup heartbeat.
- [x] lint.
- [x] tests.
- [x] build Next/TypeScript.
- [x] Docker build como gate.
- [x] `docker compose config` local y producción como gate.
- [x] backup + restore round-trip como gate.
- [x] runtime smoke de la imagen Docker arrancada como usuario `node`.
- [x] runtime smoke verifica conectividad real a PostgreSQL + Redis mediante `/api/health/ready`.
- [x] runtime smoke detectó y permitió corregir el Prisma Client faltante en la imagen productiva.
- [x] `actions/checkout@v6` y `actions/setup-node@v6`.
- [x] La actualización de Actions no modifica el Node 20 de la aplicación.
- [x] Release checklist versionado con preflight, backup, migraciones, deploy, smoke, rollback y registro de evidencia.
- [x] Convención de versionado/tag beta documentada.

## Pendiente de Etapa 9

- [ ] Branch protection/ruleset exige CI antes de mergear a `main`; el conector actual no expone una operación segura para configurarlo.
- [ ] Validar desde GitHub que un fallo de CI bloquea realmente el merge una vez activada branch protection.
- [ ] Runtime smoke ARM64 de la imagen.
- [ ] Runtime smoke del stack Compose completo en staging real.
- [ ] Definir registry de imágenes y política de tag inmutable/digest para despliegues reales.
- [ ] Definir política para pins/actualización controlada de imágenes base de Compose.
- [ ] Evaluar cache de build para reducir duración sin ocultar dependencias.
- [ ] Resolver warning de Next `middleware` -> `proxy` y repetir QA de auth/redirecciones.

---

# Etapa 10 — beta técnica real — NO EJECUTAR TODAVÍA

- [ ] Deploy ARM64 Oracle Cloud.
- [ ] QR con número propio de prueba.
- [ ] Envío manual controlado.
- [ ] Campaña pequeña solo con números propios/autorizados.
- [ ] Webhook inbound real.
- [ ] Opt-out real.
- [ ] Duplicate/retry real de Evolution.
- [ ] Agent mock con kill switches.
- [ ] LLM real con presupuesto mínimo y número propio.
- [ ] Dos workers simultáneos en prueba controlada.
- [ ] Reinicio worker durante campaña.
- [ ] Reinicio Evolution y reconexión.
- [ ] Kill switches con tráfico de prueba.
- [ ] Backup + restore desde almacenamiento externo.
- [ ] Varios días sin duplicados ni envíos inesperados.

---

# Bloqueadores actuales para beta real

1. Docker/Compose x86_64 ya están validados en CI, incluido runtime de la imagen, pero **ARM64 y el stack completo en staging real todavía no**.
2. QA funcional P0 de consentimiento y kill switches sigue pendiente.
3. Etapa 4 necesita pruebas reales de provider timeout/crash/restart y reconciliación UNKNOWN.
4. OAuth real y permisos MEMBER/ADMIN/OWNER requieren smoke HTTP/browser.
5. Idempotencia está probada en PostgreSQL, pero falta Evolution real y recovery de eventos stale.
6. Prisma 6.12 está verde en CI y restore vacío funciona, pero falta migración/restore sobre copia real no vacía.
7. Handoff humano sigue pendiente.
8. Backups externos/cifrados y restore desde almacenamiento externo siguen pendientes.
9. Alertas reales y runbooks operacionales todavía no están cerrados.
10. Branch protection de `main` todavía debe configurarse y comprobarse en GitHub.
11. Mantener `REAL_SENDING_ENABLED=false` hasta cerrar lo anterior.

---

# Cómo mantener este documento

Al cerrar una prueba:

1. marcar la casilla;
2. añadir evidencia con fecha, SHA y run/log/consulta;
3. si falla, mantenerla abierta y documentar el fallo;
4. no borrar pruebas antiguas: moverlas a regresión cuando corresponda.
