# QA pre-beta pendiente — WA-Sender

Última actualización: 2026-08-24

Este archivo **suplementa** `docs/QA_PENDING.md` para las subetapas pre-beta posteriores a Etapa 9. Se creó separado porque el conector de GitHub disponible reemplaza archivos completos y `QA_PENDING.md` ya supera el tamaño seguro de edición sin truncamiento. No sustituye ni borra el histórico anterior.

`REAL_SENDING_ENABLED=false` debe permanecer sin cambios hasta cerrar los P0 y la beta técnica controlada.

---

## P0 — reconciliación de `UNKNOWN_PROVIDER_RESULT`

### Implementado y validado automáticamente

- [x] PR #17, rama `agent/prebeta-unknown-reconciliation`, apilado sobre Etapa 9.
- [x] SHA de código validado `1b815d842c3437fc5806ac28cd25c1a3a2e3488e`.
- [x] CI run `32630125070`, job `97171512796`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma generate + migraciones 0001–0006.
- [x] lint.
- [x] **103/103 tests, 27 archivos**.
- [x] 6 pruebas PostgreSQL específicas de reconciliación.
- [x] build Next 16.3.1 + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker build.
- [x] runtime smoke como usuario `node` con PostgreSQL + Redis `ok`.
- [x] Solo OWNER/ADMIN puede reconciliar por API.
- [x] Solo mensajes `FAILED + UNKNOWN_PROVIDER_RESULT` son elegibles.
- [x] `CONFIRMED_SENT` convierte a `SENT` sin llamar Evolution.
- [x] `CONFIRMED_NOT_SENT` vuelve a `PENDING` sin auto-reenvío; requiere Start posterior explícito.
- [x] Motivo y confirmación explícitos.
- [x] Transición condicional evita reconciliación doble concurrente.
- [x] Conflicto de `providerMessageId` se rechaza.
- [x] CampaignEvent + AuditLog + recálculo de contadores.
- [x] UI de estado de campaña expone código de error, intentos, provider ID y acciones de reconciliación.

### QA manual / proveedor real todavía pendiente

- [ ] HTTP/browser real: MEMBER no puede reconciliar; OWNER/ADMIN sí.
- [ ] Confirmar end-to-end con stub/spy de proveedor que reconciliar nunca llama Evolution.
- [ ] Reproducir un resultado UNKNOWN real o con stub HTTP y recorrer el flujo de operador completo.
- [ ] Dos operadores HTTP simultáneos sobre el mismo mensaje -> una sola reconciliación efectiva y un solo audit/event.
- [ ] Validar UX de motivo obligatorio, confirmación y conflicto de provider ID en desktop/mobile/teclado.
- [ ] Validar contadores/UI con mezcla real de SENT/FAILED/PENDING después de reconciliar.
- [ ] No habilitar `REAL_SENDING_ENABLED` por este cambio.

---

## P0 — handoff humano persistente

### Implementado y validado automáticamente

- [x] PR #18, rama `agent/prebeta-human-handoff`, apilado sobre PR #17.
- [x] SHA de código validado `cc5ad5c39fd0af498b06b1e9705adbec0b680c92`.
- [x] CI run `32686767761`, job `97313202844`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma generate + migraciones 0001–0006; no se requirió migración nueva.
- [x] lint.
- [x] **114/114 tests, 30 archivos**.
- [x] 5 tests unitarios de schemas/matcher de keywords.
- [x] 5 tests PostgreSQL/webhook de handoff persistente.
- [x] 1 test PostgreSQL específico que demuestra que `STOP` tiene prioridad sobre handoff y que reanudar el agente no reactiva un contacto opt-out.
- [x] build Next 16.3.1 + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker build.
- [x] runtime smoke como usuario `node`; readiness PostgreSQL + Redis `ok`.
- [x] Estado persistente `HUMAN_HANDOFF` reutilizando `Conversation.status`.
- [x] Keywords normalizadas por mayúsculas/acentos/espacios, deduplicadas y con límites de palabra/frase.
- [x] Máximo 20 keywords de 2–80 caracteres.
- [x] El inbound se persiste antes de cualquier decisión de handoff.
- [x] Opt-out y contacto bloqueado tienen prioridad sobre handoff.
- [x] Handoff activo bloquea auto-reply antes de LLM.
- [x] El webhook revalida handoff antes del LLM y nuevamente antes de llamar Evolution.
- [x] Inicio/reanudación manual solo OWNER/ADMIN, con confirmación y motivo obligatorios.
- [x] Inicio por keyword y control manual auditados sin guardar el contenido completo del mensaje en el audit.
- [x] Aislamiento cross-workspace probado.
- [x] Configuración de keywords por agente con API y AuditLog.
- [x] `/conversations` permite revisar conversaciones y handoff; MEMBER queda en modo lectura en UI y las mutaciones siguen protegidas en backend.
- [x] Sidebar incluye acceso a Conversaciones.

### QA manual / infraestructura todavía pendiente

