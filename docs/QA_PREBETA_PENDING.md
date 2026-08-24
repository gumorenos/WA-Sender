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

## P0 siguiente — handoff humano persistente

### Desarrollo previsto

- [ ] Estado persistente por conversación para handoff humano.
- [ ] Detección de keywords configuradas antes de llamar al LLM.
- [ ] Inbound siempre se persiste aunque el handoff esté activo.
- [ ] Handoff activo bloquea auto-reply/LLM/Evolution.
- [ ] Acción explícita OWNER/ADMIN para iniciar handoff manualmente.
- [ ] Acción explícita OWNER/ADMIN para reanudar agente.
- [ ] Audit de inicio/fin sin guardar contenido sensible innecesario.
- [ ] Aislamiento por workspace y protección contra carreras.
- [ ] Tests unitarios + integración PostgreSQL/webhook.
- [ ] UI operativa mínima para revisar/reanudar conversaciones en handoff.

### QA que seguirá requiriendo entorno real

- [ ] Webhook inbound real activa handoff por keyword.
- [ ] Mientras un humano atiende, ningún mensaje genera auto-reply.
- [ ] Reanudar agente permite responder solo al siguiente inbound y respetando todos los kill switches existentes.
- [ ] Opt-out mantiene prioridad sobre handoff y nunca reactiva automatización.
- [ ] Mobile/desktop/teclado.
