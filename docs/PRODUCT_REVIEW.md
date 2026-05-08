# WA Sender - Product Review Pre-Beta

Fecha: 2026-05-08

## Fuentes revisadas

- `docs/PROJECT_BRIEF.md`
- `docs/DEPLOYMENT_PLAN.md`
- `docs/SECURITY_NOTES.md`
- `docs/BACKUP_RESTORE.md`
- `docs/OBSERVABILITY.md`

Informacion faltante:

- `docs/BACKLOG.md` no existe. La revision usa el brief y la documentacion operativa como fuente principal.

## Veredicto ejecutivo

WA Sender esta en estado demostrable para una demo controlada con datos mock y proveedores mock. No esta listo para venderse como SaaS ni para una beta publica.

Recomendacion:

- Demo interna/controlada: si, usando `EVOLUTION_MOCK=true` y `LLM_PROVIDER=mock`.
- Beta privada con 1 o 2 clientes de confianza: condicional, solo despues de validar despliegue real, Evolution real, backups restaurables, limites de plan, consentimiento explicito y pruebas de aislamiento multiusuario.
- SaaS comercial: no-go por ahora.

Bloqueantes antes de beta privada:

1. Validar despliegue en Oracle Cloud ARM64 con Docker Compose, Caddy, HTTPS, OAuth y webhooks.
2. Probar Evolution API real en ARM64: crear instancia, QR, estado, envio, extraccion y webhook.
3. Ejecutar una prueba real de restore desde backup.
4. Implementar y verificar limites de plan en endpoints criticos.
5. Endurecer consentimiento: opt-in explicito, opt-out persistente y suppression list visible.
6. Agregar pruebas de aislamiento cross-tenant para endpoints por ID.
7. Configurar alertas reales en Uptime Kuma o alternativa equivalente.
8. Preparar terminos, privacidad, reglas anti-spam y onboarding beta.

## Checklist Go/No-Go

| Area | Demo controlada | Beta privada | SaaS comercial | Observacion |
|---|---:|---:|---:|---|
| Login Google | Go | Condicional | No-Go | Requiere OAuth real, dominio final y pruebas de sesion expirada. |
| Dashboard y layout | Go | Go | Condicional | Listo para demo; faltan metricas reales de negocio. |
| Instancias WhatsApp mock | Go | Go | No-Go | Correcto para demo tecnica. |
| Evolution API real | Condicional | No-Go | No-Go | Falta smoke test completo en Oracle ARM64 y manejo probado de fallos. |
| Campanas: crear y estado | Go | Condicional | No-Go | Falta validacion mas fuerte de duplicados, cuotas y edge cases grandes. |
| Campanas: envio worker | Condicional | No-Go | No-Go | Riesgo alto sin pruebas de idempotencia, reinicio y limites reales. |
| Vista previa de mensaje | Go | Go | Condicional | Buen modulo demo; falta validacion con casos extremos de formato. |
| Agentes: crear/listar/editar | Go | Condicional | No-Go | Falta gobierno de versiones, permisos avanzados y QA de prompts. |
| Playground IA mock | Go | Go | Condicional | OK para demo; proveedores reales requieren monitoreo de costo y fallos. |
| Agente conectado por webhook | Condicional | No-Go | No-Go | Alto riesgo operativo; debe salir apagado por defecto. |
| Extraer numeros | Condicional | No-Go | No-Go | Sensible por privacidad; requiere consentimiento y politica clara. |
| Backups | Condicional | Condicional | No-Go | Documentados, pero falta restore probado y copia externa. |
| Observabilidad | Condicional | Condicional | No-Go | Healthchecks existen; faltan alertas configuradas y metricas historicas. |
| Seguridad base | Condicional | Condicional | No-Go | Hay controles, pero faltan tests cross-tenant y rate limit distribuido. |
| Documentacion operativa | Condicional | Condicional | No-Go | Falta backlog, runbook, QA plan y documentos legales. |

## Funciones listas para demo

1. Shell visual, navegacion y pantallas principales.
2. Login con Google, si las variables OAuth estan configuradas.
3. Dashboard con datos operativos basicos.
4. Instancias WhatsApp con modo mock: creacion, QR, estado y lista.
5. Crear campana desde texto pegado de Excel o Sheets.
6. Ver estado de campana y mensajes.
7. Vista previa de mensaje tipo WhatsApp.
8. Programar/envio de campana en entorno controlado con mock.
9. Crear agentes manuales y con builder deterministico.
10. Listar, editar y versionar agentes.
11. Playground IA con provider mock.
12. Extraer numeros en flujo controlado/mock y exportar.
13. Documentacion base de despliegue, seguridad, backups y observabilidad.

