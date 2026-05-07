# WA Sender - MVP Execution Backlog

## 1. Fuentes revisadas

- `docs/PROJECT_BRIEF.md`: existe y fue usado como fuente funcional principal.
- `docs/FUNCTIONAL_PLAN.md`: no existe. Falta un plan funcional separado; por tanto, las reglas funcionales se derivan de `PROJECT_BRIEF.md`.
- `docs/DEPLOYMENT_PLAN.md`: existe y fue usado como referencia de despliegue, DNS, Cloudflare, Caddy y exposicion de servicios.

Este backlog no incluye codigo. Convierte el contexto actual en tareas ejecutables para construir el MVP.

## 2. Convenciones

Modelos recomendados:

- `gpt-5.3-codex`: implementacion de codigo, refactors y pruebas.
- `gpt-5.4`: tareas mixtas de arquitectura, producto y codigo.
- `gpt-5.4-mini`: tareas simples, documentacion, ajustes pequenos.
- `gpt-5.5`: tareas complejas de seguridad, arquitectura critica o hardening profundo.

Niveles de reasoning:

- `low`: cambios pequenos o mecanicos.
- `medium`: implementacion normal con validaciones.
- `high`: diseno sensible, seguridad, workers, integraciones externas.
- `xhigh`: auditoria critica o decisiones con alto riesgo.

## 3. Backlog en formato tabla

