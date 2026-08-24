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
- [ ] Revisar la carrera residual entre la última lectura de `HUMAN_HANDOFF` y el inicio efectivo del request a Evolution antes de habilitar replies reales; si se necesita garantía linealizable, agregar lock/lease compartido alrededor de send/handoff.
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

## P0 siguiente — cuota diaria atómica entre workers/campañas

### Desarrollo previsto

- [ ] Eliminar la carrera `count(SENT) -> send` que permite que dos workers/campañas vean simultáneamente el último cupo diario disponible.
- [ ] Reservar el cupo antes de iniciar la llamada al proveedor, bajo serialización PostgreSQL por `workspace + día local`.
- [ ] No mantener una transacción abierta durante la llamada HTTP a Evolution.
- [ ] Una reserva consumida por `SENT` debe permanecer contabilizada.
- [ ] Un `UNKNOWN_PROVIDER_RESULT` debe conservar la reserva de forma conservadora hasta reconciliación.
- [ ] Un resultado inequívoco `NOT_SENT` debe liberar la reserva para permitir un intento posterior seguro.
- [ ] `CONFIRMED_NOT_SENT` en reconciliación debe liberar la reserva; `CONFIRMED_SENT` debe mantenerla consumida.
- [ ] Dos reservas concurrentes con límite diario 1 deben producir un solo ganador, incluso en campañas distintas.
- [ ] La cuota debe respetar el día local de la campaña/workspace y cambios DST donde corresponda.
- [ ] Añadir migración Prisma, índices y cobertura PostgreSQL de concurrencia, release y reconciliación.

### QA que seguirá requiriendo infraestructura real

- [ ] Dos procesos worker reales y dos campañas distintas compitiendo por el último cupo diario.
- [ ] Matar worker después de reservar y antes/durante el provider call; verificar que el recovery no regala un cupo potencialmente consumido.
- [ ] Reconciliar un UNKNOWN como `CONFIRMED_NOT_SENT` y comprobar que el cupo vuelve a estar disponible exactamente una vez.
- [ ] Ejecutar casos alrededor de medianoche local y, si se habilitan otros husos, transición DST.
- [ ] Validar métricas/alertas de límite diario alcanzado y reservas huérfanas.
- [ ] Mantener envío real deshabilitado hasta cerrar estos escenarios de beta técnica.
