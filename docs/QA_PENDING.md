# QA pendiente — WA-Sender

Última actualización: 2026-08-18

Este archivo es la fuente de verdad para todo lo que todavía requiere validación manual, integración, infraestructura real o ejecución de la suite. Debe actualizarse en cada etapa de desarrollo.

## Estado de referencia

- Rama actual: `agent/stage-02-agent-kill-switches`.
- Base de Etapa 1: `agent/stage-01-consent-hardening` / PR `#2`.
- PR actual: `#3` — Stage 2: gate agent auto-replies and add kill switches.
- Base original: `main` en `1147026f7dfabfa514efe2dd7a3fba3c8dac9991`.
- Entorno usado para cambios: edición remota mediante GitHub; no existe checkout ejecutable con acceso de red en el entorno actual.
- CI Etapa 1 verificado sobre `d11abbcf3d913e1f544c4462fedb214c8c4f0e20`: run `32198937703`, job `95908484233`, conclusión `success`.
- CI Etapa 2 verificado sobre `239662dc2c6d42ebaa6c3beaa9d6b6bedbfcead3`: run `32199509481`, job `95910096775`, conclusión `success`.
- Envío real: debe permanecer deshabilitado hasta cerrar los P0 de consentimiento, auto-reply, idempotencia y worker.

## Regla de cierre

Una casilla solo puede marcarse como completada si existe evidencia reproducible: salida de comando, captura, log estructurado, consulta SQL o resultado de prueba automatizada. No marcar como aprobado por inspección visual del código solamente.

## Etapa 0 — Línea base técnica

### Automatizado

- [x] Ejecutar `npm ci` con el lockfile actual.
- [x] Ejecutar `npm run db:generate`.
- [x] Ejecutar `npm run lint`.
- [x] Ejecutar `npm run test`.
- [x] Ejecutar `npm run build`.
- [ ] Ejecutar `docker compose config` para el compose de desarrollo/local que corresponda.
- [ ] Ejecutar `docker compose --env-file .env.production.example config` para producción.
- [ ] Construir la imagen Docker de la app.
- [ ] Construir/verificar la imagen en ARM64, que es el destino previsto de Oracle Cloud.
- [ ] Confirmar que no se introdujeron vulnerabilidades conocidas con `npm audit --audit-level=moderate` o el gate que se adopte para releases.

Evidencia 2026-08-18: GitHub Actions run `32199509481` sobre `239662dc2c6d42ebaa6c3beaa9d6b6bedbfcead3`. Pasaron instalación, Prisma generate, migraciones contra PostgreSQL 16, lint, tests y build.

### Evidencia de entorno pendiente

- [x] SHA de Etapa 1 probado: `d11abbcf3d913e1f544c4462fedb214c8c4f0e20`.
- [x] SHA de Etapa 2 probado: `239662dc2c6d42ebaa6c3beaa9d6b6bedbfcead3`.
- [x] Node configurado en CI: Node 20.
- [ ] Registrar versión exacta de npm usada por CI o entorno de release.
- [ ] Registrar versión de Docker/Compose del host de destino.
- [ ] Registrar arquitectura del host (`uname -m`).
- [x] Resultado de lint/test/build registrado mediante GitHub Actions.

## Etapa 1 — Consentimiento de campañas

### Implementación realizada

- [x] La UI exige una atestación explícita antes de habilitar `Iniciar campana`.
- [x] La UI exige fuente y referencia de consentimiento.
- [x] El backend valida `consentAttested=true` independientemente de la UI.
- [x] El backend registra actor, fecha, fuente y referencia en `CampaignEvent` y `AuditLog`.
- [x] El backend promueve mensajes pendientes/fallidos `UNKNOWN` o `NOT_REQUIRED_FOR_MOCK` a `EXPLICITLY_GRANTED` dentro de la misma transacción de inicio.
- [x] `EXPLICITLY_DENIED` no se promueve durante el start.
- [x] El worker bloquea `UNKNOWN` antes de llamar a Evolution.
- [x] El worker bloquea `EXPLICITLY_DENIED` antes de llamar a Evolution.
- [x] El worker bloquea `NOT_REQUIRED_FOR_MOCK` cuando `REAL_SENDING_ENABLED=true`.
- [x] Se agregaron pruebas unitarias de schema para la atestación.
- [x] La suite existente + nuevas pruebas pasan en CI.