| ID | Nombre | Objetivo | Archivos/carpetas probables | Dependencias previas | Criterio de aceptacion | Riesgos o validaciones | Comando de prueba o verificacion | Modelo | Reasoning |
|---|---|---|---|---|---|---|---|---|---|
| WS-001 | Setup inicial del repo | Crear base Next.js App Router con TypeScript y Tailwind. | `package.json`, `app/`, `components/`, `lib/`, `tsconfig.json`, `tailwind.config.*` | Ninguna | La app inicia en local y muestra una pagina base. | Evitar scaffold que contradiga App Router. | `npm run dev` | `gpt-5.3-codex` | `medium` |
| WS-002 | Tooling de calidad | Agregar lint, format, typecheck y scripts estandar. | `package.json`, `.eslintrc*`, `.prettierrc*`, `tsconfig.json` | WS-001 | Existen scripts `lint`, `typecheck`, `test` o placeholder seguro. | Config incompatible con Next.js/TS. | `npm run lint && npm run typecheck` | `gpt-5.3-codex` | `medium` |
| WS-003 | Documentacion base viva | Normalizar referencias a brief, backlog y decisiones existentes. | `docs/README.md`, `docs/PROJECT_BRIEF.md`, `docs/MVP_EXECUTION_BACKLOG.md` | WS-001 | Un lector sabe que documentos leer antes de implementar. | Duplicar decisiones contradictorias. | `Get-ChildItem docs` | `gpt-5.4-mini` | `low` |
| WS-004 | Decision auth/DB registrada | Confirmar Auth.js + Google OAuth + PostgreSQL self-hosted + `workspaceId`. | `docs/AUTH_DB_DECISION.md`, `docs/PROJECT_BRIEF.md` | WS-003 | La decision esta registrada y no figura como pendiente del MVP. | Reabrir Supabase sin necesidad. | `Select-String -Path docs/*.md -Pattern "Auth.js|workspaceId|PostgreSQL self-hosted"` | `gpt-5.4` | `medium` |
| WS-005 | Variables de entorno base | Crear plantilla de variables sin secretos reales. | `.env.example`, `lib/env/`, `docs/` | WS-004 | `.env.example` cubre app, auth, DB, Redis, Evolution, LLM y backups. | Exponer secretos o usar prefijos publicos incorrectos. | `npm run typecheck` | `gpt-5.3-codex` | `medium` |
| WS-006 | Docker Compose inicial | Definir servicios `web`, `worker`, `postgres`, `redis`, `evolution-api`, `caddy`. | `docker-compose.yml`, `docker/`, `.env.example` | WS-001, WS-005 | `docker compose config` valida y solo Caddy publica 80/443. | Publicar DB, Redis o Evolution por error. | `docker compose config` | `gpt-5.3-codex` | `high` |
| WS-007 | Caddy y despliegue beta | Crear Caddyfile conceptual operativo para `app.midominio.com`. | `docker/caddy/Caddyfile`, `docs/DEPLOYMENT_PLAN.md` | WS-006 | Caddy reverse proxy a `web:3000`; no expone Evolution. | TLS/Cloudflare mal configurado; cachear API. | `docker compose config` | `gpt-5.3-codex` | `medium` |
| WS-008 | Layout principal y UI base | Crear shell visual de la app con navegacion. | `app/(dashboard)/`, `components/layout/`, `components/ui/` | WS-001, WS-002 | Dashboard shell responsive con rutas principales. | UI prematura sin auth guard. | `npm run lint && npm run typecheck` | `gpt-5.3-codex` | `medium` |
| WS-009 | Auth.js Google OAuth | Implementar login Google y sesion server-side. | `app/api/auth/`, `lib/auth/`, `server/modules/users/` | WS-004, WS-005, WS-010 | Usuario puede iniciar sesion y cerrar sesion. | OAuth callback mal configurado; cookies inseguras. | `npm run typecheck` | `gpt-5.3-codex` | `high` |
| WS-010 | ORM y modelo base | Configurar ORM y esquema inicial para auth, users, workspaces, plans. | `prisma/` o `db/`, `server/modules/workspaces/`, `server/modules/plans/` | WS-004, WS-005 | Migracion crea tablas base y plan demo. | Elegir ORM incompatible; tenant mal modelado. | `npx prisma migrate dev` o comando equivalente | `gpt-5.3-codex` | `high` |
| WS-011 | Guardas de sesion y workspace | Crear helpers para resolver usuario, workspace y rol desde backend. | `lib/auth/`, `server/policies/`, `server/modules/workspaces/` | WS-009, WS-010 | Ninguna ruta protegida depende de `userId` del frontend. | Fuga multi-tenant por consultas sin `workspaceId`. | `npm run test && npm run typecheck` | `gpt-5.3-codex` | `high` |
| WS-012 | Migraciones dominio MVP | Agregar tablas de instancias, campanas, mensajes, logs, contactos y agentes. | `prisma/` o `db/migrations/` | WS-010 | Migraciones aplican y todas las tablas de negocio tienen `workspaceId`. | Campos insuficientes para estados e idempotencia. | `npx prisma migrate dev && npm run typecheck` | `gpt-5.3-codex` | `high` |
| WS-013 | Dashboard API | Crear resumen backend: instancias activas, agentes, campanas, actividad. | `app/api/dashboard/`, `server/modules/dashboard/` | WS-011, WS-012 | API devuelve datos solo del workspace actual. | Conteos cruzados entre tenants. | `npm run test` | `gpt-5.3-codex` | `medium` |
| WS-014 | Dashboard UI | Mostrar tarjetas y actividad reciente. | `app/(dashboard)/dashboard/`, `components/dashboard/` | WS-008, WS-013 | UI muestra estados vacios y datos reales/mock. | UI falla con cero registros. | `npm run lint && npm run typecheck` | `gpt-5.3-codex` | `medium` |
| WS-015 | WhatsAppProvider interface | Definir contrato interno para QR, estado, envio, contactos y capacidades. | `server/providers/whatsapp/` | WS-012 | Existe interfaz agnostica a Evolution y Cloud API. | Acoplar dominio a Baileys. | `npm run typecheck` | `gpt-5.3-codex` | `high` |
| WS-016 | Mock WhatsApp provider | Implementar mock para instancia, QR, estado, envio y contactos. | `server/providers/whatsapp/mock/` | WS-015 | Modo mock permite desarrollar sin Evolution real. | Mock demasiado distinto al contrato real. | `npm run test` | `gpt-5.3-codex` | `medium` |
| WS-017 | Modulo de instancias | CRUD de instancias, limites de plan, QR y estado usando provider. | `app/api/instances/`, `app/(dashboard)/instances/`, `server/modules/instances/` | WS-011, WS-012, WS-016 | Usuario crea instancia y ve QR/status mock. | Saltarse limite demo de 1 instancia. | `npm run test && npm run typecheck` | `gpt-5.3-codex` | `high` |
| WS-018 | Evolution API adapter | Integrar Evolution real detras del provider, con env vars y errores normalizados. | `server/providers/whatsapp/evolution/`, `lib/env/` | WS-015, WS-017 | Con env real, crea instancia, obtiene QR y consulta estado. | Imagen/API ARM64, cambios de Evolution, secretos expuestos. | `npm run test` y prueba manual contra Evolution | `gpt-5.3-codex` | `high` |
| WS-019 | Parser de campanas | Parsear pegado Excel/Sheets con 2 columnas: numero y mensaje. | `server/modules/campaigns/parser*`, `app/api/campaigns/parse/` | WS-012 | Parser devuelve filas validas, errores y preview sin guardar. | Numeros mal normalizados; mensajes vacios. | `npm run test` | `gpt-5.3-codex` | `medium` |
| WS-020 | Crear campana | Guardar campana draft y mensajes, con confirmacion de consentimiento pendiente. | `app/api/campaigns/`, `app/(dashboard)/campaigns/`, `server/modules/campaigns/` | WS-011, WS-012, WS-019 | Campana se crea con totales correctos y `workspaceId`. | Insert masivo sin transaccion; datos de otro tenant. | `npm run test && npm run typecheck` | `gpt-5.3-codex` | `high` |
| WS-021 | Estado y acciones de campana | Implementar estados y acciones iniciar, pausar, reanudar, detener, eliminar. | `server/modules/campaigns/`, `app/api/campaigns/:id/*`, `components/campaigns/` | WS-020 | Transiciones invalidas se rechazan; auditoria registrada. | Estados inconsistentes o mensajes pendientes mal cancelados. | `npm run test` | `gpt-5.3-codex` | `high` |
| WS-022 | Vista previa de mensaje | Editor y preview tipo telefono con formato WhatsApp y variables. | `components/phone-preview/`, `app/api/messages/preview/`, `server/modules/messages/` | WS-008, WS-019 | Preview soporta negrita, cursiva, tachado, mono, saltos y variables. | Diferencias con render real de WhatsApp. | `npm run test && npm run lint` | `gpt-5.3-codex` | `medium` |
| WS-023 | BullMQ queues base | Crear colas, conexion Redis, nombres y contratos de jobs. | `server/jobs/`, `workers/`, `lib/redis/` | WS-006, WS-012 | Worker arranca y procesa job dummy/controlado. | Redis publicado o jobs sin namespace. | `npm run typecheck` y `docker compose config` | `gpt-5.3-codex` | `high` |
| WS-024 | Worker de envio de campanas | Enviar mensajes pendientes con delay, horario, limites e idempotencia. | `workers/campaign-worker.*`, `server/modules/campaigns/`, `server/providers/whatsapp/` | WS-016, WS-018, WS-021, WS-023 | Campana mock envia secuencialmente y registra sent/failed. | Duplicados, reintentos agresivos, envio fuera de horario. | `npm run test` y prueba end-to-end mock | `gpt-5.3-codex` | `high` |
| WS-025 | Progreso y logs de campana | Mostrar total, pendientes, enviados, fallidos y logs por mensaje. | `app/api/campaigns/:id/logs/`, `components/campaigns/` | WS-024 | UI refleja progreso y errores recientes. | Consultas pesadas sin paginacion. | `npm run test && npm run typecheck` | `gpt-5.3-codex` | `medium` |
| WS-026 | Builder de agentes | Crear flujo de 5 pasos y generacion de prompt/config JSON. | `app/(dashboard)/agents/`, `components/agents/`, `server/modules/agents/` | WS-012, WS-008 | Builder crea agente draft con prompt generado. | Prompt incompleto; JSON no validado. | `npm run test && npm run lint` | `gpt-5.3-codex` | `medium` |
| WS-027 | Versionado de agentes | Guardar versiones de prompt y version activa. | `server/modules/agents/`, `app/api/agents/:id/prompt-versions/` | WS-026 | Nueva version no destruye versiones anteriores. | Perder historial o activar version equivocada. | `npm run test` | `gpt-5.3-codex` | `medium` |
| WS-028 | LLMProvider adapters | Crear interfaz LLM, mock, y adapter inicial DeepSeek/OpenAI segun env. | `server/providers/llm/`, `lib/env/` | WS-026 | Playground puede usar mock sin exponer API keys. | Keys al frontend; respuestas no deterministicas en tests. | `npm run test && npm run typecheck` | `gpt-5.3-codex` | `high` |
| WS-029 | Playground IA | Chat tipo telefono para probar agentes con LLMProvider. | `app/(dashboard)/agents/[id]/playground/`, `app/api/agents/:id/playground/` | WS-027, WS-028 | Usuario conversa con agente activo o draft en modo mock/real. | Costos LLM, logs con datos sensibles. | `npm run test && npm run lint` | `gpt-5.3-codex` | `medium` |
| WS-030 | Extraer numeros | Extraer contactos/chats via provider, listar, copiar y exportar CSV. | `server/modules/contacts/`, `app/api/contacts/`, `components/contacts/` | WS-015, WS-017, WS-018 | Contactos se guardan con origen y `optInStatus`. | Uso sin consentimiento; provider no soporta endpoint. | `npm run test` | `gpt-5.3-codex` | `high` |
| WS-031 | Webhooks Evolution base | Recibir webhooks de Evolution, validar secreto y registrar eventos. | `app/api/webhooks/evolution/`, `server/modules/webhooks/` | WS-018, WS-012 | Webhook desconocido no rompe; evento valido actualiza instancia/log. | Spoofing, payload grande, evento fuera de orden. | `npm run test` y `curl` local con secreto | `gpt-5.3-codex` | `high` |
| WS-032 | Agente conectado a WhatsApp | Conectar mensajes entrantes por webhook con agente activo y respuesta controlada. | `server/modules/agents/`, `server/modules/webhooks/`, `workers/agent-worker.*` | WS-029, WS-031 | Mensaje entrante en instancia con agente activo genera respuesta mock/real. | Autorespuesta no deseada; costos LLM; loops. | `npm run test` y prueba webhook mock | `gpt-5.3-codex` | `high` |
| WS-033 | Backups beta | Crear plan/script de backup PostgreSQL y sesiones Evolution. | `scripts/backup/`, `docs/DEPLOYMENT_PLAN.md`, `docs/RUNBOOK.md` | WS-006, WS-012, WS-018 | Backup manual se genera y restauracion esta documentada. | Backup no probado; secretos en artefactos. | Comando de backup + restauracion en entorno limpio | `gpt-5.3-codex` | `high` |
| WS-034 | Observabilidad minima | Healthchecks, logs estructurados y monitoreo basico. | `app/api/health/`, `lib/logging/`, `docker-compose.yml`, `docs/RUNBOOK.md` | WS-006, WS-023 | Health app/DB/Redis disponible; logs utiles sin secretos. | Exponer health profundo publicamente. | `curl /api/health` y `docker compose ps` | `gpt-5.3-codex` | `medium` |
| WS-035 | Seguridad y hardening | Revisar auth, tenant, secrets, rate limits, headers y exposicion Docker. | `server/policies/`, `middleware.ts`, `docker-compose.yml`, `docker/caddy/Caddyfile` | WS-011, WS-024, WS-031, WS-034 | Checklist de seguridad pasa sin hallazgos criticos. | Fuga tenant o secretos; endpoints sin auth. | `npm run test && npm run lint && docker compose config` | `gpt-5.5` | `xhigh` |
| WS-036 | Checklist pre-beta | Validar flujo completo antes de clientes reales. | `docs/PRE_BETA_CHECKLIST.md`, `docs/RUNBOOK.md` | WS-001 a WS-035 | Checklist cubre login, instancia, campana mock, backup, logs y seguridad. | Lanzar beta sin restauracion probada o limites. | Ejecucion manual del checklist | `gpt-5.4` | `high` |