- [ ] Webhook Evolution real activa handoff por keyword.
- [ ] Mientras un humano atiende en tráfico real, ningún inbound genera auto-reply.
- [ ] Reanudar agente permite responder solo a un inbound posterior y siempre respetando kill switches/quiet hours/rate limits.
- [ ] HTTP/browser real: MEMBER no puede iniciar/reanudar handoff ni cambiar keywords; OWNER/ADMIN sí.
- [ ] Dos operadores simultáneos intentando cambiar el mismo handoff -> una sola transición efectiva y conflicto observable para el perdedor.
- [ ] Validar UX de prompts/confirmaciones y configuración de keywords en desktop/mobile/teclado.
- [ ] Revisar privacidad del listado operacional: hoy un MEMBER autenticado puede leer teléfono completo y extracto del último mensaje, coherente con la política read-only actual pero susceptible de endurecimiento por rol.
- [ ] Implementar, si el producto lo requiere, el envío manual del operador humano; esta etapa solo suspende/reanuda automatización y permite observar conversaciones.
- [ ] `AGENT_REAL_REPLY_ENABLED=false` y `REAL_SENDING_ENABLED=false` deben permanecer sin cambios.

---

## P0 — recovery de webhooks `PROCESSING` stale

### Implementado y validado automáticamente

- [x] PR #19, rama `agent/prebeta-webhook-recovery`, apilado sobre PR #18.
- [x] SHA de código validado `a52569a353354cc8dd3a7c2b0888b6bd09da8a0a`.
- [x] CI run `32690979995`, job `97324473153`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma generate + migraciones 0001–0006; no se requirió migración nueva.
- [x] lint.
- [x] **124/124 tests, 33 archivos**.
- [x] 3 tests unitarios de política/threshold/schema de recovery.
- [x] 6 tests PostgreSQL específicos de stale detection, retry por redelivery, hash mismatch, concurrencia, manual processed y aislamiento tenant.
- [x] 1 test PostgreSQL específico demuestra que un duplicado incrementa telemetría pero no rejuvenece `updatedAt` de un `PROCESSING` stale.
- [x] build Next 16.3.1 + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker build.
- [x] runtime smoke como usuario `node`; readiness PostgreSQL + Redis `ok`.
- [x] `WEBHOOK_PROCESSING_STALE_SECONDS` default 600 s, con clamp 60–86400 s.
- [x] Sweep tenant-scoped mueve solo `PROCESSING` realmente viejos a `STALE_REVIEW`; no auto-reprocesa.
- [x] GET/POST/PATCH de recovery requieren OWNER/ADMIN y rate limiting distribuido.
- [x] Página `/webhooks/recovery` también exige OWNER/ADMIN en servidor.
- [x] Vista operacional no expone payload crudo ni hash completo; usa prefijo de hash y metadata operacional.
- [x] Decisiones explícitas `RETRY_ON_REDELIVERY` y `MARK_PROCESSED`, ambas con confirmación y motivo.
- [x] `RETRY_ALLOWED` nunca reproduce un payload almacenado: espera una reentrega auténtica del proveedor.
- [x] Reentrega autorizada recupera exactamente el mismo ledger row solo si el `payloadHash` coincide.
- [x] Mismo `providerEventId` con hash distinto vuelve a `STALE_REVIEW` y no procesa efectos.
- [x] Dos redeliveries concurrentes autorizados producen un solo claimant efectivo.
- [x] `MARK_PROCESSED` cierra el evento y una reentrega posterior se trata como duplicado.
- [x] Duplicados sobre `PROCESSING` actualizan `duplicateCount/lastDuplicateAt` mediante SQL sin tocar `updatedAt`, evitando que oculten un evento realmente stale.
- [x] AuditLog registra sweep/decisión sin copiar payload crudo.
- [x] UI operacional permite detectar stale, autorizar espera de redelivery o marcar procesado, con confirmaciones explícitas.

### QA manual / proveedor real todavía pendiente

- [ ] Simular/reproducir crash real después de adquirir claim y antes de completar procesamiento.
- [ ] Evolution real redelivery después de `RETRY_ON_REDELIVERY` y confirmar reutilización del mismo ledger row.
- [ ] Confirmar con tráfico real ausencia de doble LLM, doble reply, doble opt-out u otros efectos externos después de recovery.
- [ ] HTTP/browser real: MEMBER no puede listar/sweepear/decidir recovery; OWNER/ADMIN sí.
- [ ] Dos operadores HTTP simultáneos decidiendo el mismo evento -> una sola transición efectiva y conflicto observable para el perdedor.
- [ ] Validar UX de sweep, motivo, confirmación y estados `STALE_REVIEW/RETRY_ALLOWED` en desktop/mobile/teclado.
- [ ] Definir y ensayar procedimiento operacional con Evolution para solicitar/esperar redelivery y criterios para usar `MARK_PROCESSED`.
- [ ] No habilitar `REAL_SENDING_ENABLED` por este cambio.

---

## P0 — sweep global de `CampaignMessage.status=SENDING` stale

### Implementado y validado automáticamente

