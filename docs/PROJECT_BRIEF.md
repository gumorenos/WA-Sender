# WA Sender - Project Brief

## 1. Resumen ejecutivo

WA Sender sera una aplicacion SaaS para gestionar conexiones de WhatsApp, campanas controladas, extraccion consentida de numeros y agentes IA asociados a instancias de WhatsApp.

El objetivo del MVP es replicar funcionalmente los modulos principales de una plataforma tipo WA Sender, pero con una base tecnica propia, auditable y preparada para crecer desde una instalacion economica en VPS hacia una arquitectura mas escalable.

Este documento consolida el contexto funcional, tecnico, de despliegue, restricciones, riesgos y decisiones pendientes antes de planificar o programar.

## 2. Objetivos del producto

- Permitir que un usuario cree una cuenta con Google OAuth.
- Asociar cada usuario a un plan con limites operativos.
- Permitir conectar una o mas instancias de WhatsApp mediante Evolution API con QR/Baileys en la primera etapa.
- Permitir crear campanas pegando datos desde Excel o Google Sheets.
- Programar y ejecutar envios con control de horarios, zona horaria, delays y estados.
- Registrar logs por mensaje y eventos relevantes.
- Permitir crear agentes IA manuales o mediante builder guiado.
- Proveer un playground tipo telefono para probar agentes.
- Mantener separacion estricta de datos por usuario.
- Evitar diseno, flujos o automatizaciones que conviertan la app en una herramienta de spam.
- Preparar la arquitectura para migrar o coexistir con WhatsApp Cloud API oficial.

## 3. Principios de diseno

- Seguridad por defecto: ningun secreto debe llegar al navegador.
- Multi-tenant desde el inicio: cada registro sensible debe pertenecer a un usuario, cuenta u organizacion.
- Consentimiento explicito: los contactos extraidos no deben usarse automaticamente en campanas sin confirmacion y opt-in.
- Operacion controlada: limites de envio, delays, pausas, horarios activos y opt-out deben estar integrados en el modelo.
- Modo mock obligatorio: Evolution API y proveedores LLM deben poder simularse para desarrollo y pruebas.
- Adapter pattern: Evolution API, WhatsApp Cloud API y proveedores LLM deben abstraerse detras de interfaces internas.
- Observabilidad minima: logs, metricas basicas, backups y alertas simples desde el MVP.
- Portabilidad: despliegue inicial con Docker Compose, evitando dependencias demasiado caras o dificiles de mover.

## 4. Usuarios y planes

### 4.1 Tipos de usuario iniciales

- Propietario de cuenta: crea la cuenta, administra instancias, campanas y agentes.
- Usuario demo: acceso limitado para probar la app.
- Administrador interno: rol futuro para soporte, auditoria y revision operacional.

### 4.2 Plan demo

Restricciones sugeridas:

- Maximo 1 instancia de WhatsApp.
- Maximo bajo de campanas activas.
- Limite diario de mensajes.
- Acceso a modo mock para pruebas.
- Restricciones claras sobre uso comercial hasta validar cumplimiento y consentimiento.

### 4.3 Planes futuros

- Plan basico: mas instancias y mayor limite diario.
- Plan profesional: multiples agentes, mas campanas, logs extendidos.
- Plan empresa: auditoria, roles, integraciones y soporte para WhatsApp Cloud API.

## 5. Alcance MVP

El MVP debe entregar una version funcional, operable y segura para 1 a 5 clientes iniciales.

### 5.1 Autenticacion y usuarios

Incluido en MVP:

- Login con Google OAuth.
- Creacion de usuario al primer ingreso.
- Asociacion de usuario a plan.
- Plan demo con limite de instancias.
- Sesion segura server-side.
- Obtencion de usuario autenticado desde backend, nunca desde parametros enviados por frontend.

No incluido en MVP:

- Login con email/password.
- SSO empresarial.
- Roles complejos por equipo.
- Facturacion automatica.

### 5.2 Dashboard

Incluido en MVP:

- Numero de conexiones activas.
- Numero de agentes creados.
- Numero de campanas activas.
- Actividad reciente basica.
- Indicadores simples de fallos recientes.

No incluido en MVP:

- Analitica avanzada.
- Embudos comerciales.
- Reportes personalizados.
- Exportaciones complejas de actividad.

### 5.3 Conectar WhatsApp

Incluido en MVP:

- Crear instancia con nombre.
- Validar limite de instancias por plan.
- Crear instancia en Evolution API.
- Mostrar QR para vincular WhatsApp.
- Consultar estado: desconectado, conectando, activo.
- Guardar estado local de instancia.
- Permitir reconectar o refrescar QR.
- Modo mock para simular QR y estados.

Implementacion inicial:

- El modulo esta documentado en `docs/WHATSAPP_INSTANCES.md`.
- La UI consume `/api/instances` y endpoints derivados.
- El backend usa Evolution API server-side y modo mock con `EVOLUTION_MOCK=true`.
- El frontend no recibe `providerInstanceId`, `hash.apikey`, tokens ni URLs internas.

Preparacion obligatoria:

- Definir una interfaz interna de proveedor WhatsApp.
- Implementar Evolution API como primer adapter.
- Reservar modelo conceptual para WhatsApp Cloud API oficial.

No incluido en MVP:

- Migracion real a WhatsApp Cloud API.
- Webhooks avanzados de mensajes entrantes para produccion completa.
- Multi-dispositivo avanzado fuera de lo que Evolution API soporte.

### 5.4 Campanas

Incluido en MVP:

- Crear campana pegando datos desde Excel o Google Sheets.
- Parsear formato de 2 columnas:
  - columna 1: numero WhatsApp.
  - columna 2: mensaje.
- Validar numeros antes de guardar.
- Guardar campana y mensajes.
- Programar campana con:
  - fecha de inicio.
  - horario activo.
  - zona horaria.
  - delay entre mensajes.
- Ejecutar envios mediante worker BullMQ.
- Estados de campana:
  - total.
  - pendientes.
  - enviados.
  - fallidos.
- Acciones:
  - iniciar.
  - pausar.
  - reanudar.
  - detener.
  - eliminar.
- Logs por mensaje con timestamp, estado, error y proveedor usado.
- Modo mock para simular envio sin contactar WhatsApp real.

Implementacion inicial:

- El parser vive en `lib/campaign-parser.ts`.
- La UI muestra preview local antes de guardar.
- El backend vuelve a parsear el texto bruto antes de crear `campaign` y `campaign_messages`.
- Crear campaña no envia mensajes; solo persiste en `DRAFT` con mensajes `PENDING`.

- La pantalla `/campaigns/status` carga resumenes con `GET /api/campaigns` y pide el detalle de una sola campana a la vez.
- El borrado de campanas usa `DELETE /api/campaigns/:id` con filtro obligatorio por `workspaceId`.
- La pantalla `/campaigns/send` permite seleccionar campana e instancia activa, definir fecha de inicio, ventana horaria, zona horaria y delay.
- El control de ejecucion usa `/api/campaigns/:id/start`, `/pause`, `/resume` y `/stop`.
- El worker de campanas esta documentado en `docs/CAMPAIGN_SENDING.md`.
- El worker usa BullMQ + Redis cuando `REDIS_URL` existe y un fallback de polling solo para desarrollo.
- El envio real queda bloqueado salvo `REAL_SENDING_ENABLED=true`; con mock se simula el proveedor.
- `campaign_messages` incluye `consent_status` para bloquear mensajes con opt-out explicito.
- El webhook `/api/webhooks/evolution` registra opt-out por palabras como STOP, BAJA o CANCELAR cuando esta protegido con `EVOLUTION_WEBHOOK_SECRET`.

Restricciones MVP:

- Envio secuencial o con baja concurrencia por instancia.
- Limites diarios y delays obligatorios.
- No permitir envios sin confirmacion explicita.
- No permitir usar automaticamente numeros extraidos como destinatarios sin paso de opt-in.

No incluido en MVP:

- A/B testing.
- Segmentacion avanzada.
- Plantillas aprobadas de WhatsApp Cloud API.
- Reintentos sofisticados con clasificacion automatica de errores.
- Optimizacion dinamica de horarios.

### 5.5 Vista previa de mensaje

Incluido en MVP:

- Editor de mensaje.
- Vista previa tipo telefono.
- Soporte visual para formato WhatsApp:
  - asteriscos para negrita.
  - guiones bajos para cursiva.
  - virgulillas para tachado.
  - triple backtick para monoespaciado.
  - saltos de linea con `\n`.
  - variables como `{nombre}`.
- Reemplazo de variables con datos de ejemplo.
- Validacion basica de mensaje vacio y longitud razonable.

Implementacion inicial:

- La utilidad vive en `/utilities/message-preview`.
- El parser esta en `lib/message-preview.ts` y la vista usa nodos React directos.
- El preview interpreta `\n` como salto de linea y resuelve variables de ejemplo sin usar HTML inyectado.

No incluido en MVP:

- Adjuntos multimedia.
- Carruseles.
- Botones interactivos.
- Validacion oficial de plantillas.

### 5.6 Extraer numeros

Incluido en MVP:

- Extraer numeros desde chats o contactos de una instancia conectada cuando el proveedor lo permita.
- Mostrar resultados con origen y fecha de extraccion.
- Permitir copiar numeros.
- Permitir descarga CSV.
- Advertencias claras de privacidad y consentimiento.
- Requerir confirmacion antes de convertir numeros extraidos en audiencia de campana.
- Marcar audiencia como no autorizada para envio hasta que exista opt-in o confirmacion valida.

Implementacion inicial:

- La utilidad vive en `/utilities/extract-numbers`.
- El endpoint server-side es `POST /api/utilities/extract-numbers`.
- El modulo esta documentado en `docs/EXTRACT_NUMBERS.md`.
- El backend valida sesion, filtra instancia por `workspaceId` y no acepta `userId` desde frontend.
- El cliente Evolution agrega extraccion desde contactos o chats con modo mock.
- Los resultados se normalizan en `lib/extract-numbers.ts`.
- Los numeros se guardan en `extracted_numbers` con `opt_in_status=UNKNOWN` y `consent_status=UNKNOWN`.
- La UI permite copiar numeros y descargar CSV/XLSX.
- Cada extraccion registra `audit_logs` sin secretos ni tokens.

No incluido en MVP:

- Enriquecimiento automatico de contactos.
- Scraping externo.
- Envio automatico a numeros extraidos.
- Sincronizacion bidireccional con CRM.

### 5.7 Agentes IA

Incluido en MVP:

- Crear agente manual:
  - nombre.
  - instrucciones completas.
- Crear agente con builder en 5 pasos:
  1. Identidad del agente.
  2. Que puede responder.
  3. Audiencia.
  4. Tono y personalidad.
  5. Revision final.
- Generar system prompt.
- Generar JSON de configuracion.
- Guardar versiones del prompt.
- Listar agentes.
- Activar y desactivar agente.
- Playground tipo chat en telefono.
- Backend LLM configurable mediante provider adapter:
  - DeepSeek.
  - OpenAI.
  - Gemini.
  - Groq.
- Modo mock para respuestas LLM.
- API keys solo en backend o almacenamiento seguro.

Implementacion inicial:

- El modulo esta documentado en `docs/AGENTS_CREATE.md`.
- La creacion se divide en `/agents/create`, `/agents/create/manual` y `/agents/create/builder`.
- La consulta y edicion usan `/agents` y `/agents/:id/edit`.
- El builder genera el prompt con template deterministico en `lib/agents/prompt-builder.ts`; no usa LLM.
- `agents.source` y `agent_versions.source` registran si el origen fue manual o builder.
- `agent_versions.generated_prompt` guarda el prompt final y `config_json` conserva el JSON versionable.
- Cada guardado de edicion crea una nueva version y actualiza `activeAgentVersionId`.
- El playground esta documentado en `docs/AGENTS_PLAYGROUND.md`.
- `/agents/playground` usa `POST /api/agents/playground` para enviar mensajes al backend.
- El backend carga la version activa del agente, mantiene historial en `playground_sessions` y llama al provider mediante `lib/llm`.
- `LLM_PROVIDER=mock|deepseek|openai` controla el provider operativo inicial; Gemini y Groq quedan reservados para fases posteriores.
- Las API keys LLM se leen solo server-side y nunca se exponen al frontend.
- La conexion inicial de agentes con WhatsApp esta documentada en `docs/AGENT_WHATSAPP_WEBHOOKS.md`.
- `/api/agents/assignments` permite asociar un agente a una instancia validando ownership por `workspaceId`.
- `/api/webhooks/evolution` procesa mensajes entrantes de Evolution API, ignora `fromMe`, ignora grupos por defecto, registra conversaciones y responde solo si existe un agente asociado en estado `ACTIVE`.
- El webhook registra opt-out con palabras como STOP, BAJA, CANCELAR o NO ENVIAR, bloquea respuestas futuras y envia como maximo una confirmacion.
- Las conversaciones de agente usan `conversations`, `conversation_messages`, `agent_instance_assignments` y `opt_outs`.
- La respuesta automatica aplica rate limit por contacto y circuit breaker ante fallos repetidos del LLM.

No incluido en MVP:

- Entrenamiento o fine-tuning.
- RAG con documentos.
- Memoria conversacional avanzada.
- Autorespuesta 24/7 con panel avanzado de conversaciones, handoff humano completo o reglas por equipo.
- Evaluaciones automaticas de calidad del agente.

## 6. Alcance no-MVP

Elementos diferidos para fases posteriores:

- Facturacion con Stripe, Mercado Pago u otro proveedor.
- Organizaciones con multiples usuarios y roles.
- WhatsApp Cloud API oficial en produccion.
- Plantillas oficiales y manejo de aprobaciones.
- Webhooks robustos para mensajes entrantes y agentes activos 24/7.
- CRM liviano integrado.
- Segmentacion avanzada de audiencias.
- Importacion directa desde Google Sheets mediante OAuth.
- Adjuntos multimedia en campanas.
- Opt-out automatizado con palabras clave.
- Panel de cumplimiento y auditoria.
- Reportes avanzados y metricas por cliente.
- Escalado horizontal de workers.
- Alta disponibilidad de base de datos.
- Backups externos automatizados con retencion configurable.
- Soporte multi-region.
- Marketplace de agentes o plantillas.