Las pruebas funcionales e integración siguientes continúan abiertas hasta contar con evidencia reproducible.

### Pruebas de API / validación

- [ ] POST start sin `consentAttested` devuelve 400.
- [ ] POST start con `consentAttested=false` devuelve 400.
- [ ] POST start sin `consentSource` devuelve 400.
- [ ] POST start con fuente no permitida devuelve 400.
- [ ] POST start sin `consentReference` devuelve 400.
- [ ] POST start con referencia menor de 3 caracteres devuelve 400.
- [ ] POST start con referencia mayor de 240 caracteres devuelve 400.
- [ ] POST start válido sigue respetando el delay mínimo del plan.
- [ ] POST start válido sigue rechazando una instancia inactiva o de otro workspace.
- [ ] POST start válido sigue rechazando una campaña sin mensajes pendientes.

### Pruebas de persistencia / SQL

- [ ] Antes del start crear una campaña con mensajes `UNKNOWN`, `NOT_REQUIRED_FOR_MOCK`, `EXPLICITLY_GRANTED` y `EXPLICITLY_DENIED`.
- [ ] Tras start confirmar que `UNKNOWN -> EXPLICITLY_GRANTED` solo para mensajes pendientes/fallidos de esa campaña/workspace.
- [ ] Tras start confirmar que `NOT_REQUIRED_FOR_MOCK -> EXPLICITLY_GRANTED` solo para mensajes pendientes/fallidos de esa campaña/workspace.
- [ ] Confirmar que `EXPLICITLY_DENIED` permanece sin cambios.
- [ ] Confirmar que mensajes de otra campaña no cambian.
- [ ] Confirmar que mensajes de otro workspace no cambian.
- [ ] Confirmar que `optInStatus` de los mensajes promovidos queda en `CONFIRMED`.
- [ ] Confirmar que `campaign.consentConfirmedAt` coincide razonablemente con el momento de la atestación.
- [ ] Confirmar evento `CAMPAIGN_CONSENT_ATTESTED` con `actorUserId`, `attestedAt`, `source`, `reference` y `newlyGrantedCount`.
- [ ] Confirmar evento `CAMPAIGN_STARTED` después de una atestación válida.
- [ ] Confirmar `AuditLog` de acción `STARTED` con el bloque `metadata.consent` completo.
- [ ] Forzar un fallo dentro de la transacción y confirmar rollback: no debe quedar consentimiento promovido si la campaña no llega a actualizarse.

### Pruebas de UI

- [ ] El botón `Iniciar campana` está deshabilitado sin atestación.
- [ ] El botón sigue deshabilitado con checkbox marcado pero sin fuente.
- [ ] El botón sigue deshabilitado con fuente pero referencia vacía/corta.
- [ ] El botón se habilita con checkbox + fuente + referencia válida + instancia activa.
- [ ] Cambiar de campaña limpia checkbox, fuente y referencia para evitar reutilización accidental.
- [ ] Después de iniciar se limpian nuevamente los campos de consentimiento.
- [ ] La UI muestra error del backend si se intenta alterar el request manualmente.
- [ ] La UI funciona en viewport móvil.
- [ ] La UI funciona en desktop.
- [ ] Navegación por teclado permite completar checkbox, fuente, referencia y botón.

### Pruebas del worker relacionadas con consentimiento — P0

