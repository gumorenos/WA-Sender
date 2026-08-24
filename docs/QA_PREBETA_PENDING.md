# QA pre-beta pendiente — WA-Sender

Última actualización: 2026-08-23

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

## P0 siguiente — recovery seguro de `PROVIDER_CONFIG_ERROR` conocido como no enviado

### Desarrollo previsto

- [ ] Validar configuración local de Evolution antes de cambiar el mensaje de `CLAIMED_NOT_SENT` a `PROVIDER_CALL_STARTED`.
- [ ] Si falta URL/API key o la URL es inválida/no HTTP(S), fallar como `PROVIDER_CONFIG_ERROR` conocido `NOT_SENT` sin incrementar `attemptCount` ni invocar Evolution.
- [ ] Mantener la validación dentro del cliente/provider como defensa adicional.
- [ ] Permitir Start explícito de una campaña `FAILED` con mensajes `PROVIDER_CONFIG_ERROR` únicamente si la configuración actual ya es sintácticamente válida para el modo real.
- [ ] Resetear solo esos errores conocidos a `PENDING` mediante transición explícita/auditada; no incluir `PROVIDER_REJECTED` ni `UNKNOWN_PROVIDER_RESULT`.
- [ ] Si la configuración sigue inválida, Start debe responder conflicto y no modificar campaña/mensajes.
- [ ] Mantener gates de plan `allowRealSending` y kill switch global.
- [ ] Tests unitarios de configuración y PostgreSQL de retry seguro / config aún inválida / UNKNOWN siempre bloqueado.
- [ ] No se prevé migración Prisma.

### QA que seguirá requiriendo proveedor real

- [ ] Stack real con Evolution mal configurado: demostrar cero requests antes del fix.
- [ ] Corregir configuración, realizar Start explícito y demostrar exactamente un intento posterior.
- [ ] API key presente pero incorrecta/4xx debe seguir una ruta de rechazo distinta y no entrar en recovery de config sintáctica.
- [ ] Mantener `REAL_SENDING_ENABLED=false` durante desarrollo y QA automatizado; cualquier ensayo real posterior debe ser controlado.