## 7. Modulos funcionales

### 7.1 Autenticacion

Gestiona login con Google, sesiones, creacion de usuario, plan activo y limites.

Responsabilidades:

- Validar identidad.
- Crear sesion.
- Resolver usuario autenticado en backend.
- Aplicar limites por plan.
- Evitar que el frontend decida `userId`, `planId` o permisos.

### 7.2 Dashboard

Pantalla de estado general del usuario.

Responsabilidades:

- Mostrar resumen de instancias.
- Mostrar agentes.
- Mostrar campanas.
- Mostrar actividad reciente.
- Alertar fallos relevantes.

### 7.3 Instancias WhatsApp

Gestiona conexiones con proveedores de WhatsApp.

Responsabilidades:

- Crear instancia.
- Obtener QR.
- Consultar estado.
- Reconectar.
- Asociar instancia al usuario.
- Ocultar tokens y endpoints internos.
- Usar adapter para Evolution API y futuro Cloud API.

### 7.4 Campanas

Gestiona audiencias, mensajes programados y ejecucion controlada.

Responsabilidades:

- Parsear datos pegados.
- Validar destinatarios.
- Guardar mensajes.
- Programar ejecucion.
- Controlar estado.
- Enviar via worker.
- Registrar logs.
- Respetar pausas, horarios, delays, limites y opt-out.

### 7.5 Vista previa

Permite al usuario revisar como se vera el mensaje antes de enviar.

Responsabilidades:

- Editar contenido.
- Renderizar formato WhatsApp.
- Simular variables.
- Reducir errores antes de programar campana.

### 7.6 Extraccion de numeros

Permite obtener numeros desde datos accesibles de una instancia conectada.

Responsabilidades:

- Extraer contactos o chats segun capacidades del proveedor.
- Mostrar resultados.
- Exportar CSV o Excel en fase posterior.
- Exigir controles de privacidad.
- Bloquear uso automatico sin opt-in.

### 7.7 Agentes IA

Permite configurar asistentes conversacionales.

Responsabilidades:

- Crear agentes.
- Crear prompts manuales o guiados.
- Versionar prompts.
- Probar en playground.
- Activar y desactivar.
- Enviar solicitudes a LLM mediante adapters.
- Mantener secretos en backend.

## 8. Arquitectura tecnica inicial

### 8.1 Stack preferido

- Frontend y backend web: Next.js con App Router.
- Lenguaje: TypeScript.
- UI: Tailwind CSS.
- Base de datos para MVP/beta: PostgreSQL self-hosted en Oracle Cloud.
- Alternativa futura de base de datos: PostgreSQL administrado, incluyendo Supabase, si la operacion self-hosted se vuelve una carga.
- Autenticacion para MVP/beta: Auth.js/NextAuth con Google OAuth.
- Cola: Redis.
- Workers: BullMQ.
- WhatsApp provider inicial: Evolution API con QR/Baileys.
- LLM providers: DeepSeek, OpenAI, Gemini, Groq mediante adapters.
- Contenedores: Docker Compose.
- Reverse proxy y HTTPS para beta: Caddy.

### 8.2 Componentes

- Next.js app:
  - UI.
  - rutas server-side.
  - server actions o route handlers.
  - autenticacion.
  - consultas de usuario.
- PostgreSQL:
  - usuarios.
  - planes.
  - instancias.
  - campanas.
  - mensajes.
  - logs.
  - agentes.
  - versiones de prompts.
- Redis:
  - cola de campanas.
  - jobs diferidos.
  - locks simples.
- Worker BullMQ:
  - ejecucion de campanas.
  - respeto de horarios y delays.
  - reintentos controlados.
  - actualizacion de estados.
- Evolution API:
  - creacion de instancia.
  - QR.
  - estado.
  - envio de mensajes.
  - extraccion si el endpoint lo permite.
- Provider adapters:
  - WhatsAppProvider.
  - LLMProvider.
- Reverse proxy:
  - HTTPS.
  - rutas publicas.
  - posible proxy hacia app y Evolution API.

### 8.3 Separacion de responsabilidades

- El frontend nunca debe llamar directamente a Evolution API.
- El frontend nunca debe llamar directamente a proveedores LLM.
- El frontend nunca debe enviar `userId` como fuente de verdad.
- Las rutas backend deben derivar usuario desde la sesion.
- Los workers deben validar propiedad de recursos antes de enviar.
- Los secretos deben vivir en variables de entorno o almacenamiento cifrado.

## 9. Modelo de datos conceptual

Entidades iniciales:

- User:
  - identidad OAuth.
  - email.
  - nombre.
  - plan activo.
  - timestamps.
- Plan:
  - nombre.
  - limites de instancias.
  - limites de campanas.
  - limites diarios de mensajes.
- WhatsAppInstance:
  - userId interno.
  - nombre.
  - provider.
  - providerInstanceId.
  - estado.
  - timestamps.
