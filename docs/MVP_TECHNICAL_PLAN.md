# WA Sender - MVP Technical Plan

## 1. Proposito del documento

Este documento define el plan tecnico funcional para construir el MVP de WA Sender con base en `docs/PROJECT_BRIEF.md`.

No contiene codigo de aplicacion. Su objetivo es dejar persistidas las decisiones de arquitectura, modulos, datos, rutas, workers, seguridad y backlog para que las siguientes fases no dependan de memoria conversacional.

## 2. Decisiones tecnicas base propuestas

Estas decisiones son propuestas para iniciar el MVP. Deben confirmarse antes de programar.

- Despliegue inicial: self-hosted en Oracle Cloud Always Free con Docker Compose.
- Base de datos inicial recomendada: PostgreSQL self-hosted.
- Cola y scheduling: Redis + BullMQ.
- Web app: Next.js App Router + TypeScript + Tailwind CSS.
- Auth recomendada: Auth.js con Google OAuth y sesiones server-side.
- Tenant recomendado: `workspace` desde el modelo de datos, aunque el MVP use 1 usuario por workspace.
- WhatsApp provider inicial: Evolution API mediante adapter `WhatsAppProvider`.
- Compatibilidad futura: adapter adicional para WhatsApp Cloud API oficial.
- LLM providers: adapters por proveedor, con mock obligatorio.
- Reverse proxy recomendado para MVP: Caddy por simplicidad de HTTPS automatico, salvo que se confirme Cloudflare Tunnel.
- Envio de campanas: baja concurrencia, delays obligatorios, limites por plan y confirmacion explicita.

## 3. Arquitectura funcional propuesta

WA Sender debe organizarse como una aplicacion modular con dominio central propio y proveedores externos aislados detras de adapters.

### 3.1 Capas funcionales

Frontend:

- Pantallas de login, dashboard, instancias, campanas, contactos extraidos, agentes y configuracion.
- No accede directamente a Evolution API, proveedores LLM, Redis ni secretos.
- Solo consume rutas internas autenticadas.

Backend web:

- Route handlers o server actions de Next.js.
- Resuelve identidad desde sesion.
- Aplica autorizacion por workspace.
- Aplica limites de plan.
- Crea registros de dominio.
- Encola trabajos en BullMQ.
- Expone endpoints internos para webhooks de proveedores.

Dominio:

- Reglas de negocio independientes del proveedor.
- Estados de instancias, campanas, mensajes, contactos y agentes.
- Validaciones de consentimiento, limites, horarios, opt-in y propiedad.

Adapters:

- `WhatsAppProvider`:
  - Evolution API.
  - Mock.
  - Futuro WhatsApp Cloud API.
- `LLMProvider`:
  - DeepSeek.
  - OpenAI.
  - Gemini.
  - Groq.
  - Mock.

Persistencia:

- PostgreSQL para datos transaccionales.
- Redis para colas, locks y jobs diferidos.

Workers:

- Worker de campanas.
- Scheduler de campanas.
- Worker futuro de webhooks o tareas de sincronizacion.

Operacion:

- Docker Compose.
- Reverse proxy HTTPS.
- Backups PostgreSQL.
- Logs por servicio.
- Healthchecks.

## 4. Diagrama textual de componentes