- [ ] `EXPLICITLY_DENIED` nunca llama a Evolution y queda `SKIPPED`.
- [ ] `UNKNOWN` nunca llama a Evolution y queda `SKIPPED` con `CONSENT_UNCONFIRMED`.
- [ ] `NOT_REQUIRED_FOR_MOCK` nunca puede enviarse cuando `REAL_SENDING_ENABLED=true` y queda `SKIPPED` con `CONSENT_MOCK_ONLY`.
- [ ] `NOT_REQUIRED_FOR_MOCK` puede seguir funcionando únicamente en modo mock.
- [ ] `EXPLICITLY_GRANTED` puede avanzar al envío cuando el resto de gates también se cumple.
- [ ] Una campaña antigua que ya estaba `RUNNING` con mensajes `UNKNOWN` no puede enviarlos tras desplegar el hardening.
- [ ] Se registra evento específico para cada mensaje bloqueado por consentimiento.
- [ ] Los contadores de campaña quedan consistentes después de saltar mensajes por consentimiento.

## Etapa 2 — Auto-reply / agentes

### Implementación realizada

- [x] Asignar un agente ya no modifica `AgentSetting.autoReplyEnabled`.
- [x] `autoReplyEnabled` conserva default `false` al crear un agente.
- [x] El webhook exige `AGENT_AUTOREPLY_ENABLED=true` antes de responder automáticamente.
- [x] El webhook exige `agent.settings.autoReplyEnabled=true`.
- [x] Si `REAL_SENDING_ENABLED=true`, el webhook exige además `AGENT_REAL_REPLY_ENABLED=true` antes de generar/enviar una respuesta real.
- [x] `AGENT_AUTOREPLY_ENABLED=false` y `AGENT_REAL_REPLY_ENABLED=false` quedaron como defaults documentados en `.env.example` y `.env.production.example`.
- [x] Existe endpoint explícito `PATCH /api/agents/[id]/auto-reply`.
- [x] Activar auto-reply por API exige `confirmed=true`.
- [x] Activar auto-reply exige agente `ACTIVE` y versión activa.
- [x] Deshabilitar auto-reply no requiere confirmación adicional.
- [x] La activación/desactivación queda en `AuditLog` como `agent_auto_reply`.
- [x] La pantalla de edición incluye control separado para auto-reply y confirmación al activarlo.
- [x] Pruebas unitarias cubren defaults de kill switch, combinación de gates y confirmación explícita.
- [x] La suite, lint y build pasan en CI sobre el SHA de código de Etapa 2.

Evidencia 2026-08-18: GitHub Actions run `32199509481`, job `95910096775`, SHA `239662dc2c6d42ebaa6c3beaa9d6b6bedbfcead3`, conclusión `success`.

### Pruebas funcionales / integración pendientes — P0

- [ ] Asignar un agente con `autoReplyEnabled=false` no cambia el setting en base de datos.
- [ ] Agente asignado con `autoReplyEnabled=false` recibe/almacena inbound pero no llama al LLM ni a Evolution para responder.
- [ ] `AGENT_AUTOREPLY_ENABLED=false` recibe/almacena inbound pero no llama al LLM ni a Evolution para responder.
- [ ] `AGENT_AUTOREPLY_ENABLED=true` + `autoReplyEnabled=true` permite respuesta en modo mock si los demás gates pasan.
- [ ] `REAL_SENDING_ENABLED=true` + `AGENT_REAL_REPLY_ENABLED=false` no llama al LLM ni envía respuesta real.
- [ ] Con los tres gates habilitados (`AGENT_AUTOREPLY_ENABLED`, setting por agente, `AGENT_REAL_REPLY_ENABLED`) el flujo puede avanzar en un entorno real controlado.
- [ ] Agente inactivo no responde aunque el setting y switches estén habilitados.
- [ ] Agente sin versión activa no responde.
- [ ] Endpoint de activación devuelve 400 al enviar `enabled=true` sin `confirmed=true`.
- [ ] Endpoint de activación devuelve 409 para agente DRAFT/INACTIVE.
- [ ] Endpoint de activación no puede modificar un agente de otro workspace.
- [ ] Deshabilitar auto-reply persiste `false` y genera auditoría.
- [ ] Activar auto-reply persiste `true` y genera auditoría con actor correcto.
- [ ] Desasignar un agente no habilita ni altera accidentalmente el setting.
- [ ] Opt-out sigue registrándose aunque `AGENT_AUTOREPLY_ENABLED=false`.
- [ ] Contacto bloqueado no recibe respuesta de agente.
- [ ] Quiet hours impiden respuesta automática.
- [ ] Rate limit impide respuestas demasiado frecuentes.
- [ ] Circuit breaker del LLM sigue bloqueando después de los nuevos gates.

