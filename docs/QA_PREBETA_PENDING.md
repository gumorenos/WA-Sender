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

## P0 siguiente — recovery de webhooks `PROCESSING` stale

### Desarrollo previsto

- [ ] Detectar `PROCESSING` con antigüedad configurable y moverlos a revisión sin auto-reproceso.
- [ ] Vista/API tenant-scoped para eventos stale sin exponer payload crudo.
- [ ] Decisión explícita OWNER/ADMIN: autorizar retry solo ante redelivery o marcar procesado manualmente.
- [ ] Redelivery autorizado solo puede recuperar el mismo ledger row si el payload hash coincide exactamente.
- [ ] Hash distinto con mismo providerEventId debe bloquearse y volver a revisión.
- [ ] Dos redeliveries concurrentes autorizados -> un solo claimant.
- [ ] Audit de decisión del operador.
- [ ] Tests PostgreSQL de stale detection, retry, hash mismatch, concurrencia y manual processed.
- [ ] UI operativa mínima.

### QA que seguirá requiriendo entorno real

- [ ] Crash real después de claim y antes de completar procesamiento.
- [ ] Redelivery real de Evolution después de recovery autorizado.
- [ ] Confirmar ausencia de doble LLM/reply/opt-out en recovery real.
- [ ] Mobile/desktop/teclado.