```text
Usuario
  |
  v
Browser
  |
  v
Next.js App Router
  |-- UI protegida
  |-- Server routes / server actions
  |-- Auth.js Google OAuth
  |-- Validacion de sesion y workspace
  |
  |----> PostgreSQL
  |       |-- usuarios, workspaces, planes
  |       |-- instancias WhatsApp
  |       |-- campanas y mensajes
  |       |-- logs
  |       |-- contactos extraidos
  |       |-- agentes y versiones de prompts
  |
  |----> Redis
  |       |-- campaign queues
  |       |-- delayed jobs
  |       |-- locks por mensaje/campana
  |
  |----> WhatsAppProvider adapter
  |       |-- Evolution API adapter
  |       |-- Mock adapter
  |       |-- Futuro Cloud API adapter
  |
  |----> LLMProvider adapter
  |       |-- DeepSeek
  |       |-- OpenAI
  |       |-- Gemini
  |       |-- Groq
  |       |-- Mock
  |
  v
BullMQ Workers
  |-- campaign-scheduler
  |-- campaign-sender
  |-- campaign-maintenance
  |
  |----> PostgreSQL
  |----> Redis
  |----> WhatsAppProvider adapter

Evolution API
  |-- QR / instance status
  |-- send message
  |-- contacts/chats if available
  |-- webhooks to Next.js internal webhook routes

Reverse Proxy
  |-- HTTPS public app
  |-- Webhook routes
  |-- Optional protected internal services
```

## 5. Estructura recomendada de carpetas

Estructura propuesta para un repositorio Next.js con worker compartiendo dominio y adapters.

```text
.
|-- docs/
|   |-- PROJECT_BRIEF.md
|   |-- MVP_TECHNICAL_PLAN.md
|
|-- app/
|   |-- (auth)/
|   |-- (dashboard)/
|   |-- api/
|   |   |-- auth/
|   |   |-- dashboard/
|   |   |-- instances/
|   |   |-- campaigns/
|   |   |-- contacts/
|   |   |-- agents/
|   |   |-- webhooks/
|   |   |-- health/
|   |-- layout.tsx
|   |-- page.tsx
|
|-- components/
|   |-- ui/
|   |-- dashboard/
|   |-- instances/
|   |-- campaigns/
|   |-- contacts/
|   |-- agents/
|   |-- phone-preview/
|
|-- lib/
|   |-- auth/
|   |-- db/
|   |-- env/
|   |-- validation/
|   |-- security/
|   |-- logging/
|   |-- rate-limit/
|
|-- server/
|   |-- modules/
|   |   |-- users/
|   |   |-- workspaces/
|   |   |-- plans/
|   |   |-- instances/
|   |   |-- campaigns/
|   |   |-- contacts/
|   |   |-- agents/
|   |-- providers/
|   |   |-- whatsapp/
|   |   |   |-- whatsapp-provider.ts
|   |   |   |-- evolution/
|   |   |   |-- cloud-api/
|   |   |   |-- mock/
|   |   |-- llm/
|   |   |   |-- llm-provider.ts
|   |   |   |-- openai/
|   |   |   |-- deepseek/
|   |   |   |-- gemini/
|   |   |   |-- groq/
|   |   |   |-- mock/
|   |-- jobs/
|   |   |-- queues.ts
|   |   |-- campaign-jobs.ts
|   |-- policies/
|   |-- services/
|
|-- workers/
|   |-- campaign-worker.ts
|   |-- scheduler-worker.ts
|   |-- maintenance-worker.ts
|
|-- prisma/ or db/
|   |-- schema
|   |-- migrations/
|   |-- seed/
|
|-- config/
|   |-- plans.ts
|   |-- limits.ts
|
|-- scripts/
|   |-- backup/
|   |-- deploy/
|
|-- docker/
|   |-- caddy/
|   |-- postgres/
|   |-- redis/
|
|-- tests/
|   |-- unit/
|   |-- integration/
|   |-- e2e/
```

Notas:

- `server/modules` contiene reglas de negocio por modulo.
- `server/providers` contiene integraciones externas reemplazables.
- `workers` no debe duplicar logica: debe llamar servicios de `server/modules`.
- `app/api` debe ser una capa fina de transporte HTTP.

## 6. Modelo de datos funcional

El modelo usa `workspaceId` como frontera tenant para facilitar equipos y facturacion futura. En MVP, cada usuario puede tener un workspace personal por defecto.

### 6.1 Identity y tenancy

`users`