## Funciones inseguras o incompletas

1. Envio real masivo por Evolution API no debe habilitarse sin limites estrictos, consentimiento y monitoreo.
2. Agente IA respondiendo automaticamente por webhook debe estar desactivado por defecto en beta.
3. Extraccion real de contactos/chats es sensible y requiere consentimiento, politica de privacidad y auditoria revisada.
4. Rate limiting actual es suficiente para beta de una sola replica, pero no para escalado horizontal.
5. No hay RLS porque la decision fue self-hosted con Prisma y validaciones por workspace; esto exige tests de ownership mas fuertes.
6. No hay billing, portal de clientes, roles, soporte, ni administracion de tenants.
7. No hay prueba documentada de restore en servidor real.
8. No hay validacion local de Docker en esta maquina porque Docker no esta disponible en el entorno actual.
9. Las alertas no estan configuradas automaticamente; Uptime Kuma queda como servicio opcional.
10. El cumplimiento legal y de privacidad esta incompleto para venta comercial.

## Dependencias de Evolution API

Evolution API impacta directamente:

1. Creacion y eliminacion de instancias.
2. Obtencion de QR y estado de conexion.
3. Envio de mensajes de campana.
4. Extraccion de contactos y chats.
5. Recepcion de webhooks de mensajes entrantes.
6. Respuesta automatica del agente IA.
7. Salud operativa de WhatsApp y sesiones.
8. Persistencia de sesiones y base de datos propia de Evolution.

Riesgo: si Evolution cambia endpoints, payloads o imagen Docker, los modulos de instancias, campanas, extraccion y agente conectado pueden fallar juntos.

## Riesgos si WhatsApp cambia algo

1. QR/Baileys puede dejar de funcionar o requerir actualizacion urgente.
2. Sesiones pueden invalidarse con mas frecuencia.
3. Envio de mensajes puede fallar por cambios en WhatsApp Web.
4. Extraccion de contactos/chats es especialmente fragil.
5. Payloads de webhook pueden cambiar y romper opt-out o enrutamiento a agentes.
6. Limites anti-abuso pueden endurecerse y causar bloqueos.
7. Numeros usados para envio pueden ser restringidos si el producto se usa fuera de consentimiento.

Mitigacion minima:

- Mantener modo mock.
- Versionar el cliente Evolution.
- Encapsular WhatsApp detras de un provider adapter.
- Agregar pruebas contractuales con payloads reales.
- Tener boton de apagado por instancia/campana/agente.

## Falta para WhatsApp Cloud API oficial

1. Implementar un `WhatsAppProvider` real con capacidades por proveedor.
2. Modelar proveedor por instancia: `evolution` o `cloud_api`.
3. Soportar WABA, `phone_number_id`, `business_account_id` y tokens Meta.
4. Validar webhooks con firma oficial de Meta.
5. Gestionar templates aprobados y estados de aprobacion.
6. Respetar ventanas de conversacion y tipos de mensaje permitidos.
7. Registrar costos por conversacion y categoria.
8. Soportar status webhooks oficiales: sent, delivered, read, failed.
9. Diseñar migracion de una instancia QR a una instancia Cloud API sin mezclar sesiones.
10. Agregar UI de templates, consentimiento y opt-in verificable.

## Falta para venderlo como SaaS

1. Billing y suscripciones reales.
2. Limites de plan aplicados server-side en todos los endpoints criticos.
3. Admin panel para usuarios, workspaces, planes, suspensiones y auditoria.
4. Terminos de servicio, politica de privacidad y politica anti-spam.
5. Onboarding guiado y checklist por cliente.
6. Soporte y runbook de incidentes.
7. Monitoreo con alertas verificadas.
8. Backups externos y pruebas periodicas de restore.
9. E2E tests de flujos principales.
10. Pruebas de aislamiento multiusuario.
11. Exportacion y eliminacion de datos de clientes.
12. Politica de retencion para mensajes, logs, audiencias y backups.
13. Estado publico o interno de servicio.
14. Control de abuso: bloqueo de workspace, limites por telefono y revision de volumen.

## Privacidad y consentimiento

Ya existe una direccion correcta: no disenar spam, no usar numeros extraidos automaticamente y manejar `consent_status`. Falta cerrar el circuito operativo.

Pendiente antes de beta privada:

1. Captura explicita de opt-in por contacto o por importacion.
2. Campo de fuente de consentimiento y fecha de consentimiento.
3. UI para suppression list y numeros bloqueados.
4. Opt-out persistente por workspace e instancia.
5. Confirmacion visible antes de usar numeros extraidos en campanas.
6. Retencion maxima de logs de mensajes y audit logs.
7. Politica de eliminacion/exportacion de datos por cliente.
8. Aviso legal en flujos de extraccion y campanas.
9. No guardar contenido sensible en logs tecnicos.
10. Procedimiento para responder solicitudes de eliminacion.

