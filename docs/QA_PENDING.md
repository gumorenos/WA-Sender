# QA pendiente — WA-Sender

Última actualización: 2026-08-18

Este archivo es la fuente de verdad para todo lo que todavía requiere validación manual, integración, infraestructura real o ejecución de la suite. Debe actualizarse en cada etapa de desarrollo.

## Estado de referencia

- Rama de trabajo: `agent/stage-01-consent-hardening`
- Base: `main` en `1147026f7dfabfa514efe2dd7a3fba3c8dac9991`
- Entorno usado para los cambios: edición remota mediante GitHub; no existe checkout ejecutable con acceso de red en el entorno actual.
- Envío real: debe permanecer deshabilitado hasta cerrar los P0 de consentimiento, auto-reply, idempotencia y worker.

## Regla de cierre

Una casilla solo puede marcarse como completada si existe evidencia reproducible: salida de comando, captura, log estructurado, consulta SQL o resultado de prueba automatizada. No marcar como aprobado por inspección visual del código solamente.

## Etapa 0 — Línea base técnica

### Automatizado pendiente

- [ ] Ejecutar `npm ci` con el lockfile actual.
- [ ] Ejecutar `npm run db:generate`.
- [ ] Ejecutar `npm run lint`.
- [ ] Ejecutar `npm run test`.
- [ ] Ejecutar `npm run build`.
- [ ] Ejecutar `docker compose config` para el compose de desarrollo/local que corresponda.
- [ ] Ejecutar `docker compose --env-file .env.production.example config` para producción.
- [ ] Construir la imagen Docker de la app.
- [ ] Construir/verificar la imagen en ARM64, que es el destino previsto de Oracle Cloud.
- [ ] Confirmar que no se introdujeron vulnerabilidades conocidas con `npm audit --audit-level=moderate` o el gate que se adopte para releases.

### Evidencia a guardar

- [ ] SHA exacto probado.
- [ ] Versiones de Node y npm.
- [ ] Versión de Docker/Compose.
- [ ] Arquitectura (`uname -m`).
- [ ] Resultado completo de lint/test/build.

## Etapa 1 — Consentimiento de campañas

### Cambios que requieren validación

La etapa introduce atestación explícita al iniciar una campaña. El operador debe confirmar consentimiento, seleccionar la fuente y registrar una referencia. El backend registra actor, fecha, fuente, referencia y cantidad de mensajes promovidos; los mensajes `UNKNOWN` o `NOT_REQUIRED_FOR_MOCK` pendientes/fallidos pasan a `EXPLICITLY_GRANTED`. Los `EXPLICITLY_DENIED` no deben modificarse.

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

### Pruebas del worker relacionadas con consentimiento — BLOQUEADOR P0

Estas pruebas no se consideran aprobables hasta que se implemente el endurecimiento del worker que bloquee cualquier estado no autorizado antes de llamar al proveedor.

- [ ] `EXPLICITLY_DENIED` nunca llama a Evolution y queda `SKIPPED`.
- [ ] `UNKNOWN` nunca llama a Evolution.
- [ ] `NOT_REQUIRED_FOR_MOCK` nunca puede enviarse cuando `REAL_SENDING_ENABLED=true`.
- [ ] `EXPLICITLY_GRANTED` puede avanzar al envío cuando el resto de gates también se cumple.
- [ ] Una campaña antigua que ya estaba `RUNNING` con mensajes `UNKNOWN` no puede enviarlos tras desplegar el hardening.
- [ ] Registrar evento específico para cada mensaje bloqueado por consentimiento.
- [ ] Los contadores de campaña quedan consistentes después de saltar mensajes por consentimiento.

## Etapa 2 — Auto-reply / agentes — pendiente de desarrollo y QA

- [ ] Agente asignado con `autoReplyEnabled=false` no responde.
- [ ] Asignar un agente no habilita auto-reply implícitamente.
- [ ] Agente inactivo no responde.
- [ ] Kill switch global de auto-reply apagado impide cualquier respuesta.
- [ ] Kill switch de envío real apagado impide llamadas al proveedor.
- [ ] Quiet hours impiden respuesta automática.
- [ ] Handoff humano activo impide respuesta automática.
- [ ] Opt-out impide respuesta automática.

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

## Etapa 9 — CI — pendiente de desarrollo y QA

- [ ] GitHub Actions ejecuta `npm ci`.
- [ ] GitHub Actions ejecuta Prisma generate.
- [ ] GitHub Actions ejecuta lint.
- [ ] GitHub Actions ejecuta tests.
- [ ] GitHub Actions ejecuta build.
- [ ] Integración con PostgreSQL y Redis en CI.
- [ ] Branch/PR no se considera listo si falla un gate.

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

## Bloqueadores actuales para considerar la rama lista

1. No se ha ejecutado aún lint/test/build sobre estos cambios.
2. El worker todavía necesita el gate P0 que bloquee `UNKNOWN` y `NOT_REQUIRED_FOR_MOCK` en envío real incluso para campañas legacy ya activas.
3. Falta la Etapa 2: `autoReplyEnabled` todavía debe convertirse en un gate efectivo del webhook.
4. Falta idempotencia del webhook.
5. Falta endurecimiento de concurrencia/recovery del campaign worker.

## Cómo actualizar este documento

Al cerrar una prueba:

1. marcar la casilla;
2. añadir debajo una línea `Evidencia:` con comando/log/captura/consulta y fecha;
3. si falla, dejar la casilla abierta y añadir `Fallo:` con una descripción breve y el SHA probado;
4. no borrar pruebas antiguas: moverlas a una sección de regresión si dejan de ser relevantes para la etapa activa.