- Campaign:
  - userId interno.
  - instanceId.
  - nombre.
  - estado.
  - fecha de inicio.
  - horario activo.
  - zona horaria.
  - delay.
  - totales.
- CampaignMessage:
  - campaignId.
  - numero.
  - mensaje.
  - estado.
  - intentos.
  - ultimo error.
  - timestamps.
- MessageLog:
  - messageId.
  - estado anterior.
  - estado nuevo.
  - provider response.
  - error.
  - timestamp.
- ExtractedContact:
  - userId interno.
  - instanceId.
  - numero.
  - origen.
  - optInStatus.
  - fecha de extraccion.
- Agent:
  - userId interno.
  - nombre.
  - estado.
  - provider LLM preferido.
  - configuracion JSON.
  - version activa.
- AgentPromptVersion:
  - agentId.
  - system prompt.
  - JSON generado.
  - createdAt.

Decision de modelo:

- La frontera tenant recomendada para MVP/beta es `workspaceId`.
- En MVP, cada usuario tendra un workspace personal creado al primer login.
- Los planes y limites deben asociarse al workspace.
- El backend debe derivar `userId` desde la sesion y `workspaceId` desde la membresia; el frontend nunca debe enviar `userId` como autoridad.

## 10. Despliegue inicial

### 10.1 Entorno objetivo

Servidor inicial esperado:

- Oracle Cloud Always Free.
- Ubuntu 24.04 ARM64.
- 4 OCPU ARM.
- 24 GB RAM.
- 200 GB disco.
- Docker disponible.
- Dominio propio.
- Cloudflare para DNS, proxy o tunnel si conviene.

### 10.1.1 Decisiones DevOps para produccion beta

Decisiones recomendadas para el primer despliegue beta:

- La produccion beta iniciara en un solo VPS Oracle Cloud Always Free.
- Docker Compose sera el orquestador inicial.
- PostgreSQL self-hosted sera la opcion recomendada para beta por costo minimo; Supabase queda como alternativa futura si se prioriza reducir carga operativa.
- Redis self-hosted sera usado para BullMQ.
- Caddy sera el reverse proxy recomendado para beta por HTTPS automatico y simplicidad.
- Cloudflare se usara inicialmente para DNS y proxy; Cloudflare Tunnel queda como alternativa si se quiere cerrar puertos publicos.
- Solo el reverse proxy debe exponer puertos 80 y 443.
- PostgreSQL, Redis, Evolution API y workers deben permanecer privados dentro de la red Docker.
- El subdominio publico inicial recomendado es `app.tudominio.com`.
- Evolution API no debe exponerse publicamente salvo necesidad tecnica validada.
- Backups diarios de PostgreSQL y sesiones Evolution son obligatorios antes de piloto real.
- Debe probarse restauracion de backups antes de operar con clientes reales.
- Debe existir monitoreo minimo de app, DB, Redis, worker, Evolution API, disco y backups.
- Las imagenes Docker deben fijarse por version; no usar `latest` en produccion beta.
- La compatibilidad ARM64 debe validarse con las imagenes reales antes del piloto.
- El servidor debe endurecerse antes de beta siguiendo `docs/SERVER_HARDENING.md`.

### 10.2 Topologia propuesta para MVP

En un solo VPS con Docker Compose:

- `web`: Next.js app.
- `worker`: BullMQ worker.
- `postgres`: base de datos.
- `redis`: cola y cache operacional.
- `evolution-api`: proveedor WhatsApp inicial.
- `reverse-proxy`: Caddy o Nginx.

### 10.3 HTTPS y dominio

Opciones:

- Caddy con certificados automaticos Let's Encrypt.
- Nginx con Certbot.
- Cloudflare proxy con SSL full strict.
- Cloudflare Tunnel si se desea reducir exposicion directa del VPS.

Decision para beta:

- Usar Caddy como reverse proxy inicial.
- Exponer solo Caddy en puertos 80/443.
- Mantener PostgreSQL, Redis y contenedores internos sin puertos publicos.
- Publicar por defecto solo `app.midominio.com`.
- Mantener Evolution API privada por defecto; publicar `evo.midominio.com` solo si existe necesidad administrativa y con autenticacion adicional.
- Mantener Cloudflare Tunnel como alternativa futura para cerrar 80/443 o proteger `evo` con Cloudflare Access.

### 10.4 Backups

Minimo MVP:

- Backup diario de PostgreSQL.
- Retencion local corta.
- Copia externa futura a object storage o almacenamiento compatible.
- Procedimiento documentado de restauracion.

No basta con tener volumen Docker: se necesita backup exportable.

Implementacion inicial:

- La estrategia operativa esta documentada en `docs/BACKUP_RESTORE.md`.
- El servicio Docker `postgres-backup` ejecuta backups diarios de PostgreSQL app y PostgreSQL Evolution.
- Los scripts viven en `scripts/backup`.
- La retencion local por defecto es 7 dias.
- La copia externa opcional usa `BACKUP_EXTERNAL_PATH` montado como carpeta o mount de Object Storage.
- La limpieza de logs operativos antiguos usa `BACKUP_LOG_RETENTION_DAYS` y se ejecuta despues del backup.
- Los backups no incluyen `.env.production`, pero los dumps contienen datos sensibles y deben tratarse como privados.

### 10.5 Monitoreo minimo

Minimo MVP:

- Logs de aplicacion.
- Logs de worker.
- Logs de Evolution API.
- Healthcheck de contenedores.
- Alertas simples por caida de servicio o errores repetidos.
- Revision de uso de disco.

Futuro:

- Uptime Kuma.
- Grafana/Prometheus.
- Loki o similar para logs centralizados.

Implementacion inicial:

- La capa minima esta documentada en `docs/OBSERVABILITY.md`.
- `GET /api/health` sirve disponibilidad basica de app.
- `GET /api/health/deep` agrega chequeos de DB, Redis, Evolution, worker, LLM, instancias y disco.
- `GET /api/health/deep` requiere `HEALTHCHECK_TOKEN` en produccion.
- El worker publica heartbeat para observabilidad operacional.
- `uptime-kuma` queda como servicio opcional en `docker-compose.yml` para beta.

### 10.6 Entorno Docker local y beta

Implementacion inicial:

- `docker-compose.yml` queda reservado para produccion beta y publica solo Caddy en 80/443.
- `docker-compose.local.yml` levanta dependencias locales con puertos ligados a `127.0.0.1`.
- `README.md` documenta instalacion, variables, OAuth, Evolution, QR, campanas mock, playground mock y despliegue Oracle.
- `package.json` expone scripts estandar: `dev`, `dev:worker`, `build`, `lint` y `test`.

## 11. Seguridad y privacidad

### 11.1 Reglas obligatorias

- No aceptar `userId` desde frontend como autoridad.
- No exponer tokens de Evolution API al navegador.
- No exponer API keys de LLM al navegador.
- No guardar secretos en el repositorio.
- No loguear mensajes completos si no es necesario para depuracion.
- No mezclar datos entre usuarios.
- Validar propiedad de cada recurso en backend.
- Sanitizar datos pegados desde hojas de calculo.
- Proteger endpoints internos con autenticacion y autorizacion.
- Separar modo mock de modo real por configuracion.
- Aplicar rate limit basico a endpoints de escritura, webhooks y llamadas a proveedores externos.
- Documentar controles y riesgos vigentes en `docs/SECURITY_NOTES.md`.
- Usar helpers centralizados de seguridad cuando se creen endpoints nuevos:
  - `requireUser()`.
  - `requireWorkspace()`.
  - `requireOwnership()`.

### 11.2 Consentimiento y anti-spam

La app no debe disenar flujos orientados a spam.

Controles minimos:

- Confirmacion explicita antes de iniciar campana.
- Delays obligatorios entre mensajes.
- Horarios activos configurables.
- Limites por plan.
- Logs auditables.
- Advertencias al importar o extraer numeros.
- Estado de opt-in para numeros extraidos.
- Bloqueo de envio automatico a numeros extraidos sin confirmacion.
- Posibilidad futura de opt-out por palabra clave.

### 11.3 Separacion tenant

Cada consulta de datos debe filtrar por usuario, cuenta u organizacion derivada de la sesion.

Riesgo critico:

- Si un endpoint permite consultar por ID sin validar propietario, un usuario podria acceder a campanas, agentes o instancias de otro usuario.

## 12. Modos mock

### 12.1 Mock Evolution API

Debe permitir:

- Crear instancia falsa.
- Generar QR simulado.
- Cambiar estados: desconectado, conectando, activo.
- Simular envio exitoso.
- Simular fallos temporales.
- Simular extraccion de contactos.

Uso:

- Desarrollo local.
- Demos sin WhatsApp real.
- Pruebas automatizadas.

### 12.2 Mock LLM

Debe permitir:

- Respuestas deterministicas.
- Simular error de provider.
- Simular latencia.
- Probar builder y playground sin gastar tokens.

Uso:

- Desarrollo local.
- Pruebas de UI.
- Pruebas de adapters.

## 13. Preparacion para WhatsApp Cloud API

Aunque el MVP use Evolution API, la app debe evitar acoplar el dominio a Baileys.

Decisiones de diseno:

- Usar `WhatsAppProvider` interno.
- Modelar capacidades por proveedor:
  - soporta QR.
  - soporta envio libre.
  - soporta plantillas.
  - soporta webhooks.
  - soporta contactos/chats.
- No asumir que todos los proveedores permiten extraer contactos.
- No asumir que todos los proveedores permiten iniciar conversaciones sin plantilla.
- Separar mensajes de campana del formato especifico del proveedor.