## 4. Dependencias entre tareas

Secuencia critica:

```text
WS-001 -> WS-002 -> WS-005 -> WS-006
WS-004 -> WS-010 -> WS-009 -> WS-011
WS-010 -> WS-012 -> WS-013 -> WS-014
WS-012 -> WS-015 -> WS-016 -> WS-017 -> WS-018
WS-012 -> WS-019 -> WS-020 -> WS-021 -> WS-023 -> WS-024 -> WS-025
WS-012 -> WS-026 -> WS-027 -> WS-028 -> WS-029
WS-018 -> WS-030
WS-018 -> WS-031 -> WS-032
WS-006 -> WS-033 -> WS-036
WS-034 -> WS-035 -> WS-036
```

Bloqueos importantes:

- No implementar auth sin modelo `workspaceId` definido.
- No implementar campanas reales antes de mock provider, limites e idempotencia.
- No conectar agentes a WhatsApp antes de playground, webhooks validados y controles anti-loop.
- No operar beta real sin backups, observabilidad y hardening.

## 5. Hitos

### Hito 1 - Base tecnica navegable

Incluye:

- WS-001 a WS-008.

Criterio:

- App Next.js corre localmente, tiene layout base, env template y Compose validable.

### Hito 2 - Auth y tenancy

Incluye:

- WS-009 a WS-012.

Criterio:

- Login Google, usuario, workspace personal, plan demo y guardas backend operativas.

### Hito 3 - Dashboard e instancias WhatsApp

Incluye:

- WS-013 a WS-018.

Criterio:

- Dashboard muestra datos del workspace y el usuario puede crear/ver instancia con QR/status mock o Evolution.

### Hito 4 - Campanas controladas

Incluye:

- WS-019 a WS-025.

Criterio:

- Campana se crea desde pegado Excel/Sheets, se programa, se ejecuta en mock, respeta delay/estado y muestra logs.

### Hito 5 - Agentes IA

Incluye:

- WS-026 a WS-029.

Criterio:

- Usuario crea agente manual/guiado, versiona prompt y prueba en playground sin exponer API keys.

### Hito 6 - Contactos y webhooks

Incluye:

- WS-030 a WS-032.

Criterio:

- Contactos extraidos quedan auditados y un webhook puede activar agente bajo controles.

### Hito 7 - Beta operable

Incluye:

- WS-033 a WS-036.

Criterio:

- Backups, monitoreo, seguridad y checklist pre-beta listos para 1 a 5 clientes piloto.

## 6. Riesgos principales

- Fuga multi-tenant si alguna consulta omite `workspaceId`.
- Duplicacion de mensajes si el worker no usa idempotencia y locks.
- Exposicion accidental de Evolution API, Redis o PostgreSQL.
- Secretos LLM/Evolution enviados al frontend por variables mal prefijadas.
- Evolution API/Baileys inestable o incompatible con ARM64.
- Campanas reales sin consentimiento, opt-in, limites o delay.
- Backups no probados antes de beta.
- Webhooks falsificados o payloads no validados.
- Agente conectado a WhatsApp generando loops o respuestas no deseadas.
- Crecimiento de logs/mensajes llenando disco del VPS.