- `id`
- `email`
- `name`
- `imageUrl`
- `googleAccountId`
- `status`: active, suspended
- `createdAt`
- `updatedAt`

`workspaces`

- `id`
- `name`
- `ownerUserId`
- `planId`
- `status`: active, suspended
- `createdAt`
- `updatedAt`

`workspace_members`

- `id`
- `workspaceId`
- `userId`
- `role`: owner, admin, member
- `createdAt`

Uso MVP:

- Crear automaticamente un workspace personal al primer login.
- Usar rol `owner`.
- No construir UI multiusuario todavia.

`plans`

- `id`
- `code`: demo, basic, pro
- `name`
- `maxInstances`
- `maxActiveCampaigns`
- `dailyMessageLimit`
- `minDelaySeconds`
- `maxAgents`
- `allowRealSending`
- `createdAt`
- `updatedAt`

### 6.2 Instancias WhatsApp

`whatsapp_instances`

- `id`
- `workspaceId`
- `name`
- `provider`: evolution, cloud_api, mock
- `providerInstanceId`
- `status`: disconnected, connecting, active, error
- `lastQrAt`
- `lastStatusAt`
- `capabilitiesJson`
- `metadataJson`
- `createdAt`
- `updatedAt`

`whatsapp_instance_events`

- `id`
- `workspaceId`
- `instanceId`
- `type`: qr_generated, status_changed, disconnected, provider_error
- `payloadJson`
- `createdAt`

### 6.3 Campanas

`campaigns`

- `id`
- `workspaceId`
- `instanceId`
- `name`
- `status`: draft, scheduled, running, paused, stopped, completed, failed, deleting
- `scheduledStartAt`
- `timezone`
- `activeWindowStart`
- `activeWindowEnd`
- `delaySeconds`
- `totalCount`
- `pendingCount`
- `sentCount`
- `failedCount`
- `requiresConsentConfirmation`
- `consentConfirmedAt`
- `createdByUserId`
- `createdAt`
- `updatedAt`

`campaign_messages`

- `id`
- `workspaceId`
- `campaignId`
- `recipientPhone`
- `recipientDisplayName`
- `messageTemplate`
- `renderedMessage`
- `variablesJson`
- `source`: pasted, extracted_contact, manual
- `optInStatus`: confirmed, unknown, denied, not_required_for_mock
- `status`: pending, queued, sending, sent, failed, skipped, cancelled
- `scheduledFor`
- `sentAt`
- `attemptCount`
- `idempotencyKey`
- `lastErrorCode`
- `lastErrorMessage`
- `providerMessageId`
- `createdAt`
- `updatedAt`

`message_logs`

- `id`
- `workspaceId`
- `campaignId`
- `messageId`
- `eventType`: queued, send_started, send_succeeded, send_failed, skipped, cancelled
- `provider`
- `providerRequestId`
- `providerResponseSummaryJson`
- `errorCode`
- `errorMessage`
- `createdAt`

`campaign_audit_events`

- `id`
- `workspaceId`
- `campaignId`
- `actorUserId`
- `eventType`: created, confirmed, started, paused, resumed, stopped, deleted
- `payloadJson`
- `createdAt`

### 6.4 Contactos extraidos

`extracted_contacts`

- `id`
- `workspaceId`
- `instanceId`
- `phone`
- `displayName`
- `source`: chat, contact, group, unknown
- `sourceReference`
- `optInStatus`: unknown, confirmed, denied
- `extractedAt`
- `createdAt`

`contact_consent_events`

- `id`
- `workspaceId`
- `contactId`
- `actorUserId`
- `eventType`: imported, opt_in_confirmed, opt_out_registered, export_downloaded
- `notes`
- `createdAt`

### 6.5 Agentes IA

`agents`

- `id`
- `workspaceId`
- `name`
- `status`: draft, active, inactive
- `llmProvider`: mock, deepseek, openai, gemini, groq
- `modelName`
- `activePromptVersionId`
- `configJson`
- `createdByUserId`
- `createdAt`
- `updatedAt`