### Pruebas UI pendientes

- [ ] El control muestra correctamente habilitado/deshabilitado al cargar.
- [ ] El botón para habilitar está desactivado si el agente no está ACTIVE.
- [ ] Activar muestra confirmación explícita antes del request.
- [ ] Cancelar la confirmación no realiza request.
- [ ] Deshabilitar no requiere confirmación y persiste inmediatamente.
- [ ] El mensaje de estado explica que los switches globales son independientes.
- [ ] Control usable en móvil y desktop.
- [ ] Navegación por teclado usable.

### Handoff humano — todavía pendiente de desarrollo

- [ ] Definir estado persistente de handoff por conversación.
- [ ] Detectar keywords configuradas para derivación.
- [ ] Bloquear auto-reply mientras el handoff humano esté activo.
- [ ] Añadir acción explícita para reanudar agente.
- [ ] Auditar inicio/fin de handoff.

## Etapa 3 — Idempotencia webhook — pendiente de desarrollo y QA

- [ ] Mismo webhook recibido 2 veces produce una sola acción efectiva.
- [ ] Mismo webhook recibido 10 veces produce una sola acción efectiva.
- [ ] Dos requests concurrentes con el mismo `providerMessageId` no generan dos mensajes inbound.
- [ ] Un duplicado no llama dos veces al LLM.
- [ ] Un duplicado no genera dos replies.
- [ ] Un evento fallido queda trazable y puede reprocesarse sin duplicar efectos ya aplicados.

## Etapa 4 — Worker / concurrencia / recuperación — pendiente de desarrollo y QA

- [ ] Dos starts simultáneos de una campaña no crean doble ejecución efectiva.
- [ ] Dos workers no reclaman el mismo mensaje.
- [ ] Reinicio durante `SENDING` no produce reenvío ciego.
- [ ] Caída de PostgreSQL después de aceptación del proveedor no produce duplicado automático.
- [ ] Timeout de Evolution con resultado incierto entra a un estado de reconciliación y no a retry ciego.
- [ ] Pausa durante procesamiento detiene siguientes mensajes.
- [ ] Stop cancela pendientes sin volver a encolarlos.
- [ ] Reanudar una campaña fallida reprograma únicamente mensajes permitidos.
- [ ] Una campaña con fallos no termina falsamente como `COMPLETED` limpio.
- [ ] Job IDs no crecen con duplicados generados por el scheduler.
- [ ] Límite diario se calcula en la zona horaria correcta del workspace/campaña.

## Etapa 5 — Acceso y roles — pendiente de desarrollo y QA

- [ ] Usuario no invitado no puede registrarse en beta.
- [ ] Usuario `MEMBER` no puede iniciar/detener campañas.
- [ ] Usuario `MEMBER` no puede activar auto-reply.
- [ ] `ADMIN` y `OWNER` solo pueden operar dentro de su workspace.
- [ ] Un usuario suspendido pierde acceso efectivo.
- [ ] Un workspace suspendido no puede enviar ni responder automáticamente.
- [ ] Pruebas cross-tenant para IDs manipulados en URL/body.

## Etapa 6 — Límites / abuso — pendiente de desarrollo y QA