- [x] PR #20, rama `agent/prebeta-worker-stale-sweep`, apilado sobre PR #19.
- [x] SHA de código validado `198bd52c9e0bf7917ded323059dfdd329234e86d`.
- [x] CI run `32691813271`, job `97326724377`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma generate + migraciones 0001–0006; no se requirió migración nueva.
- [x] `node --check` obligatorio para `campaign-worker.mjs` y `campaign-worker-safety.mjs` en CI.
- [x] Compose local/production config validation.
- [x] lint.
- [x] **131/131 tests, 33 archivos**; `campaign-worker-safety.test.mjs` contiene 14 pruebas.
- [x] build Next 16.3.1 + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker build.
- [x] runtime smoke como usuario `node`; readiness PostgreSQL + Redis `ok`.
- [x] Barrido global independiente del scheduler encuentra `SENDING` stale en campañas `RUNNING`, `PAUSED`, `STOPPED` y `FAILED`.
- [x] `DRAFT`, `SCHEDULED`, `COMPLETED` y mensajes fresh quedan fuera del sweep global.
- [x] Claim stale `CLAIMED_NOT_SENT` en `STOPPED` -> `CANCELLED/CAMPAIGN_STOPPED`.
- [x] Claim stale `CLAIMED_NOT_SENT` en `RUNNING`, `PAUSED` o `FAILED` -> `PENDING/CLAIM_RECOVERED` sin reactivar la campaña.
- [x] Cualquier stale posterior al inicio del proveedor -> `FAILED/UNKNOWN_PROVIDER_RESULT`, sin retry ciego.
- [x] Si la campaña estaba `RUNNING` y aparece un resultado post-provider incierto, la campaña pasa a `FAILED` en la misma transacción.
- [x] Transición del mensaje + `CampaignEvent` + eventual fallo de campaña RUNNING quedan atómicos por candidato.
- [x] Dos sweeps concurrentes sobre la misma fila producen una sola transición efectiva y un solo evento.
- [x] Recálculo de contadores se ejecuta una vez por campaña afectada después del sweep.
- [x] Sweep inicial al arrancar el worker y sweep periódico configurable mediante `WORKER_STALE_SWEEP_INTERVAL_MS`.
- [x] El sweep periódico funciona tanto con Redis/BullMQ como en fallback polling sin Redis.
- [x] `WORKER_STALE_SENDING_SECONDS=600` y `WORKER_STALE_SWEEP_INTERVAL_MS=60000` documentados en `.env.production.example`.
- [x] Logging estructurado reporta conteos/cutoff/campañas afectadas sin teléfonos ni contenido de mensajes.
- [x] Cobertura PostgreSQL incluye PAUSED pre-provider, FAILED pre-provider, STOPPED pre-provider, FAILED post-provider, RUNNING post-provider, fresh/excluded y concurrencia.

### QA manual / infraestructura todavía pendiente

- [ ] Ejecutar dos procesos worker reales simultáneos contra el mismo PostgreSQL y comprobar un solo recovery/evento.
- [ ] Matar un worker después del claim pero antes del proveedor y confirmar recovery global posterior.
- [ ] Matar un worker después de iniciar request al proveedor y confirmar cuarentena `UNKNOWN_PROVIDER_RESULT` sin reenvío.
- [ ] Repetir recovery en campañas reales `PAUSED`, `STOPPED` y `FAILED` dentro del stack Docker.
- [ ] Reiniciar Redis/PostgreSQL/worker y observar que el sweep inicial resuelve claims stale antes del ciclo normal.
- [ ] Validar en entorno desplegado que los contadores y eventos quedan coherentes después de una recuperación masiva.
- [ ] Revisar alertas/observabilidad para `unknownCount > 0` y definir procedimiento del operador.
- [ ] Mantener `REAL_SENDING_ENABLED=false` hasta cerrar beta técnica controlada.

---

## P0 — recovery seguro de `PROVIDER_CONFIG_ERROR` conocido como no enviado

### Implementado y validado automáticamente

- [x] PR #21, rama `agent/prebeta-provider-config-recovery`, apilado sobre PR #20.
- [x] SHA de código validado `0297c4306fc5b90b6f4048d2a8029a18494c0314`.
- [x] CI run `32695032673`, job `97335438617`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma generate + migraciones 0001–0006; no se requirió migración nueva.
- [x] `node --check` para `campaign-worker.mjs`, `campaign-worker-safety.mjs` y `evolution-provider-config.mjs`.
- [x] Compose local/production config validation.
- [x] lint.
- [x] **145/145 tests, 35 archivos**.
- [x] Validadores equivalentes TypeScript y `.mjs` distinguen mock/real, exigen URL+API key en real y rechazan URL inválida o no HTTP(S).
- [x] El worker valida configuración inmediatamente antes de `PROVIDER_CALL_STARTED`.
- [x] Config inválida real -> `FAILED/PROVIDER_CONFIG_ERROR` conocido como `NOT_SENT`, sin request al proveedor y sin incrementar `attemptCount`.
- [x] Mensaje, `CampaignEvent`, eventual fallo de campaña RUNNING y contadores quedan en una sola transacción para ese fallo pre-provider.
- [x] Start explícito de una campaña con `PROVIDER_CONFIG_ERROR` queda bloqueado mientras la configuración actual no valide.
- [x] Después de corregir la configuración, Start puede resetear exclusivamente esos errores a `PENDING/PROVIDER_CONFIG_RETRY_CONFIRMED`.
- [x] `retryResetCount` incluye tanto retry exhaustivo seguro como recovery de config, y `providerConfigResetCount` conserva trazabilidad específica.
- [x] `UNKNOWN_PROVIDER_RESULT` continúa bloqueado hasta reconciliación manual.
- [x] `PROVIDER_REJECTED` no forma parte de la whitelist de recovery seguro.
- [x] Gate de plan `allowRealSending` y kill switch global permanecen independientes.
- [x] build Next 16.3.1 + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker build.
- [x] runtime smoke como usuario `node`; readiness PostgreSQL + Redis `ok`.