`agent_prompt_versions`

- `id`
- `workspaceId`
- `agentId`
- `versionNumber`
- `builderInputJson`
- `systemPrompt`
- `configJson`
- `createdByUserId`
- `createdAt`

`agent_playground_messages`

- `id`
- `workspaceId`
- `agentId`
- `role`: user, assistant, system
- `content`
- `provider`
- `metadataJson`
- `createdAt`

### 6.6 Operacion

`usage_counters`

- `id`
- `workspaceId`
- `date`
- `sentMessagesCount`
- `failedMessagesCount`
- `createdCampaignsCount`
- `createdInstancesCount`
- `createdAt`
- `updatedAt`

`system_events`

- `id`
- `workspaceId`
- `type`
- `severity`: info, warning, error
- `summary`
- `payloadJson`
- `createdAt`

## 7. Endpoints/API routes necesarios

Todas las rutas privadas deben resolver `user`, `workspace` y permisos desde sesion. Ninguna ruta debe aceptar `userId` desde frontend.

### 7.1 Auth

- `GET /api/auth/*`
  - Rutas internas de Auth.js.

- `GET /api/me`
  - Devuelve usuario actual, workspace activo, rol y plan.

- `POST /api/workspaces/select`
  - Futuro. Cambia workspace activo si el usuario pertenece a varios.

### 7.2 Dashboard

- `GET /api/dashboard/summary`
  - Conteos de instancias activas, agentes, campanas activas y errores recientes.

- `GET /api/dashboard/activity`
  - Actividad reciente consolidada.

### 7.3 Instancias WhatsApp

- `GET /api/instances`
  - Lista instancias del workspace.

- `POST /api/instances`
  - Crea instancia con nombre y provider.
  - Valida limite del plan.

- `GET /api/instances/:id`
  - Detalle de instancia propia del workspace.

- `POST /api/instances/:id/qr`
  - Solicita o refresca QR.

- `GET /api/instances/:id/status`
  - Consulta estado local y opcionalmente refresca desde provider.

- `POST /api/instances/:id/reconnect`
  - Intenta reconectar.

- `POST /api/instances/:id/disconnect`
  - Desconecta instancia.

- `DELETE /api/instances/:id`
  - Elimina o marca como eliminada, si no hay campanas activas.

### 7.4 Campanas

- `GET /api/campaigns`
  - Lista campanas.

- `POST /api/campaigns/parse`
  - Recibe texto pegado de hoja de calculo.
  - Devuelve filas normalizadas, errores y preview.
  - No guarda campana.

- `POST /api/campaigns`
  - Crea campana en estado `draft`.
  - Guarda mensajes.

- `GET /api/campaigns/:id`
  - Detalle y resumen.

- `PATCH /api/campaigns/:id`
  - Edita campana permitida si esta en `draft`, `scheduled` o `paused`.

- `GET /api/campaigns/:id/messages`
  - Lista paginada de mensajes.

- `GET /api/campaigns/:id/logs`
  - Logs de campana.

- `POST /api/campaigns/:id/confirm-consent`
  - Registra confirmacion antes de envio real.

- `POST /api/campaigns/:id/schedule`
  - Programa fecha, horario, zona horaria y delay.

- `POST /api/campaigns/:id/start`
  - Inicia campana si cumple validaciones.

- `POST /api/campaigns/:id/pause`
  - Pausa.

- `POST /api/campaigns/:id/resume`
  - Reanuda.

- `POST /api/campaigns/:id/stop`
  - Detiene y cancela pendientes.

- `DELETE /api/campaigns/:id`
  - Elimina si politica lo permite. Recomendado soft delete inicialmente.

### 7.5 Preview de mensajes

- `POST /api/messages/preview`
  - Renderiza mensaje con formato WhatsApp aproximado y variables de ejemplo.
  - No llama proveedores externos.

