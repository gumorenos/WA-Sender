# QA pendiente — WA-Sender

Última actualización: 2026-08-18

Este documento es la fuente de verdad del QA pendiente. Se actualiza en cada etapa y distingue entre implementación, validación automatizada y pruebas que todavía requieren infraestructura, navegador, WhatsApp/Evolution real o escenarios de fallo controlados.

## Regla de cierre

Una prueba solo se marca como completada cuando existe evidencia reproducible: run de CI, salida de comando, consulta SQL, log estructurado o captura. Inspeccionar el código no equivale a probarlo.

## Estado actual

- Base original: `main` en `1147026f7dfabfa514efe2dd7a3fba3c8dac9991`.
- PR #2: Etapa 1 — consentimiento de campañas.
- PR #3: Etapa 2 — auto-reply y kill switches.
- PR #4: Etapa 3 — idempotencia de webhook.
- PR #5: catch-up Etapa 0 — dependencias, Next 16 y baseline de seguridad.
- Rama actual: `agent/stage-00-dependency-hardening`.
- Envío real: mantener `REAL_SENDING_ENABLED=false` hasta cerrar los P0 de Etapas 1–4 y la beta técnica controlada.

## Evidencia automatizada acumulada

- [x] Etapa 1: SHA `d11abbcf3d913e1f544c4462fedb214c8c4f0e20`, run `32198937703`, job `95908484233`: install, Prisma, migraciones, lint, tests y build OK.
- [x] Etapa 2: SHA `239662dc2c6d42ebaa6c3beaa9d6b6bedbfcead3`, run `32199509481`, job `95910096775`: install, Prisma, migraciones, lint, tests y build OK.
- [x] Etapa 3: SHA `c6d0baf80f7c8540b225a348aac573f6576d3024`, run `32200313651`, job `95912529497`: migración 0006, lint, unit/integration tests concurrentes y build OK.
- [x] Baseline de seguridad tras pin de dependencias: run `32201500639`, job `95916115422`: `npm ci`, `npm audit`, Prisma Client 6.12.0, migraciones 0001–0006, lint, 47 tests y Next 16.3.1 build OK.
- [x] En ese baseline final `npm audit --audit-level=moderate` reportó `found 0 vulnerabilities`.
- [ ] CI permanente y de solo lectura con audit estricto: run iniciado después de retirar el mecanismo temporal de auto-commit; registrar aquí el run final cuando termine verde.

## Etapa 0 — baseline, dependencias y plataforma

### Seguridad de dependencias — implementación

Historial del hardening:

1. baseline inicial: 12 vulnerabilidades — 1 moderate, 10 high y 1 critical;
2. el critical correspondía a `next-auth <=4.24.14`;
3. `npm audit fix --package-lock-only` sin `--force` redujo el baseline;
4. Next/React/eslint-config se actualizaron a Next 16.3.1 / React 19.2;
5. Prisma y `@prisma/client` se fijaron en 6.12.0 para evitar la cadena vulnerable `@prisma/config -> deepmerge-ts` sin introducir todavía la migración mayor a Prisma 7;
6. resultado validado: 0 vulnerabilidades en npm audit.

- [x] `next-auth` mínimo elevado a `^4.24.15`.
- [x] Next elevado a `^16.3.1`.
- [x] React / React DOM elevados a `^19.2.0`.
- [x] `eslint-config-next` elevado a `^16.3.1`.
- [x] Prisma y `@prisma/client` fijados exactamente en `6.12.0`.
- [x] Lockfile regenerado y validado desde cero.
- [x] `npm audit --audit-level=moderate` pasa con 0 vulnerabilidades en el baseline de seguridad.
- [x] CI permanente vuelve a `permissions: contents: read` y ya no modifica ramas/lockfiles.
- [x] `npm audit --audit-level=moderate` configurado como gate estricto del CI permanente.
- [x] `tsconfig.json` fija `jsx: react-jsx` para evitar que Next 16 modifique el workspace durante build.
- [x] Config de Vitest movida a `vitest.config.mts` para declarar ESM explícitamente.