### QA manual / proveedor real todavía pendiente

- [ ] En un worker real con `REAL_SENDING_ENABLED=true` solo dentro de un entorno aislado/stub, retirar URL/API key y demostrar con request counter/tcpdump que ocurre **cero** HTTP outbound y `attemptCount` permanece 0.
- [ ] Repetir con URL malformada y con esquema no HTTP(S).
- [ ] Corregir la configuración mediante reinicio del contenedor/proceso y confirmar que el mensaje no se reactiva por sí solo: requiere Start explícito del operador.
- [ ] Después del Start explícito con configuración reparada, confirmar exactamente un nuevo intento al proveedor stub.
- [ ] Dos operadores HTTP simultáneos intentando Start sobre la misma campaña fallida -> una sola transición efectiva y conflicto observable para el perdedor.
- [ ] Confirmar que API key/secret nunca aparece en `CampaignEvent`, `AuditLog`, logs ni UI.
- [ ] Confirmar que `allowRealSending=false` sigue bloqueando aunque la configuración Evolution sea sintácticamente válida.
- [ ] API key incorrecta / respuesta 4xx debe seguir ruta `PROVIDER_REJECTED` y **no** entrar automáticamente en este recovery.
- [ ] Mantener `REAL_SENDING_ENABLED=false` y `AGENT_REAL_REPLY_ENABLED=false` fuera de ensayos aislados explícitos.

---

## P0 — cuota diaria atómica entre workers/campañas

### Implementado y validado automáticamente

- [x] PR #22, rama `agent/prebeta-atomic-daily-quota`, apilado sobre PR #21.
- [x] SHA de código validado `be329961dd13eeaaff43c045a852881f2ec63518`.
- [x] CI run `32695907813`, job `97337803803`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma generate + migraciones 0001–0007; nueva `0007_atomic_daily_message_quota` aplicada correctamente.
- [x] Compose local/production config validation, lint y `node --check` de worker/provider.
- [x] **156/156 tests, 37 archivos**.
- [x] Workspace tiene timezone canónico, default `America/Lima`, para que la cuota de workspace no dependa del timezone de cada campaña.
- [x] Cada `CampaignMessage` puede persistir `dailyQuotaDate`, `dailyQuotaReservedAt` y `dailyQuotaReleasedAt`.
- [x] Reserva de cuota y transición a `PROVIDER_CALL_STARTED` quedan serializadas bajo advisory transaction lock por `workspace + día local`.
- [x] No se mantiene transacción PostgreSQL abierta durante el HTTP a Evolution.
- [x] Dos campañas concurrentes con límite 1 producen exactamente una reserva exitosa.
- [x] Límite alcanzado devuelve el mensaje a `PENDING/DAILY_LIMIT_REACHED` sin incrementar `attemptCount`.
- [x] Config Evolution inválida falla antes de reservar cuota.
- [x] `SENT` y `UNKNOWN_PROVIDER_RESULT` conservan reserva de forma conservadora.
- [x] Resultado inequívoco `NOT_SENT` libera la reserva.
- [x] `CONFIRMED_NOT_SENT` libera exactamente una reserva y `CONFIRMED_SENT` conserva/reconsume el cupo.
- [x] `SENT` históricos sin metadata de reserva se contabilizan por `sentAt` para evitar subcontar durante transición.
- [x] Cobertura de fecha local incluye Lima/UTC y DST de New York.
- [x] build Next 16.3.1 + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker build.
- [x] runtime smoke como usuario `node`; readiness PostgreSQL + Redis `ok`.

### QA manual / infraestructura todavía pendiente

- [ ] Dos procesos worker reales y dos campañas distintas compitiendo por el último cupo diario.
- [ ] Matar worker después de reservar y antes/durante el provider call; verificar que el recovery no regala un cupo potencialmente consumido.
- [ ] Reconciliar un UNKNOWN como `CONFIRMED_NOT_SENT` y comprobar que el cupo vuelve a estar disponible exactamente una vez.
- [ ] Reconciliar un UNKNOWN como `CONFIRMED_SENT` y comprobar que el cupo permanece consumido.
- [ ] Ejecutar casos alrededor de medianoche local y transición DST en stack desplegado.
- [ ] Cambiar plan/límite durante tráfico concurrente y comprobar política conservadora.
- [ ] Validar métricas/alertas de límite diario alcanzado y reservas retenidas por UNKNOWN.
- [ ] Mantener `REAL_SENDING_ENABLED=false` y `AGENT_REAL_REPLY_ENABLED=false` fuera de ensayos aislados explícitos.

---

## P0 — límite de bytes en respuestas de extracción de Evolution

### Implementado y validado automáticamente