## Limites de plan recomendados

### Demo

- Instancias WhatsApp: 1.
- Agentes: 2.
- Campanas activas: 1.
- Mensajes reales: deshabilitados o maximo 50/dia.
- Delay minimo: 60 segundos.
- Filas por importacion: 100.
- Extracciones: 200 numeros por ejecucion.
- Playground IA: 100 mensajes/dia con mock o limite bajo de costo.

### Beta Basic

- Instancias WhatsApp: 1.
- Agentes: 3.
- Campanas activas: 3.
- Mensajes: 200/dia por workspace.
- Delay minimo: 60 a 90 segundos.
- Limite por hora: 50 a 100 mensajes por instancia.
- Extracciones: 1.000 numeros por mes.
- LLM: cuota diaria por workspace.

### Beta Pro

- Instancias WhatsApp: 3.
- Agentes: 10.
- Campanas activas: 10.
- Mensajes: 1.000/dia por workspace.
- Delay minimo: 45 a 60 segundos.
- Limite por hora: 100 mensajes por instancia.
- LLM: cuota por tokens o costo maximo mensual.

### Limites globales no negociables

- No permitir delay menor a 30 segundos.
- Pausar campana si la tasa de fallos supera un umbral.
- No enviar a `explicitly_denied`.
- No enviar a opt-outs.
- No enviar a grupos por defecto.
- No ejecutar varias campanas simultaneas sobre la misma instancia sin cola controlada.

## Metricas de uso a medir

1. Workspaces activos diarios y semanales.
2. Instancias activas, desconectadas y reconectadas.
3. Campanas creadas, programadas, pausadas, completadas y detenidas.
4. Mensajes pendientes, enviados, fallidos, omitidos y bloqueados por opt-out.
5. Delay real promedio versus delay configurado.
6. Tasa de fallo por instancia y proveedor.
7. Opt-outs por campana y por workspace.
8. Numeros extraidos, exportaciones y fuente de extraccion.
9. Agentes activos, conversaciones, respuestas, errores y handoffs.
10. LLM tokens, latencia, errores y costo estimado.
11. Webhooks recibidos, ignorados y fallidos.
12. Worker lag, cola pendiente y ultimo heartbeat.
13. Uso de cuotas por plan.
14. Backup age, resultado de ultimo backup y uso de disco.
15. Errores 4xx/5xx por endpoint critico.

## Bugs y edge cases probables

1. Acceso cross-tenant cambiando IDs en URLs o requests.
2. Sesion expirada durante polling de QR o envio de formulario.
3. Timezones invalidas o ventanas horarias que cruzan medianoche.
4. Worker reiniciado justo despues de enviar pero antes de marcar `sent`.
5. Doble inicio de la misma campana por clicks repetidos.
6. Pausar o detener campana mientras un mensaje esta en proceso.
7. Redis caido durante schedule o heartbeat.
8. Evolution caido o devolviendo payload inesperado.
9. QR expirado o instancia reconectada con estado viejo en DB.
10. Paste masivo desde Excel con tabs, comas, comillas, emojis y saltos de linea dentro del mensaje.
11. Telefonos duplicados o normalizacion incorrecta por pais.
12. Opt-out con mayusculas, tildes, espacios o texto adicional.
13. Webhook `fromMe`, grupos o mensajes de sistema procesados por error.
14. LLM API key faltante, timeout o respuesta vacia.
15. Costo LLM no limitado por workspace.
16. Logs guardando contenido sensible de clientes.
17. Backups restauran base app pero no sesiones/volumenes Evolution.
18. Imagen Docker de Evolution no compatible con ARM64.
19. Healthcheck profundo expuesto sin token en produccion.
20. Rate limit en memoria se pierde al reiniciar o al escalar replicas.

## Deuda tecnica

1. Falta `docs/BACKLOG.md` como backlog ejecutable vigente.
2. Falta suite E2E para flujos criticos.
3. Falta suite de pruebas de ownership/cross-tenant.
4. Rate limiting no es distribuido.
5. No hay RLS; la seguridad depende de Prisma, workspaceId y helpers.
6. Falta abstraccion completa para WhatsApp Cloud API oficial.
7. Falta persistencia historica de metricas.
8. Falta runbook de incidentes.
9. Falta politica formal de retencion y eliminacion.
10. Falta admin panel operativo.
11. Falta validacion de restore automatizada.
12. Falta control granular de cuotas por plan.
13. Falta documentar compatibilidad ARM64 de cada imagen Docker.