- [ ] Límite de filas por campaña.
- [ ] Límite de tamaño de `rawInput`.
- [ ] Límite de campañas activas.
- [ ] Límite diario de mensajes.
- [ ] Límite de instancias.
- [ ] Límite de agentes.
- [ ] Rate limits en Redis persisten entre réplicas/reinicios.
- [ ] Presupuesto LLM diario/mensual evita sobreconsumo.
- [ ] Protección contra loops bot-bot / self-reply.

## Etapa 7 — Privacidad — pendiente de desarrollo y QA

- [ ] Retención automática de payloads y conversaciones.
- [ ] Purga de contactos extraídos no utilizados.
- [ ] Eliminación/anominización por contacto.
- [ ] Eliminación de workspace.
- [ ] CSV neutraliza celdas que comienzan por `=`, `+`, `-`, `@`.
- [ ] Backups cifrados y con acceso restringido.

## Etapa 8 — Operación y recuperación — pendiente de desarrollo y QA

- [ ] Healthcheck de app.
- [ ] Healthcheck/heartbeat de worker.
- [ ] Redis down genera alerta útil.
- [ ] PostgreSQL down genera alerta útil.
- [ ] Evolution down genera alerta útil.
- [ ] Disco >80/85% genera alerta.
- [ ] Backup automático produce artefacto verificable.
- [ ] Restore de backup en base temporal funciona.
- [ ] Kill switch operacional puede detener envíos rápidamente.

## Etapa 9 — CI

- [x] Workflow CI agregado en `.github/workflows/ci.yml`.
- [x] CI configura PostgreSQL 16 como service container.
- [x] GitHub Actions completa `npm ci`.
- [x] GitHub Actions completa Prisma generate.
- [x] GitHub Actions completa migrations deploy contra PostgreSQL efímero.
- [x] GitHub Actions completa lint.
- [x] GitHub Actions completa tests.
- [x] GitHub Actions completa build.
- [ ] Añadir Redis al CI cuando existan pruebas de integración del worker/webhook que lo requieran.
- [ ] Añadir Docker build como gate de release.
- [ ] Configurar protección de rama para requerir el CI antes de mergear a `main`.

Evidencia más reciente 2026-08-18: workflow run `32199509481`, job `95910096775`, SHA `239662dc2c6d42ebaa6c3beaa9d6b6bedbfcead3`, conclusión `success`.

## Etapa 10 — Beta técnica real — NO EJECUTAR TODAVÍA

Requiere cerrar antes los P0 de etapas 1 a 4.

- [ ] Despliegue ARM64 en Oracle Cloud.
- [ ] Vinculación QR con cuenta de prueba propia.
- [ ] Envío manual controlado.
- [ ] Webhook inbound real.
- [ ] Opt-out real.
- [ ] Reconexión de Evolution.
- [ ] Reinicio de worker durante campaña de prueba.
- [ ] Kill switches con tráfico real de prueba.
- [ ] Observación de varios días sin duplicados ni envíos inesperados.

## Bloqueadores actuales para considerar el producto listo para beta real

1. Las pruebas funcionales/integración de consentimiento de Etapa 1 siguen pendientes, aunque el código compila y la suite automatizada pasa.
2. Las pruebas funcionales/integración de los kill switches y auto-reply de Etapa 2 siguen pendientes, aunque el código compila, los unit tests pasan y el build está verde.
3. Docker/Compose y el build/ejecución ARM64 del host de destino siguen pendientes.
4. Falta la Etapa 3: idempotencia del webhook.
5. Falta la Etapa 4: endurecimiento de concurrencia/recovery del campaign worker.
6. Handoff humano sigue pendiente de implementación dentro del bloque de agentes.

## Cómo actualizar este documento

Al cerrar una prueba:

1. marcar la casilla;
2. añadir debajo una línea `Evidencia:` con comando/log/captura/consulta y fecha;
3. si falla, dejar la casilla abierta y añadir `Fallo:` con una descripción breve y el SHA probado;
4. no borrar pruebas antiguas: moverlas a una sección de regresión si dejan de ser relevantes para la etapa activa.