### Regresión funcional pendiente por upgrades

- [ ] Login Google OAuth completo: iniciar sesión, callback y creación/recuperación de sesión.
- [ ] Usuario no autenticado en ruta protegida es redirigido correctamente.
- [ ] Sesión persiste después de refresh/navegación.
- [ ] Logout invalida la sesión y vuelve a impedir acceso a rutas protegidas.
- [ ] Callback/auth funciona detrás del host HTTPS/Caddy previsto para producción.
- [ ] Crear/leer/editar datos principales con Prisma 6.12.0 sobre una base no vacía.
- [ ] Aplicar migraciones 0001–0006 sobre copia/backup de una base existente, no solo PostgreSQL vacío de CI.
- [ ] Confirmar funcionamiento del contenedor/servicio de migraciones en Docker con Prisma 6.12.0.
- [ ] Smoke de todas las páginas principales tras Next 16: dashboard, campañas, instancias, extracción, agentes, playground y ops.
- [ ] Revisar consola del navegador por errores/hydration warnings con React 19.2.

### Deuda técnica introducida/visible por Next 16

- [ ] Migrar `middleware.ts` al convenio `proxy` de Next 16 y repetir OAuth/redirecciones.
- [ ] Refactorizar los patrones `setState` desde effects detectados por `react-hooks/set-state-in-effect` en los 7 componentes afectados.
- [ ] Volver a habilitar `react-hooks/set-state-in-effect` después de esos refactors.
- [ ] Actualizar versiones de `actions/checkout` / `actions/setup-node` cuando corresponda para eliminar warnings del runtime de Actions sin cambiar el Node de la aplicación inadvertidamente.
- [ ] Evaluar migración deliberada Prisma 6 -> Prisma 7 en una etapa futura separada; no mezclarla con el hardening actual.

### Docker / host / ARM64 pendiente

- [ ] `docker compose config` con configuración local.
- [ ] `docker compose --env-file .env.production.example config` con compose de producción.
- [ ] Docker build de la app desde el SHA candidato.
- [ ] Docker build/ejecución ARM64.
- [ ] Registrar `docker --version`, `docker compose version` y `uname -m` del host Oracle.
- [ ] Levantar Postgres app + Redis + app + worker + Evolution en entorno de prueba.
- [ ] Verificar healthchecks y orden de arranque.
- [ ] Reiniciar stack completo y confirmar recuperación.
- [ ] Confirmar que solo Caddy expone puertos públicos esperados.

## Etapa 1 — consentimiento de campañas

### Implementación automatizada/compilada

- [x] UI exige checkbox explícito de consentimiento.
- [x] UI exige fuente y referencia.
- [x] Backend exige `consentAttested=true` aunque se manipule el cliente.
- [x] Backend registra actor, fecha, fuente, referencia y cantidad promovida.
- [x] `UNKNOWN` / `NOT_REQUIRED_FOR_MOCK` pendientes o fallidos se promueven dentro de la transacción al iniciar una campaña atestiguada.
- [x] `EXPLICITLY_DENIED` no se promueve.
- [x] Worker bloquea estados no autorizados antes de Evolution.
- [x] Unit tests del schema de atestación pasan.

### API / persistencia pendiente

- [ ] Start sin `consentAttested` -> 400.
- [ ] Start con `consentAttested=false` -> 400.
- [ ] Start sin fuente / fuente inválida -> 400.
- [ ] Start sin referencia, <3 o >240 caracteres -> 400.
- [ ] Start válido sigue respetando delay mínimo del plan.
- [ ] Start rechaza instancia inactiva o de otro workspace.
- [ ] Start rechaza campaña sin mensajes pendientes.
- [ ] Preparar campaña con `UNKNOWN`, `NOT_REQUIRED_FOR_MOCK`, `EXPLICITLY_GRANTED`, `EXPLICITLY_DENIED` y validar transiciones con SQL.
- [ ] Confirmar que otra campaña y otro workspace no son modificados.
- [ ] Confirmar `optInStatus=CONFIRMED` en los mensajes promovidos.
- [ ] Confirmar `campaign.consentConfirmedAt`.
- [ ] Confirmar evento `CAMPAIGN_CONSENT_ATTESTED` con actor/fuente/referencia/count.
- [ ] Confirmar evento `CAMPAIGN_STARTED`.
- [ ] Confirmar `AuditLog.metadata.consent`.
- [ ] Forzar fallo dentro de la transacción y confirmar rollback integral.