## 7. Prompts recomendados para ejecutar despues

Ejecutar en este orden, pidiendo una fase concreta por vez:

1. `Implementa WS-001 y WS-002. No avances a Docker ni auth. Verifica que la app corre, lint y typecheck.`
2. `Implementa WS-005 y WS-006. Crea .env.example y Docker Compose inicial sin exponer Postgres, Redis ni Evolution.`
3. `Implementa WS-007 y WS-008. Configura Caddy conceptual y layout base del dashboard.`
4. `Implementa WS-010 y WS-009. Configura ORM, Auth.js con Google y plan demo.`
5. `Implementa WS-011 y WS-012. Agrega guards de sesion/workspace y migraciones del dominio MVP.`
6. `Implementa WS-013 y WS-014. Crea dashboard API y UI.`
7. `Implementa WS-015, WS-016 y WS-017. Crea WhatsAppProvider, mock mode y modulo de instancias.`
8. `Implementa WS-018. Integra Evolution API detras del adapter sin exponer secretos.`
9. `Implementa WS-019, WS-020 y WS-021. Crea parser y flujo de campanas con estados.`
10. `Implementa WS-022. Agrega editor y preview de mensajes WhatsApp.`
11. `Implementa WS-023, WS-024 y WS-025. Agrega BullMQ worker, envio mock y logs.`
12. `Implementa WS-026, WS-027, WS-028 y WS-029. Agrega builder, versionado, LLM adapters y playground.`
13. `Implementa WS-030 y WS-031. Agrega extraccion de contactos y webhooks Evolution.`
14. `Implementa WS-032 solo en modo mock/controlado. Conecta agente a webhook sin loops ni autoenvio agresivo.`
15. `Implementa WS-033 y WS-034. Agrega backups y observabilidad minima.`
16. `Ejecuta WS-035 como revision de seguridad y hardening. Prioriza hallazgos antes de nuevas features.`
17. `Implementa WS-036. Crea checklist pre-beta y valida flujo completo.`

## 8. Notas de alcance

- No crear mecanismos de evasion, spam, rotacion agresiva ni bypass de limites.
- No enviar campanas automaticamente a contactos extraidos.
- Mantener Evolution API privada.
- Mantener modo mock como requisito de desarrollo y demo.
- Mantener compatibilidad futura con WhatsApp Cloud API mediante adapters.