Riesgo:

- WhatsApp Cloud API oficial tiene reglas distintas: plantillas, ventanas de conversacion, aprobaciones y costos por conversacion.

## 14. Riesgos tecnicos

- Evolution API/Baileys puede romper por cambios de WhatsApp Web.
- Cuentas de WhatsApp pueden ser bloqueadas si hay patrones de envio agresivos.
- El QR y estado de instancia pueden requerir manejo robusto de websockets o polling.
- BullMQ requiere disciplina para evitar duplicados, carreras y reintentos peligrosos.
- El worker puede enviar mensajes duplicados si no hay idempotencia por mensaje.
- El despliegue single-server tiene punto unico de falla.
- PostgreSQL en Docker sin backup externo es riesgo de perdida de datos.
- ARM64 puede tener incompatibilidades con algunas imagenes Docker o dependencias.
- Evolution API puede requerir configuracion especial para persistencia de sesiones.
- Proveedores LLM tienen APIs, limites, costos y formatos diferentes.
- Renderizar formato WhatsApp en preview puede diferir del cliente real.

## 15. Riesgos legales y de cumplimiento

- Envio de mensajes sin consentimiento puede infringir normas de privacidad, telecomunicaciones o politicas de WhatsApp.
- Extraer numeros de chats/contactos puede ser sensible y requiere base legal o consentimiento.
- Almacenar numeros telefonicos y mensajes implica tratamiento de datos personales.
- Los usuarios pueden intentar usar la app para spam.
- WhatsApp puede sancionar cuentas o proveedores no oficiales.
- El uso de Baileys/Evolution API puede no equivaler al uso aprobado de WhatsApp Business Platform.
- Se deben definir terminos de uso, politica de privacidad y reglas anti-abuso antes de operar con clientes reales.

Nota:

Este documento no es asesoramiento legal. Antes de ofrecer el SaaS comercialmente, se debe validar cumplimiento con asesoria legal segun paises objetivo.

## 16. Riesgos operativos

- VPS unico puede caer y dejar inactivas campanas o agentes.
- Disco lleno puede detener PostgreSQL, Redis o Evolution API.
- Backups no probados pueden fallar en restauracion.
- Credenciales mal rotadas pueden comprometer proveedores.
- Logs con informacion sensible pueden exponer datos de clientes.
- Clientes pueden esperar entregabilidad garantizada, pero WhatsApp impone restricciones y riesgos de bloqueo.
- Soporte manual puede crecer rapido si las conexiones QR se desconectan con frecuencia.

## 17. Supuestos

- El despliegue inicial sera para pocos clientes: maximo 5, probablemente 1 o 2 al inicio.
- El presupuesto inicial debe mantenerse al minimo.
- El VPS Oracle Cloud Always Free sera suficiente para MVP si el volumen de mensajes es bajo.
- Docker estara disponible en el servidor.
- El usuario cuenta con dominio propio.
- Cloudflare puede usarse si simplifica DNS, HTTPS, proxy o tunnel.
- Evolution API sera el primer proveedor operativo de WhatsApp.
- WhatsApp Cloud API oficial es un objetivo futuro, no requisito del MVP.
- Los proveedores LLM se integraran mediante adapters, no directamente desde UI.
- El MVP prioriza seguridad, control y operacion basica sobre features avanzadas.

## 18. Decisiones pendientes

### 18.1 Base de datos

Decision para MVP/beta:

- Usar PostgreSQL self-hosted en Oracle Cloud Always Free.
- Mantener Supabase como alternativa futura si se prioriza reducir carga operativa o migrar a PostgreSQL administrado.

Razon:

- Es la opcion de menor costo inicial.
- Mantiene la base cerca de la app, worker y Redis.
- Evita dependencia inicial de Supabase Auth/DB.
- Permite migrar despues a PostgreSQL administrado cambiando principalmente la conexion y el plan operativo.

Condicion:

- Backups diarios y restauracion probada son obligatorios antes de operar con clientes reales.

### 18.2 Autenticacion

Decision para MVP/beta:

- Usar Auth.js/NextAuth con Google OAuth.
- Persistir usuarios, cuentas OAuth y sesiones en PostgreSQL.

Razon:

- Compatible con Next.js App Router.
- Evita acoplar identidad inicial a Supabase.
- Permite resolver usuario en backend sin aceptar `userId` desde frontend.
- Funciona con PostgreSQL self-hosted y puede mantenerse si la base migra a PostgreSQL administrado.

### 18.3 Reverse proxy

Decision para beta:

- Usar Caddy como proxy inicial.
- `app.midominio.com` apunta a Next.js por red Docker privada.
- `evo.midominio.com` queda desactivado por defecto; si se usa, apunta a Evolution API por Caddy con `basicauth` y debe reforzarse con Cloudflare Access.
- `status.midominio.com` queda reservado para Uptime Kuma y tambien desactivado por defecto.