### Worker / UI pendiente — P0

- [ ] `EXPLICITLY_DENIED` nunca llama a Evolution y termina `SKIPPED`.
- [ ] `UNKNOWN` nunca llama a Evolution y termina `SKIPPED/CONSENT_UNCONFIRMED`.
- [ ] `NOT_REQUIRED_FOR_MOCK` no envía con `REAL_SENDING_ENABLED=true`.
- [ ] `NOT_REQUIRED_FOR_MOCK` solo funciona en mock.
- [ ] `EXPLICITLY_GRANTED` avanza si todos los demás gates pasan.
- [ ] Campaña legacy ya `RUNNING` con `UNKNOWN` queda bloqueada tras desplegar el hardening.
- [ ] Eventos y contadores quedan consistentes al saltar mensajes.
- [ ] Botón start deshabilitado hasta checkbox + fuente + referencia + instancia.
- [ ] Cambiar campaña limpia la atestación anterior.
- [ ] Start exitoso limpia los campos de atestación.
- [ ] UI mobile/desktop y navegación por teclado.

## Etapa 2 — agentes, auto-reply y kill switches

### Implementación automatizada/compilada

- [x] Asignar agente no cambia `autoReplyEnabled`.
- [x] `autoReplyEnabled` default false.
- [x] Webhook exige `AGENT_AUTOREPLY_ENABLED=true`.
- [x] Webhook exige setting por agente `autoReplyEnabled=true`.
- [x] En real, exige además `AGENT_REAL_REPLY_ENABLED=true`.
- [x] Ambos switches globales se documentan con default false.
- [x] Endpoint explícito `PATCH /api/agents/[id]/auto-reply`.
- [x] Activación exige `confirmed=true`, agente ACTIVE y versión activa.
- [x] AuditLog registra activación/desactivación.
- [x] UI separada para activar/desactivar auto-reply.
- [x] Unit tests de gates/confirmación pasan.

### Funcional/integración pendiente — P0

- [ ] Asignar agente con auto-reply false no cambia setting en DB.
- [ ] Inbound se almacena pero no llama LLM/Evolution si auto-reply por agente está false.
- [ ] Inbound se almacena pero no responde si `AGENT_AUTOREPLY_ENABLED=false`.
- [ ] Global on + setting on permite reply en mock si demás gates pasan.
- [ ] `REAL_SENDING_ENABLED=true` + `AGENT_REAL_REPLY_ENABLED=false` bloquea LLM/reply real.
- [ ] Los tres gates habilitados permiten flujo real solo en prueba controlada.
- [ ] Agente INACTIVE no responde.
- [ ] Agente sin versión activa no responde.
- [ ] Activar sin `confirmed=true` -> 400.
- [ ] Activar DRAFT/INACTIVE -> 409.
- [ ] Cross-workspace no puede modificar agente ajeno.
- [ ] Activar/desactivar persiste estado y actor correcto en auditoría.
- [ ] Desasignar no altera auto-reply.
- [ ] Opt-out sigue registrándose con kill switch global apagado.
- [ ] Contacto bloqueado no recibe respuesta.
- [ ] Quiet hours bloquean reply.
- [ ] Rate limit sigue funcionando.
- [ ] Circuit breaker LLM sigue funcionando.
- [ ] UI refleja estado, confirmación, cancelación, mobile/desktop y teclado.

### Handoff humano — pendiente de desarrollo

- [ ] Estado persistente de handoff por conversación.
- [ ] Keywords de derivación.
- [ ] Bloquear auto-reply mientras handoff está activo.
- [ ] Acción explícita para reanudar agente.
- [ ] Auditar inicio/fin de handoff.