- [x] PR #23, rama `agent/prebeta-extract-response-cap`, apilado sobre PR #22.
- [x] SHA de código validado `f8426af1f04533d84473978ab214da533ca08e78`.
- [x] CI run `32726693664`, job `97429478085`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma generate + migraciones 0001–0007; no se requirió migración nueva.
- [x] Compose local/production config validation, shell checks y `node --check` de worker/provider.
- [x] lint.
- [x] **165/165 tests, 39 archivos**.
- [x] `EVOLUTION_EXTRACT_MAX_RESPONSE_BYTES` default 5 MiB, configurable con clamp máximo 50 MiB.
- [x] `Content-Length` mayor al máximo se rechaza antes de materializar el body y se intenta cancelar el stream.
- [x] Respuestas chunked/sin longitud confiable se leen por stream contando `Uint8Array.byteLength` y se cancelan al exceder el máximo.
- [x] Boundary exacto permitido; UTF-8 multibyte se mide por bytes reales, no por longitud de string JS.
- [x] El cap solo se activa en extracción y no cambia QR/status/envío.
- [x] HTTP no-2xx se rechaza y cancela sin cargar/parsing del body; 404/405 conserva fallback POST→GET.
- [x] Errores diferenciados: `EVOLUTION_RESPONSE_TOO_LARGE`, `EVOLUTION_INVALID_JSON`, `EVOLUTION_HTTP_ERROR`, `EVOLUTION_TIMEOUT`.
- [x] `EXTRACT_NUMBERS_MAX_RECORDS=5000` permanece como segunda barrera lógica.
- [x] Persistencia/audit de extracción solo comienza después de recibir, parsear y normalizar completamente la respuesta; oversized/timeout/JSON inválido no pueden persistir resultados parciales por ese flujo.
- [x] `.env.example` y `.env.production.example` documentan el nuevo límite.
- [x] Los runs #131 y #132 detectaron únicamente incompatibilidades TypeScript del helper de env; ambos tuvieron lint/tests verdes y se corrigieron antes del SHA final.
- [x] build Next 16.3.1 + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker build.
- [x] runtime smoke como usuario `node`; readiness PostgreSQL + Redis `ok`.

### QA manual / infraestructura todavía pendiente

- [ ] Stub HTTP con `Content-Length` mayor al máximo: confirmar rechazo/cancelación y 0 nuevas filas/audit de extracción.
- [ ] Stub chunked que exceda el máximo después de varios chunks: confirmar cancelación del body y 0 persistencia.
- [ ] Respuesta exactamente en el límite debe procesarse completa.
- [ ] Respuesta multibyte alrededor del límite debe medirse por bytes UTF-8.
- [ ] JSON incompleto/inválido y timeout/abort deben producir 0 filas nuevas.
- [ ] Evolution real con dataset grande: observar memoria máxima del proceso, latencia y código de error operacional.
- [ ] Verificar que reverse proxy/Caddy no bufferice un body gigante de manera que invalide el beneficio esperado del streaming en el proceso app.
- [ ] Mantener `REAL_SENDING_ENABLED=false` y `AGENT_REAL_REPLY_ENABLED=false` durante estos ensayos.

---

## P0 — linealización de auto-reply contra handoff y opt-out concurrentes

### Implementado y validado automáticamente

- [x] PR #24, rama `agent/prebeta-agent-reply-linearization`, apilado sobre PR #23.
- [x] SHA de código validado `a3da5b55139b0eb864b8296dacb75a263112c692`.
- [x] CI run `32736131004`, job `97459263770`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma 6.12 generate + migraciones 0001–0007; no se requirió migración nueva.
- [x] Compose local/production config validation, shell checks y `node --check` de worker/provider.
- [x] lint.
- [x] **172/172 tests, 40 archivos**.
- [x] Nueva suite PostgreSQL `reply-delivery.integration.test.ts`: 7/7.
- [x] Advisory transaction lock corto por `workspace + conversation`; no se mantiene transacción durante HTTP a Evolution.
- [x] Handoff manual, handoff por keyword, opt-out y claim de auto-reply compiten por el mismo lock.
- [x] Después del LLM, el claim vuelve a validar conversación abierta, opt-out/denegación, agente ACTIVE, `autoReplyEnabled`, rate limit y otro reply en vuelo.
- [x] El punto de linealización del envío es un `ConversationMessage` `assistant_pending` con `deliveryState=PROVIDER_CALL_STARTED`, persistido antes de Evolution.
- [x] Dos claims concurrentes de una conversación producen exactamente un marker ganador y el otro queda bloqueado como `REPLY_IN_FLIGHT`.
- [x] Si handoff u opt-out ganan antes del marker, el claim se rechaza y el auto-reply no puede iniciar Evolution.
- [x] Respuesta confirmada transforma la misma fila a `assistant/SENT`; no crea una segunda fila outbound.
- [x] Error posterior al marker transforma la fila a `assistant_unknown/UNKNOWN_PROVIDER_RESULT`; no hay retry ciego.
- [x] Marker pending stale se cuarentena a `assistant_unknown` y cualquier unknown existente bloquea replies posteriores hasta reconciliación explícita.
- [x] `AGENT_REPLY_PENDING_STALE_SECONDS=30`; runtime exige al menos 30 s, `EVOLUTION_TIMEOUT_MS + 10 s` y aplica clamp máximo de 10 min.
- [x] Auditoría de marker started/sent/unknown no duplica el contenido del mensaje.
- [x] `.env.example` y `.env.production.example` documentan el threshold stale.
- [x] build Next 16.3.1 + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker build.
- [x] runtime smoke como usuario `node`; readiness PostgreSQL + Redis `ok`.