Razon:

- Caddy reduce complejidad operativa por HTTPS automatico.
- Permite mantener solo 80/443 abiertos al publico.
- Es suficiente para beta single-server en Oracle Cloud.

### 18.4 Multi-tenancy

Decision para MVP/beta:

- Usar `workspaceId` desde el inicio.
- Crear un workspace personal por usuario en MVP.
- Asociar plan y limites al workspace.

Razon:

- Mantiene el MVP simple.
- Permite equipos, organizaciones y facturacion futura sin redisenar el dominio.
- Reduce riesgo de mezclar recursos si todas las tablas de negocio filtran por workspace.

### 18.5 Modelo de limites

Definir:

- Maximo de instancias por plan.
- Maximo de mensajes por dia.
- Maximo de campanas activas.
- Delay minimo permitido.
- Limite por hora.
- Politicas de bloqueo por errores o reportes.

### 18.6 Proveedor LLM inicial

Opciones:

- DeepSeek.
- OpenAI.
- Gemini.
- Groq.

Criterios:

- Costo.
- Latencia.
- Calidad.
- Soporte de JSON.
- Facilidad de configuracion.

Decision pendiente:

- Elegir provider por defecto para MVP.

### 18.7 Estrategia de extraccion de numeros

Definir:

- Que endpoints de Evolution API se usaran.
- Si se extraen contactos, chats o ambos.
- Como se registra origen.
- Como se marca opt-in.
- Que confirmaciones exige la UI.

### 18.8 Politicas legales y anti-abuso

Definir:

- Terminos de uso.
- Politica de privacidad.
- Politica anti-spam.
- Proceso de suspension de usuario.
- Mensajes de advertencia en UI.
- Reglas de opt-out.

## 19. Criterios de aceptacion del MVP

El MVP se considera listo para piloto si:

- Un usuario puede iniciar sesion con Google.
- El sistema aplica limite de plan demo.
- El usuario puede crear una instancia de WhatsApp.
- La app muestra QR o estado mock.
- La app consulta estado de instancia.
- El usuario puede crear una campana pegando dos columnas.
- La app valida y guarda mensajes.
- El usuario puede programar campana con horario, zona horaria y delay.
- El worker puede enviar o simular envios.
- La campana muestra pendientes, enviados y fallidos.
- Existen logs por mensaje.
- El usuario puede crear agente manual.
- El usuario puede crear agente con builder de 5 pasos.
- El sistema guarda versiones de prompt.
- El playground funciona con provider real o mock.
- El usuario puede asociar un agente activo a una instancia WhatsApp y probar webhook entrante en modo mock.
- Ningun secreto aparece en frontend.
- Ningun endpoint confia en `userId` enviado por frontend.
- Existe backup minimo documentado.
- Existe modo mock documentado para Evolution API y LLM.

## 20. Glosario

- WA Sender: nombre del SaaS a construir.
- Instancia WhatsApp: conexion individual entre la app y una cuenta de WhatsApp.
- Evolution API: proveedor inicial para conectar WhatsApp usando QR/Baileys.
- Baileys: libreria no oficial usada por algunas soluciones para interactuar con WhatsApp Web.
- WhatsApp Cloud API: API oficial de Meta para WhatsApp Business Platform.
- Campana: conjunto de mensajes programados para ser enviados a destinatarios.
- Mensaje de campana: unidad individual de envio dentro de una campana.
- Delay: espera configurada entre mensajes para controlar velocidad de envio.
- Horario activo: ventana horaria permitida para ejecutar envios.
- Opt-in: evidencia o confirmacion de que un destinatario acepto recibir mensajes.
- Opt-out: mecanismo para que un destinatario deje de recibir mensajes.
- Agente IA: configuracion de asistente conversacional con instrucciones y provider LLM.
- System prompt: instrucciones principales que guian el comportamiento del agente IA.
- Provider adapter: capa interna que estandariza llamadas a servicios externos.
- BullMQ: sistema de colas sobre Redis para ejecutar jobs en segundo plano.
- Worker: proceso que consume jobs y ejecuta tareas como envios de campana.
- Modo mock: simulacion local o de pruebas que no llama servicios reales.
- Tenant: usuario, cuenta u organizacion cuyos datos deben estar aislados.

## 21. Preguntas abiertas para la siguiente fase

- Caddy, Nginx o Cloudflare Tunnel para el primer despliegue?
- Cual sera el limite exacto del plan demo?
- Cual sera el delay minimo permitido entre mensajes?
- Cual sera el primer proveedor LLM por defecto?
- Se permitira envio real en MVP o primero solo piloto controlado con mock?
- Que paises o mercados iniciales deben considerarse para privacidad y consentimiento?
- Que politica de retencion de logs y mensajes se aplicara?