## Etapa 3 — idempotencia de webhook

### Automatizado y probado

- [x] Ledger `WebhookEvent` + migración 0006.
- [x] UNIQUE por provider + instance + providerEventId.
- [x] providerMessageId como identidad; hash SHA-256 canónico como fallback.
- [x] Claim ocurre antes de inbound/opt-out/LLM/reply.
- [x] Duplicado devuelve `ignored_duplicate_webhook` y aumenta contador.
- [x] Evento ganador queda `PROCESSED`; error inesperado capturable queda `FAILED`.
- [x] Handler real + PostgreSQL: duplicado secuencial -> un inbound.
- [x] Handler real + PostgreSQL: dos entregas concurrentes -> un solo claimant.
- [x] Misma identidad puede existir en dos instancias distintas.

Evidencia: run `32200313651`, job `95912529497`.

### Pendiente

- [ ] 10 entregas iguales -> una acción efectiva y `duplicateCount=9`.
- [ ] Concurrencia >2 requests simultáneos.
- [ ] Con agente activo, duplicado no llama dos veces al LLM.
- [ ] Con reply mock, duplicado no genera dos outbound.
- [ ] Opt-out duplicado produce una sola confirmación efectiva.
- [ ] Fallback hash probado end-to-end sin providerMessageId.
- [ ] Evolution real reentregando webhook duplicado.
- [ ] Detectar `PROCESSING` stale tras crash.
- [ ] Procedimiento seguro para revisar/reprocesar `FAILED`/stale sin duplicar efectos parciales.
- [ ] Vista/consulta operativa del ledger.

## Etapa 4 — worker, concurrencia y recovery — siguiente desarrollo

- [ ] Sustituir job IDs con `Date.now()` por identidad estable.
- [ ] Evitar que scheduler reencole duplicados activos cada 15 s.
- [ ] Claim atómico de `PENDING -> SENDING`; dos workers no pueden obtener el mismo mensaje.
- [ ] Separar resultado incierto del proveedor de un fallo seguro para retry.
- [ ] Añadir estado/flujo `UNKNOWN_PROVIDER_RESULT` o equivalente.
- [ ] Nunca devolver a `PENDING` automáticamente tras timeout/resultado ambiguo.
- [ ] Detectar `SENDING` stale tras restart y enviarlo a reconciliación, no resend ciego.
- [ ] Reintentar FAILED solo mediante transición explícita a PENDING.
- [ ] Corregir resume/start de campaña FAILED para que mensajes fallidos elegibles realmente se reprocesen.
- [ ] No marcar campaña limpia como COMPLETED si quedan FAILED/UNKNOWN.
- [ ] Corregir límite diario para usar timezone de campaña/workspace, no medianoche local del proceso.
- [ ] Redis como service de CI para pruebas del worker.
- [ ] Dos workers concurrentes: un solo send efectivo.
- [ ] Dos starts simultáneos: una sola ejecución efectiva.
- [ ] Provider timeout: no retry ciego.
- [ ] DB falla después de aceptación del proveedor: no duplicar automáticamente.
- [ ] Pause/stop durante procesamiento.
- [ ] Restart durante `SENDING`.
- [ ] Recovery de job/worker tras Redis restart.
- [ ] Contadores finales consistentes con SENT/FAILED/SKIPPED/UNKNOWN.

## Etapa 5 — beta cerrada, autenticación y roles

- [ ] Allowlist/invitaciones para impedir signup abierto en beta.
- [ ] Usuario no invitado no puede crear workspace automáticamente.
- [ ] OWNER/ADMIN/MEMBER aplicados a endpoints de mutación.
- [ ] MEMBER no puede start/stop campañas.
- [ ] MEMBER no puede activar auto-reply.
- [ ] Cross-tenant tests manipulando IDs de URL/body.
- [ ] Usuario suspendido pierde acceso/sesiones.
- [ ] Workspace suspendido no puede enviar ni responder.