### QA manual / infraestructura todavía pendiente

- [ ] Stub Evolution con contador: LLM lento + handoff que gana antes del marker -> 0 provider calls del auto-reply.
- [ ] Stub Evolution con contador: `STOP`/opt-out que gana antes del marker -> 0 provider calls automáticos posteriores; distinguir explícitamente el mensaje de confirmación de opt-out del auto-reply normal.
- [ ] Dos procesos/app replicas contra el mismo PostgreSQL procesando inbounds distintos de la misma conversación -> máximo un marker/provider call concurrente.
- [ ] Forzar handoff justo alrededor del commit del marker: si handoff gana primero, 0 auto-send; si marker gana primero, puede existir exactamente un intento ya linealizado, nunca dos.
- [ ] Matar proceso después de persistir marker y antes/durante Evolution; tras superar threshold, confirmar cuarentena `assistant_unknown` y bloqueo de automatización posterior.
- [ ] Simular timeout/connection reset después de que el proveedor pudo aceptar el request; confirmar UNKNOWN y ausencia de retry automático.
- [ ] Confirmar en entorno desplegado que un `assistant_unknown` permanece bloqueante tras reinicios de app/Redis porque la fuente de verdad es PostgreSQL.
- [ ] Validar `AGENT_REPLY_PENDING_STALE_SECONDS` frente al timeout real del proxy/Evolution y mantener margen suficiente.
- [ ] Revisar observabilidad/alertas para `REPLY_IN_FLIGHT`, stale quarantine y `UNKNOWN_PROVIDER_RESULT`.
- [x] El listado normal excluye markers pending/unknown/not-sent y MEMBER no recibe el contenido de `replyReview`; endurecimiento implementado en PR #25.
- [x] Reconciliación explícita OWNER/ADMIN de `assistant_unknown` implementada y validada automáticamente en PR #25; QA HTTP/proveedor real sigue pendiente abajo.
- [ ] Mantener `AGENT_REAL_REPLY_ENABLED=false` y `REAL_SENDING_ENABLED=false` hasta cerrar reconciliación y beta técnica controlada.

---

## P0 — reconciliación operacional de `assistant_unknown`

### Implementado y validado automáticamente

- [x] PR #25, rama `agent/prebeta-agent-reply-reconciliation`, apilado sobre PR #24.
- [x] SHA de código validado `18eca5f870c2f966e139ee1f9191b7798bcdf0b7`.
- [x] CI run `32737827812`, job `97464844069`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma 6.12 generate + migraciones 0001–0007; no se requirió migración nueva.
- [x] Compose local/production config validation, shell checks y `node --check` de worker/provider.
- [x] lint.
- [x] **180/180 tests, 41 archivos**.
- [x] Nueva suite PostgreSQL `reply-reconciliation.integration.test.ts`: 8/8.
- [x] Solo OWNER/ADMIN puede reconciliar por API; la ruta aplica rate limit distribuido y validación de IDs.
- [x] Decisiones explícitas `CONFIRMED_SENT` y `CONFIRMED_NOT_SENT`, con `confirmed:true` y motivo obligatorio de 8–500 caracteres.
- [x] La reconciliación usa el mismo advisory lock por conversación que reply/handoff/opt-out y solo transiciona desde `assistant_unknown`.
- [x] Dos operadores concurrentes producen exactamente un ganador; el segundo recibe conflicto 409 y no duplica AuditLog.
- [x] `CONFIRMED_SENT` reutiliza la misma fila como `assistant`, admite `providerMessageId` opcional coherente y no crea un segundo outbound.
- [x] `CONFIRMED_NOT_SENT` usa `assistant_not_sent`, no lo incorpora al historial LLM y no reenvía el contenido anterior.
- [x] `providerMessageId` conflictivo se rechaza; además no se acepta provider ID al declarar `CONFIRMED_NOT_SENT`.
- [x] El aislamiento cross-workspace devuelve 404.
- [x] La decisión preserva la cronología original del marker; no cambia `Conversation.lastMessageAt` a la hora de reconciliación.
- [x] AuditLog registra decisión, motivo, evidencia y hash/últimos 4 del contacto sin duplicar el contenido completo del reply.
- [x] El servicio de reconciliación no importa ni invoca Evolution.
- [x] `/api/conversations` toma como último mensaje normal solo roles `user/assistant`; markers internos dejan de aparecer como conversación normal.
- [x] `replyReview` con contenido incierto se entrega solo a OWNER/ADMIN; MEMBER no recibe ese contenido por el listado.
- [x] UI operacional muestra incidente incierto separado y exige motivo + confirmación antes de ambas decisiones; el copy deja explícito que reconciliar no reenvía.
- [x] build Next 16.3.1 + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker build.
- [x] runtime smoke como usuario `node`; readiness PostgreSQL + Redis `ok`.

### QA manual / proveedor real todavía pendiente