## Documentacion faltante

Prioridad alta:

1. `docs/BACKLOG.md`
2. `docs/RELEASE_CHECKLIST.md`
3. `docs/QA_TEST_PLAN.md`
4. `docs/RUNBOOK.md`
5. `docs/LEGAL_PRIVACY_COMPLIANCE.md`
6. `docs/ABUSE_PREVENTION.md`
7. `docs/DATA_RETENTION.md`
8. `docs/WHATSAPP_CLOUD_API_PLAN.md`

Prioridad media:

1. `docs/METRICS_PLAN.md`
2. `docs/INCIDENT_RESPONSE.md`
3. `docs/PLAN_LIMITS.md`
4. `docs/CUSTOMER_ONBOARDING.md`
5. `docs/EVOLUTION_API_CONTRACT_TESTS.md`

## Mejoras prioritarias

### P0 antes de beta privada

1. Validar despliegue completo en Oracle Cloud.
2. Probar Evolution real en ARM64.
3. Ejecutar restore real de backup.
4. Implementar enforcement de limites de plan.
5. Agregar tests cross-tenant para endpoints con IDs.
6. Configurar alertas reales.
7. Desactivar agente webhook por defecto y requerir activacion explicita.
8. Agregar opt-in explicito y suppression list operativa.

### P1 estabilizacion

1. Idempotencia fuerte del worker.
2. Circuit breaker por instancia, Evolution y LLM.
3. E2E tests de campanas e instancias.
4. Pruebas contractuales de payloads Evolution.
5. Retencion automatica de logs y eventos.
6. UI de cuotas y uso por workspace.
7. Mejor manejo de errores visibles para el usuario.

### P2 producto

1. Billing.
2. Admin panel.
3. Plantillas para WhatsApp Cloud API.
4. Analitica de campanas y agentes.
5. Exportacion/eliminacion de datos de cliente.
6. Status page.

## Plan de estabilizacion de 2 semanas

### Semana 1 - Seguridad, despliegue y operacion

Dia 1:

- Crear `docs/BACKLOG.md` y `docs/RELEASE_CHECKLIST.md`.
- Revisar variables `.env` para mock, beta y produccion.
- Ejecutar lint, tests y build en limpio.

Dia 2:

- Agregar pruebas de ownership/cross-tenant para instancias, campanas, agentes, extraccion y webhooks.
- Revisar endpoints que reciben IDs.
- Confirmar que ningun endpoint acepta `userId` desde frontend.

Dia 3:

- Probar worker con reinicio, doble start, pause/resume/stop y Redis caido.
- Agregar idempotencia o locks donde falte.
- Validar limites conservadores de envio.

Dia 4:

- Desplegar en Oracle Cloud con Caddy y Cloudflare.
- Validar OAuth, HTTPS, healthchecks y webhooks.
- Confirmar compatibilidad ARM64 de imagenes.

Dia 5:

- Probar Evolution real: QR, estado, envio unico, webhook y desconexion.
- Ejecutar backup y restore en base temporal.
- Configurar Uptime Kuma y alertas.

### Semana 2 - Consentimiento, producto y beta controlada

Dia 6:

- Implementar opt-in explicito, suppression list y UI de numeros bloqueados.
- Documentar flujo legal de campanas y extraccion.

Dia 7:

- Implementar limites de plan server-side y mostrar uso en UI.
- Agregar circuit breaker por tasa de fallos.

Dia 8:

- Endurecer agente por webhook: apagado por defecto, horario, rate limit por contacto, fallback humano y logs.
- Probar opt-out en conversaciones reales.

Dia 9:

- Crear QA plan y ejecutar pruebas manuales completas con cuenta demo.
- Probar restauracion despues de una migracion.

Dia 10:

- Preparar onboarding beta, terminos, privacidad y reglas anti-spam.
- Definir criterios de salida de beta: uptime, fallos, opt-outs, quejas y costo LLM.

## Recomendacion final

WA Sender no debe lanzarse como SaaS comercial todavia. El producto si puede mostrarse en demo controlada y avanzar hacia beta privada despues de resolver los bloqueantes P0.

La ruta pragmatica es:

1. Demo con mock para validar UX y flujo de venta.
2. Beta tecnica interna con Evolution real y pocos mensajes manualmente aprobados.
3. Beta privada con 1 o 2 clientes despues de activar limites, consentimiento, backups restaurables y alertas.
4. Solo despues evaluar venta SaaS y migracion gradual a WhatsApp Cloud API oficial.