### 7.6 Contactos extraidos

- `POST /api/instances/:id/extract-contacts`
  - Solicita extraccion desde provider si la capacidad existe.
  - Registra auditoria.

- `GET /api/contacts/extracted`
  - Lista contactos extraidos.

- `POST /api/contacts/extracted/export`
  - Genera CSV.
  - Registra evento de exportacion.

- `POST /api/contacts/:id/confirm-opt-in`
  - Marca opt-in confirmado con auditoria.

- `POST /api/contacts/:id/opt-out`
  - Marca opt-out.

### 7.7 Agentes IA

- `GET /api/agents`
  - Lista agentes.

- `POST /api/agents`
  - Crea agente manual o desde builder.

- `GET /api/agents/:id`
  - Detalle.

- `PATCH /api/agents/:id`
  - Edita nombre, estado o configuracion.

- `POST /api/agents/:id/prompt-versions`
  - Crea nueva version de prompt.

- `POST /api/agents/:id/activate`
  - Activa agente.

- `POST /api/agents/:id/deactivate`
  - Desactiva agente.

- `POST /api/agents/builder/generate`
  - Genera system prompt y JSON desde los 5 pasos.

- `POST /api/agents/:id/playground`
  - Ejecuta conversacion de prueba con LLMProvider.

### 7.8 Webhooks

- `POST /api/webhooks/evolution`
  - Recibe eventos de Evolution API.
  - Verifica token o firma.
  - Normaliza eventos al dominio.

- `POST /api/webhooks/whatsapp-cloud`
  - Futuro.
  - Debe existir conceptualmente, aunque no se implemente en MVP.

### 7.9 Health y operacion

- `GET /api/health`
  - Estado basico de app.

- `GET /api/health/deep`
  - Estado de DB, Redis y providers. Proteger o limitar exposicion.

## 8. Eventos y webhooks necesarios

### 8.1 Eventos internos de dominio

- `workspace.created`
- `user.logged_in`
- `plan.limit_reached`
- `instance.created`
- `instance.qr_generated`
- `instance.status_changed`
- `instance.disconnected`
- `campaign.created`
- `campaign.consent_confirmed`
- `campaign.scheduled`
- `campaign.started`
- `campaign.paused`
- `campaign.resumed`
- `campaign.stopped`
- `campaign.completed`
- `campaign.failed`
- `message.queued`
- `message.send_started`
- `message.send_succeeded`
- `message.send_failed`
- `contacts.extracted`
- `contacts.exported`
- `contact.opt_in_confirmed`
- `contact.opt_out_registered`
- `agent.created`
- `agent.prompt_version_created`
- `agent.activated`
- `agent.deactivated`
- `agent.playground_message_created`

### 8.2 Webhooks Evolution API

Eventos esperados a normalizar:

- QR actualizado.
- Estado de instancia actualizado.
- Conexion abierta.
- Conexion cerrada.
- Mensaje enviado.
- Fallo de envio.
- Mensaje entrante, solo para registro o uso futuro.

Reglas:

- Los webhooks deben mapear `providerInstanceId` a `whatsapp_instances`.
- Deben validar secreto compartido o firma.
- Deben ignorar eventos de instancias desconocidas.
- Deben registrar payload resumido, no necesariamente payload completo.

### 8.3 Webhooks futuros WhatsApp Cloud API

Eventos conceptuales:

- Verificacion inicial de webhook.
- Estado de mensaje.
- Mensaje entrante.
- Errores de plantilla o conversacion.

La arquitectura debe admitirlos sin cambiar el modelo principal de campanas.

## 9. Worker y scheduler para campanas

### 9.1 Colas

Colas BullMQ recomendadas:

- `campaign-scheduler`
  - Revisa campanas `scheduled` y las pasa a `running` cuando corresponde.

- `campaign-send`
  - Envia mensajes individuales.