- [ ] HTTP/browser real: MEMBER no puede reconciliar; OWNER/ADMIN sí y solo recibe `replyReview` con permisos de operación.
- [ ] Stub/spy Evolution: ambas reconciliaciones deben producir **0** requests al proveedor.
- [ ] Provocar un `assistant_unknown` mediante timeout/connection reset controlado y recorrer `CONFIRMED_SENT` con evidencia real del proveedor.
- [ ] Provocar otro unknown conocido como no enviado y recorrer `CONFIRMED_NOT_SENT`; confirmar que el texto antiguo nunca se reenvía automáticamente.
- [ ] Tras `CONFIRMED_NOT_SENT`, un inbound futuro puede generar un reply nuevo si todos los kill switches/rate limits lo permiten.
- [ ] Dos operadores HTTP simultáneos reconciliando el mismo marker -> una sola decisión efectiva, un solo AuditLog y conflicto observable para el perdedor.
- [ ] Validar conflicto de `providerMessageId` y rechazo de provider ID en `CONFIRMED_NOT_SENT` desde HTTP/UI real.
- [ ] Validar UX de advertencia, motivo, confirmaciones, loading/error y accesibilidad en desktop/mobile/teclado.
- [ ] Inspeccionar respuesta HTTP de `/api/conversations` como MEMBER y comprobar ausencia de `replyReview`/contenido generado incierto.
- [ ] Mantener `AGENT_REAL_REPLY_ENABLED=false` y `REAL_SENDING_ENABLED=false` fuera de ensayos aislados explícitos.

---

## P0 — presupuestos diarios atómicos para auto-replies

### Implementado y validado automáticamente

- [x] PR #26, rama `agent/prebeta-agent-daily-budget`, apilado sobre PR #25.
- [x] SHA de código validado `4f8a811c5817f3a49b73439ee26d7369dad2b09a`.
- [x] CI run `32775531871`, job `97585609540`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma 6.12 generate + migraciones 0001–0008; nueva `0008_agent_daily_usage_budget` aplicada correctamente.
- [x] lint.
- [x] **189/189 tests, 44 archivos**.
- [x] `AgentDailyUsage` persiste contadores únicos por `workspace + usageDate`, usando el timezone canónico del workspace.
- [x] Advisory transaction lock por workspace serializa reservas de presupuesto entre procesos/réplicas.
- [x] `AGENT_DAILY_LLM_LIMIT=50` y `AGENT_DAILY_PROVIDER_CALL_LIMIT=50` son defaults técnicos; valor `0` funciona como kill switch de esa fase.
- [x] La reserva LLM ocurre antes de `provider.generateResponse()`, de modo que el presupuesto limita costo de generación y no solo envíos.
- [x] La reserva de provider ocurre antes de `assistant_pending/PROVIDER_CALL_STARTED`; si no hay cupo, Evolution no puede iniciarse por esa ruta.
- [x] Dos reservas LLM concurrentes compitiendo por el último cupo producen exactamente un ganador.
- [x] Dos conversaciones distintas compitiendo por el último provider slot producen exactamente un marker ganador.
- [x] Provider starts se consumen conservadoramente aunque el resultado posterior sea UNKNOWN, porque el request pudo haber ocurrido.
- [x] `llmDenied` y `providerDenied` quedan persistidos para observabilidad.
- [x] Cobertura de fecha local incluye Lima/UTC y DST de New York, además de rollover de medianoche local.
- [x] Los presupuestos técnicos se mantienen independientes de `Plan.dailyMessageLimit`; no se cambió todavía la semántica comercial de planes.
- [x] El run #141 (`32775252021`) detectó un único error TypeScript en el tipo del default `process.env`; se corrigió sin cambiar comportamiento y #142 validó el SHA final.
- [x] build Next 16.3.1 + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker build.
- [x] runtime smoke como usuario `node`; readiness PostgreSQL + Redis `ok`.

### QA manual / infraestructura todavía pendiente

- [ ] Dos o más réplicas app contra el mismo PostgreSQL, con conversaciones distintas, compitiendo por el último cupo LLM: exactamente una generación externa debe iniciar.
- [ ] Dos o más réplicas app contra el mismo PostgreSQL, con conversaciones distintas, compitiendo por el último cupo provider: exactamente un request Evolution debe iniciar.
- [ ] Ejecutar límites `0` y `1` a través del webhook HTTP real y confirmar respuestas operacionales y contadores persistidos.
- [ ] Ejecutar casos alrededor de medianoche local y DST en stack desplegado.
- [ ] Confirmar que reinicios de app/Redis no reinician los presupuestos diarios porque PostgreSQL es la fuente de verdad.
- [ ] Comparar `llmAttempts/providerStarts` con request counters y costos reales del proveedor durante una prueba controlada; UNKNOWN debe conservar consumo provider.
- [ ] Inspeccionar AuditLog/telemetría para confirmar que los eventos de presupuesto no copian contenido completo de mensajes ni teléfonos.
- [ ] Añadir/validar métricas o alertas operacionales para `llmDenied`, `providerDenied` y uso cercano al límite antes de beta externa.
- [ ] Definir más adelante cómo estos límites técnicos se relacionarán con límites comerciales por plan, sin relajar los safety caps.
- [ ] Mantener `AGENT_REAL_REPLY_ENABLED=false` y `REAL_SENDING_ENABLED=false` fuera de ensayos aislados explícitos.

---

## P0 — lease persistente pre-LLM por conversación

### Implementado y validado automáticamente