## Etapa 6 — límites, abuso y costos

- [ ] Límite de filas por campaña.
- [ ] Límite de tamaño de `rawInput`.
- [ ] Límite de campañas activas/día.
- [ ] Límites de instancias y agentes.
- [ ] Daily message limit correcto y timezone-aware.
- [ ] Rate limit compartido en Redis, no Map local.
- [ ] Presupuesto LLM diario/mensual.
- [ ] Registro de tokens/costo por workspace/agente.
- [ ] Protección anti-loop self/bot-to-bot.

## Etapa 7 — privacidad y retención

- [ ] Política/cron de retención de payloads, logs y conversaciones.
- [ ] Purga de contactos extraídos no usados.
- [ ] Eliminación/anominización por contacto.
- [ ] Eliminación de workspace.
- [ ] CSV injection: neutralizar `=`, `+`, `-`, `@`.
- [ ] Backups cifrados y acceso restringido.
- [ ] Revisar exposición/logging de teléfonos y contenido sensible.

## Etapa 8 — operación, observabilidad y recuperación

- [ ] Healthcheck app.
- [ ] Heartbeat/health del worker.
- [ ] Alertas Redis/Postgres/Evolution down.
- [ ] Alerta de disco >80/85%.
- [ ] Backup automático verificable fuera del VPS.
- [ ] Restore real en DB temporal.
- [ ] Kill switch operacional probado.
- [ ] Runbooks de incidente, rollback, rotación de secretos y restore.

## Etapa 9 — CI/release

- [x] PostgreSQL 16 service en CI.
- [x] `npm ci`.
- [x] `npm audit --audit-level=moderate` configurado como gate estricto.
- [x] Prisma generate + migrate deploy.
- [x] lint.
- [x] unit/integration tests actuales.
- [x] build.
- [ ] Confirmar run verde del workflow permanente después de retirar permisos de escritura/auto-commit.
- [ ] Añadir Redis al CI con Etapa 4.
- [ ] Añadir Docker build como gate de release.
- [ ] Añadir validación de compose.
- [ ] Branch protection requiere CI antes de merge a main.
- [ ] Release checklist con backup previo y rollback.

## Etapa 10 — beta técnica real — NO EJECUTAR TODAVÍA

Requiere cerrar Etapa 4 y revisar los pendientes P0 de Etapas 1–3.

- [ ] Deploy ARM64 Oracle Cloud.
- [ ] QR con número propio de prueba.
- [ ] Envío manual controlado.
- [ ] Campaña pequeña con números propios.
- [ ] Webhook inbound real.
- [ ] Opt-out real.
- [ ] Duplicado/retry real de Evolution.
- [ ] Agent mock con kill switches.
- [ ] LLM real con presupuesto mínimo y número propio.
- [ ] Reinicio de worker durante campaña.
- [ ] Reinicio de Evolution y reconexión.
- [ ] Kill switches con tráfico de prueba.
- [ ] Backup + restore.
- [ ] Observación de varios días sin duplicados ni envíos inesperados.

## Bloqueadores actuales para beta real

1. Etapa 4 — worker/concurrencia/recovery todavía no implementada.
2. Docker/Compose/ARM64 todavía no validados.
3. QA funcional P0 de consentimiento y kill switches todavía pendiente.
4. Idempotencia está probada en PostgreSQL/CI, pero faltan Evolution real y recuperación de eventos stale/failed.
5. OAuth/redirecciones necesitan smoke real después de Next 16/NextAuth 4.24.15.
6. Prisma 6.12.0 tiene CI/migraciones verdes, pero falta regresión sobre una base no vacía/backup real.
7. Handoff humano sigue pendiente.

## Cómo mantener este documento

Al cerrar una prueba:

1. marcar la casilla;
2. añadir `Evidencia:` con fecha, SHA y run/log/consulta;
3. si falla, dejar abierta la casilla y añadir `Fallo:` con SHA y descripción;
4. no borrar pruebas antiguas: moverlas a regresión cuando dejen de pertenecer a la etapa activa.