- `campaign-maintenance`
  - Recalcula contadores, limpia jobs cancelados, detecta campanas completadas.

### 9.2 Flujo de campana

1. Usuario crea campana en `draft`.
2. Usuario confirma consentimiento si habra envio real.
3. Usuario programa fecha, horario, zona horaria y delay.
4. Campana pasa a `scheduled`.
5. Scheduler detecta que corresponde iniciar.
6. Campana pasa a `running`.
7. Worker selecciona siguiente mensaje `pending`.
8. Worker valida:
   - campana sigue `running`.
   - instancia pertenece al workspace.
   - instancia esta activa.
   - plan permite envio.
   - limite diario no excedido.
   - horario activo vigente.
   - mensaje no fue enviado antes.
   - opt-in o confirmacion requerida cumple politica.
9. Worker marca mensaje `sending`.
10. Worker llama `WhatsAppProvider.sendMessage`.
11. Worker registra resultado y log.
12. Worker programa siguiente mensaje respetando delay.
13. Maintenance marca campana como `completed` cuando no quedan pendientes.

### 9.3 Idempotencia

Cada mensaje debe tener `idempotencyKey`.

Reglas:

- Un mensaje con estado `sent` nunca debe reenviarse automaticamente.
- Un job debe bloquear por `messageId` antes de enviar.
- Si el worker cae despues del envio pero antes de persistir resultado, el sistema debe revisar estado antes de reintentar.
- Los reintentos deben ser limitados y conservadores.

### 9.4 Pausa y stop

Pausa:

- Cambia campana a `paused`.
- No elimina mensajes.
- Jobs que despierten deben detectar pausa y no enviar.

Stop:

- Cambia campana a `stopped`.
- Mensajes pendientes pasan a `cancelled`.
- Jobs activos deben abortar antes de envio si aun no llamaron al provider.

### 9.5 Concurrencia

MVP:

- Concurrencia por instancia: 1.
- Concurrencia global baja.
- Delay minimo obligatorio por plan.

No disenar mecanismos para evadir limites de WhatsApp.

## 10. Seguridad y controles de autorizacion

### 10.1 Identidad

- Google OAuth.
- Sesion segura server-side.
- Usuario actual resuelto en backend.
- Crear workspace por defecto en primer login.

### 10.2 Autorizacion

Cada operacion debe verificar:

- Usuario autenticado.
- Usuario pertenece al workspace.
- Usuario tiene rol suficiente.
- Recurso pertenece al workspace.
- Plan permite la accion.

### 10.3 Reglas anti-tenant-leak

- No aceptar `userId` desde body, query ni params.
- Evitar endpoints como `/api/users/:userId/...` para recursos del usuario actual.
- Todas las consultas sensibles deben incluir `workspaceId`.
- IDs publicos no sustituyen autorizacion.

### 10.4 Secretos

- API keys LLM solo en servidor.
- Token Evolution API solo en servidor.
- Secrets de webhooks solo en servidor.
- No exponer variables sin prefijo publico.
- No guardar secrets en DB sin cifrado si en el futuro son por cliente.

### 10.5 Validacion de entrada

- Validar nombres de instancias y campanas.
- Sanitizar texto pegado desde Excel/Sheets.
- Normalizar telefonos.
- Rechazar mensajes vacios.
- Limitar longitud de mensajes.
- Limitar cantidad de filas por importacion segun plan.
- Validar timezone contra lista permitida.
- Validar delay minimo.

### 10.6 Controles anti-abuso

- Confirmacion explicita antes de inicio.
- Limites diarios por workspace.
- Limites de campanas activas.
- Delay minimo no removible.
- Registro de auditoria.
- Opt-out futuro.
- Suspension manual de workspace.
- Modo demo puede desactivar envio real con `allowRealSending=false`.

### 10.7 Webhooks