- [x] PR #27, rama `agent/prebeta-agent-llm-lease`, apilado sobre PR #26.
- [x] SHA de código validado `2b8881d96b30be15dbf0412cb27f824903b78c18`.
- [x] CI run `32796979724`, job `97650220575`, conclusión `success`.
- [x] `npm audit --audit-level=moderate`: 0 vulnerabilidades.
- [x] Prisma 6.12 generate + migraciones 0001–0008; no se requirió migración nueva para el lease.
- [x] Compose local/production config validation, shell checks y `node --check` de worker/provider.
- [x] lint.
- [x] **196/196 tests, 46 archivos**.
- [x] Nueva suite PostgreSQL `reply-generation.integration.test.ts`: 6/6.
- [x] Nueva prueba end-to-end `reply-generation-webhook.integration.test.ts`: 1/1; dos webhooks distintos del mismo contacto, con el primer OpenAI simulado deliberadamente lento, ejecutan exactamente **una** llamada LLM, un provider start y un outbound assistant.
- [x] `ConversationMessage.role=assistant_generating` funciona como lease persistente creado antes de iniciar el LLM; no requiere una tabla/fuente de verdad nueva.
- [x] Creación/reclaim/promoción del lease usa el mismo advisory transaction lock por `workspace + conversation` que handoff/opt-out/reply delivery.
- [x] Reserva diaria LLM y creación del lease ocurren en la misma transacción, cerrando la ventana entre lock de conversación y presupuesto.
- [x] No se mantiene ninguna transacción PostgreSQL abierta durante la llamada HTTP externa al LLM.
- [x] Un segundo inbound con lease fresh obtiene `GENERATION_IN_FLIGHT` y no llama al modelo.
- [x] Un fallo LLM transforma inmediatamente su lease a `assistant_not_sent`; no necesita esperar el threshold stale para permitir un intento posterior.
- [x] Un lease stale puede abandonarse/reclamarse de forma segura porque Evolution aún no ha comenzado en esa fase.
- [x] Un proceso viejo que termina después de que su lease fue reclamado recibe `GENERATION_LEASE_LOST` y no puede reservar provider ni iniciar Evolution.
- [x] El resultado LLM solo puede iniciar provider promoviendo **la misma fila** `assistant_generating` a `assistant_pending/PROVIDER_CALL_STARTED` bajo el lock de conversación.
- [x] Handoff, opt-out/contacto bloqueado, agente deshabilitado, rate limit, otro pending/unknown o presupuesto provider agotado después del LLM descartan el lease en lugar de enviar.
- [x] `assistant_generating` y `assistant_not_sent` quedan fuera del historial normal del LLM porque este solo incorpora roles `user/assistant`.
- [x] `AGENT_LLM_GENERATION_STALE_SECONDS=60`; runtime aplica clamp de 45 s a 10 min.
- [x] CI #143 (`32796771850`) detectó que un test legado de reconciliación llamaba directamente al claim post-LLM sin lease; se adaptó al nuevo contrato pre-LLM y el run final #145 validó toda la cadena.
- [x] build Next 16.3.1 + TypeScript.
- [x] backup/restore round-trip.
- [x] Docker build.
- [x] runtime smoke como usuario `node`; readiness PostgreSQL + Redis `ok`.

### QA manual / infraestructura todavía pendiente

- [ ] Dos réplicas app reales contra el mismo PostgreSQL, con LLM stub deliberadamente lento y dos inbounds distintos de la misma conversación -> exactamente una request externa LLM.
- [ ] Matar una réplica después de persistir `assistant_generating` y mientras el LLM está en vuelo; tras el threshold, otra réplica debe reclamar y el proceso viejo, si reaparece, no debe poder iniciar Evolution.
- [ ] Handoff manual mientras el LLM está en vuelo -> el resultado generado debe descartarse y producir 0 auto-reply requests a Evolution.
- [ ] `STOP`/opt-out mientras el LLM está en vuelo -> el resultado generado debe descartarse; distinguir el eventual mensaje de confirmación de opt-out del auto-reply normal.
- [ ] Deshabilitar agente/auto-reply mientras el LLM está en vuelo -> el resultado generado debe descartarse antes del provider.
- [ ] Agotar `AGENT_DAILY_PROVIDER_CALL_LIMIT` mientras una generación ya está en vuelo -> al terminar el LLM se debe descartar el lease y producir 0 requests Evolution.
- [ ] Validar `AGENT_LLM_GENERATION_STALE_SECONDS` contra timeout/p95/p99 reales del proveedor LLM. Un valor demasiado corto puede duplicar costo LLM, aunque el lease viejo seguirá impedido de iniciar Evolution.
- [ ] Reiniciar app/Redis durante una generación y confirmar que el lease sigue visible/bloqueante porque PostgreSQL es la fuente de verdad.
- [ ] Confirmar por HTTP/UI que `assistant_generating` y `assistant_not_sent` nunca aparecen como mensajes normales ni entran al contexto del agente.
- [ ] Añadir/validar métricas y alertas para `GENERATION_IN_FLIGHT`, stale reclaim, `GENERATION_LEASE_LOST` y resultados LLM descartados.
- [ ] Mantener `AGENT_REAL_REPLY_ENABLED=false` y `REAL_SENDING_ENABLED=false` fuera de ensayos aislados explícitos.