- Validar firma, token o secreto compartido.
- Rechazar payloads grandes.
- Registrar eventos desconocidos con severidad baja.
- No confiar en datos de provider para decidir workspace sin mapeo local.

## 11. Variables de entorno necesarias

### 11.1 App

- `NODE_ENV`
- `APP_URL`
- `APP_NAME`
- `APP_ENV`
- `NEXT_PUBLIC_APP_URL`

### 11.2 Base de datos

- `DATABASE_URL`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

### 11.3 Auth

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_TRUST_HOST`

### 11.4 Redis y BullMQ

- `REDIS_URL`
- `BULLMQ_PREFIX`
- `WORKER_CONCURRENCY`

### 11.5 WhatsApp providers

- `WHATSAPP_PROVIDER`
- `EVOLUTION_API_BASE_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_WEBHOOK_SECRET`
- `MOCK_WHATSAPP_ENABLED`

Futuro:

- `WHATSAPP_CLOUD_API_BASE_URL`
- `WHATSAPP_CLOUD_API_TOKEN`
- `WHATSAPP_CLOUD_VERIFY_TOKEN`
- `WHATSAPP_CLOUD_APP_SECRET`

### 11.6 LLM providers

- `LLM_PROVIDER`
- `MOCK_LLM_ENABLED`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GROQ_API_KEY`
- `GROQ_MODEL`

### 11.7 Seguridad y limites

- `DEFAULT_PLAN_CODE`
- `MAX_IMPORT_ROWS_DEMO`
- `MIN_CAMPAIGN_DELAY_SECONDS`
- `DAILY_MESSAGE_LIMIT_DEMO`
- `REAL_SENDING_ENABLED`
- `CONTACT_EXTRACTION_ENABLED`

### 11.8 Operacion

- `LOG_LEVEL`
- `HEALTHCHECK_TOKEN`
- `BACKUP_RETENTION_DAYS`
- `BACKUP_TARGET_PATH`
- `SENTRY_DSN` o alternativa futura

### 11.9 Reverse proxy y dominio

- `DOMAIN`
- `CADDY_EMAIL`
- `CLOUDFLARE_TUNNEL_TOKEN` si se usa tunnel

## 12. Backlog por fases

### 12.1 Fase 1 MVP base

Objetivo:

- Tener app autenticada, tenant seguro, dashboard basico e instancias WhatsApp mock/Evolution.

Entregables:

- Proyecto Next.js con TypeScript y Tailwind.
- Configuracion Docker Compose base.
- PostgreSQL y Redis.
- Auth Google.
- Modelo `users`, `workspaces`, `plans`, `workspace_members`.
- Plan demo seed.
- Middleware o helper de sesion/workspace.
- Dashboard summary.
- Modulo de instancias.
- WhatsAppProvider interface.
- Mock WhatsAppProvider.
- EvolutionProvider inicial para crear instancia, QR y status.
- Healthcheck basico.
- Variables de entorno documentadas.

Criterio de salida:

- Un usuario entra con Google, obtiene workspace demo y puede crear/ver una instancia con QR mock o Evolution.

### 12.2 Fase 2 campanas

Objetivo:

- Crear, validar, programar y ejecutar campanas controladas.

Entregables:

- Modelo de campanas, mensajes, logs y auditoria.
- Parser de datos pegados desde Excel/Sheets.
- Preview de mensajes con variables.
- CRUD de campanas.
- Confirmacion de consentimiento.
- Scheduler BullMQ.
- Worker de envio.
- Estados start, pause, resume, stop.
- Limites por plan.
- Idempotencia por mensaje.
- Logs por mensaje.
- Modo mock de envio.
- Exportacion basica de logs o vista paginada.

Criterio de salida:

- Una campana puede ejecutarse en modo mock o real controlado, con delay, horario, logs y estados correctos.

### 12.3 Fase 3 agentes IA

Objetivo:

- Crear, versionar y probar agentes IA.

Entregables:

- Modelo de agentes y versiones de prompt.
- UI de agente manual.
- Builder de 5 pasos.
- Generacion de system prompt y JSON.
- LLMProvider interface.
- MockLLMProvider.
- Adapter inicial para el provider elegido.
- Playground tipo telefono.
- Activar/desactivar agente.
- Logs minimos de playground.

Criterio de salida:

- Un usuario puede crear un agente manual o guiado, versionarlo y probarlo sin exponer API keys.

### 12.4 Fase 4 hardening/producto

Objetivo:

- Preparar piloto real con controles operativos y de producto.

Entregables:

- Backups PostgreSQL documentados y probados.
- Healthchecks de app, DB, Redis y Evolution.
- Logs estructurados.
- Monitoreo minimo.
- Politicas anti-abuso en UI.
- Export CSV de contactos extraidos.
- Auditoria de contactos y opt-in.
- Rate limits basicos de API.
- Soft delete donde corresponda.
- Mejoras de manejo de errores de provider.
- Preparacion documental para terminos, privacidad y anti-spam.
- Checklist de despliegue self-hosted.

Criterio de salida:

- El sistema puede operar con 1 a 5 clientes piloto con riesgo controlado, backups y monitoreo minimo.

## 13. Riesgos tecnicos

- Evolution API/Baileys puede fallar por cambios de WhatsApp Web.
- Envio real puede causar bloqueos si el usuario no respeta consentimiento o envia volumen agresivo.
- Workers pueden duplicar envios si no se implementa idempotencia estricta.
- Jobs pausados o detenidos pueden ejecutarse si el worker no revalida estado antes de enviar.
- Webhooks pueden llegar duplicados, tarde o fuera de orden.
- Self-hosted PostgreSQL reduce costo, pero aumenta responsabilidad de backups y restauracion.
- VPS unico es punto unico de falla.
- ARM64 puede causar problemas con imagenes Docker no compatibles.
- Contact extraction depende de capacidades reales del provider.
- WhatsApp Cloud API futura no tiene las mismas capacidades que Evolution API.
- Diferencias entre preview de WhatsApp y render real pueden generar expectativas incorrectas.
- LLM providers varian en calidad de JSON, latencia, costo y disponibilidad.

## 14. Decisiones que deben confirmarse antes de programar

1. Base de datos inicial:
   - Recomendada: PostgreSQL self-hosted.
   - Alternativa: Supabase.

2. Libreria de autenticacion:
   - Recomendada: Auth.js con Google OAuth.
   - Alternativas: Supabase Auth o auth propia.

3. Unidad tenant:
   - Recomendada: `workspace` desde el inicio, con workspace personal por usuario en MVP.
   - Alternativa: `userId` directo y migracion posterior.

4. Reverse proxy:
   - Recomendado: Caddy.
   - Alternativas: Nginx o Cloudflare Tunnel.

5. Envio real en demo:
   - Recomendado: demo con envio real desactivado o muy limitado.
   - Confirmar si el piloto inicial permitira envio real.

6. Limites iniciales:
   - Instancias demo.
   - Campanas activas.
   - Filas por importacion.
   - Mensajes diarios.
   - Delay minimo.

7. Proveedor LLM por defecto:
   - Elegir entre DeepSeek, OpenAI, Gemini o Groq.

8. Provider WhatsApp real:
   - Confirmar version exacta de Evolution API y modo de autenticacion.

9. Extraccion de numeros:
   - Confirmar si se habilita en MVP o queda detras de feature flag.

10. Retencion de datos:
   - Definir cuanto tiempo conservar mensajes, logs, contactos extraidos y playground.

11. Politicas legales:
   - Definir terminos de uso, privacidad, anti-spam, opt-in y opt-out antes de clientes reales.

12. Modelo de secrets por cliente:
   - MVP puede usar secrets globales del servidor.
   - Confirmar si algun cliente traera sus propias API keys.

