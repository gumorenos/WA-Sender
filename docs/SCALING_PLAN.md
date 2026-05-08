# WA Sender - Scaling Plan

Fecha: 2026-05-08

## Fuentes internas revisadas

- `docs/PROJECT_BRIEF.md`
- `docs/DEPLOYMENT_PLAN.md`
- `docs/PRODUCT_REVIEW.md`
- `docs/BETA_CHECKLIST.md`

## Referencias externas de precios consultadas

Los precios cambian por region, uso y fecha. Antes de contratar, validar de nuevo con calculadora oficial.

- Supabase Pricing: https://supabase.com/pricing
- Neon Pricing: https://neon.com/pricing
- Railway Pricing: https://railway.com/pricing
- Railway Pricing Docs: https://docs.railway.com/pricing
- Render Pricing: https://render.com/pricing
- Render Postgres Flexible Plans: https://render.com/docs/postgresql-refresh
- Fly.io Pricing: https://fly.io/docs/about/pricing/
- AWS RDS PostgreSQL Pricing: https://aws.amazon.com/rds/postgresql/pricing
- Google Cloud SQL Pricing: https://cloud.google.com/sql/pricing/
- Azure Database for PostgreSQL Pricing: https://azure.microsoft.com/en-us/pricing/details/postgresql/server/
- WhatsApp Business Platform Pricing: https://whatsappbusiness.com/products/platform-pricing
- OpenAI API Pricing: https://platform.openai.com/docs/pricing/

## Supuestos de capacidad

Este plan usa clientes como `workspaces` activos, no usuarios totales.

Supuesto base por cliente beta:

- 1 a 3 instancias WhatsApp.
- 1 a 3 campanas activas.
- 50 a 500 mensajes/dia por cliente en fases iniciales.
- 1 agente IA activo por cliente en beta.
- LLM externo, no self-hosted.
- Evolution API/Baileys al inicio, pero con migracion progresiva a WhatsApp Cloud API oficial.
- Una sola region principal: America Latina.

Variables que cambian todo el calculo:

- Cantidad de instancias WhatsApp conectadas al mismo tiempo.
- Volumen diario de mensajes.
- Uso de agentes IA por webhook.
- Retencion de logs y mensajes.
- Si se usa Evolution/Baileys o WhatsApp Cloud API oficial.
- Si se exige SLA comercial.

## Principio rector

No escalar por cantidad de clientes solamente. Escalar por senales objetivas:

- uso sostenido de CPU/RAM/disco.
- latencia.
- backlog de colas.
- fallos de Evolution.
- numero de instancias conectadas.
- costo LLM.
- riesgo operativo de backups/restore.
- soporte manual requerido.

## Roadmap resumido

| Etapa | Clientes | Decision principal | Arquitectura recomendada | Estimado mensual infra |
|---|---:|---|---|---:|
| E0 | 1-5 | Validar producto | 1 VPS Oracle Free + Docker Compose | USD 0-25 + variables |
| E1 | 10 | Endurecer beta | Oracle Free o VPS pagado pequeno + backup externo + alertas | USD 10-60 + variables |
| E2 | 25 | Sacar DB del VPS | Managed Postgres + app/worker/Evolution todavia en VPS o 2 VPS | USD 40-150 + variables |
| E3 | 50 | Separar procesos criticos | App stateless, workers separados, Evolution separado, Redis separado/managed | USD 120-400 + variables |
| E4 | 100 | Plataforma SaaS real | Managed DB, Redis managed, app replicas, worker pool, Cloud API preferente | USD 300-1,200+ + variables |

Variables no incluidas:

- LLM por tokens.
- WhatsApp Cloud API por mensaje/categoria/pais.
- soporte humano.
- dominios, correo transaccional, herramientas legales, contabilidad.

## E0: 1 a 5 clientes

### Objetivo

Validar producto, flujos y soporte con costo minimo.

### Arquitectura

```text
Cloudflare DNS/proxy
  -> Caddy en Oracle VPS
      -> Next.js app
      -> app-worker BullMQ
      -> Redis
      -> PostgreSQL app
      -> Evolution API
      -> PostgreSQL Evolution
      -> backup container
```

### Mantener

- Oracle Cloud Always Free.
- PostgreSQL self-hosted.
- Redis self-hosted.
- Evolution API privado.
- Caddy como unico punto publico.
- Uptime Kuma opcional.
- LLM mock por defecto o LLM real con cuota baja.

### Cambios obligatorios antes de clientes reales

- Cerrar P0 de `docs/BETA_CHECKLIST.md`.
- Restore probado.
- Alertas activas.
- Opt-in/opt-out operativo.
- Limites por plan server-side.
- `REAL_SENDING_ENABLED=false` por defecto.

### Costos aproximados

| Concepto | Rango mensual |
|---|---:|
| Oracle Always Free | USD 0 |
| Cloudflare DNS/proxy basico | USD 0 |
| Backup externo simple | USD 0-10 |
| Uptime Kuma self-hosted | USD 0 |
| LLM | variable, ideal USD 0-20 con cuota |
| WhatsApp Cloud API | no aplica si aun se usa Evolution; si se usa Cloud API, variable por mensaje |

Rango total recomendado: USD 0-25/mes, sin contar LLM ni WhatsApp oficial.

### Senales para pasar a E1

- 5 clientes activos o mas.
- Mas de 10 instancias conectadas.
- CPU sostenida > 60% por 30 minutos.
- RAM > 70% sostenida.
- Disco > 60%.
- Backups empiezan a tardar mas de 15 minutos.
- Mas de 3 incidentes/semana por desconexion Evolution.
- Se necesita responder soporte todos los dias.

## E1: 10 clientes

### Objetivo

Mantener bajo costo, pero reducir riesgo operacional.

### Arquitectura recomendada

Opcion A, si el VPS sigue estable:

```text
Oracle VPS unico
  - Next.js app
  - worker
  - Redis
  - PostgreSQL
  - Evolution API
  - Caddy
Backup externo privado
Uptime Kuma con alertas reales
```

Opcion B, si Evolution consume recursos o desconecta sesiones:

```text
VPS 1: app + worker + DB + Redis + Caddy
VPS 2: Evolution API + PostgreSQL Evolution
Backup externo
Cloudflare
```

### Decision tecnica

No mover la base todavia si:

- restore esta probado.
- el disco tiene margen.
- la latencia de DB es baja.
- el mantenimiento manual es aceptable.

Mover antes a managed Postgres si:

- ya hay datos que no se pueden perder.
- no se quiere administrar backups.
- el VPS empieza a ser punto unico de falla demasiado riesgoso.

### Costos aproximados

| Opcion | Rango mensual |
|---|---:|
| Seguir en Oracle Free + backup externo | USD 0-25 |
| Agregar VPS pequeno para Evolution | USD 6-30 |
| Neon Launch para Postgres app | tipico USD 15+, por uso |
| Supabase Pro para Postgres app | desde USD 25 |
| Railway Hobby/Pro para servicios pequenos | desde USD 5-20 + uso |

Rango total recomendado: USD 10-60/mes, sin contar LLM ni WhatsApp oficial.

### Senales para pasar a E2

- 10 clientes pagan o dependen operativamente de la app.
- RPO/RTO importa: no se acepta perder mas de 24h.
- Backups locales ya no son suficientes.
- DB CPU alta o queries lentas frecuentes.
- Mas de 20 instancias WhatsApp conectadas.
- Worker lag > 2 minutos de forma repetida.
- Restore manual tarda demasiado o no se ha probado en fecha reciente.

## E2: 25 clientes

### Objetivo

Sacar datos criticos del VPS y preparar separacion de carga.

### Arquitectura recomendada

```text
Cloudflare
  -> Caddy / app edge
      -> Next.js app en VPS o PaaS
      -> Worker en VPS separado o proceso separado
      -> Redis self-hosted o managed
      -> Managed Postgres app
      -> Evolution node(s) separados
          -> Postgres Evolution propio o managed separado
      -> Object Storage / backup externo
```

### Decision sobre managed Postgres

Recomendacion: mover la DB principal de WA Sender a managed Postgres en esta etapa.

Opciones:

| Opcion | Cuándo usarla | Comentario |
|---|---|---|
| Neon Launch | Mejor costo inicial para Postgres managed con autoscaling/serverless | Buena opcion si no se usa Supabase Auth. |
| Supabase Pro | Si se quiere dashboard, backups incluidos, potencial RLS/storage y ecosistema | Desde USD 25; no obliga a usar Supabase Auth. |
| Render Postgres | Si se despliega app en Render y se quiere simplicidad | Storage flexible con costo por GB. |
| Railway Postgres | Si se mueve todo a Railway por velocidad operacional | Buen DX, costo por uso. Vigilar volumen y egress. |
| AWS RDS / GCP Cloud SQL / Azure PostgreSQL | Si se requiere nube mayor, compliance, networking y soporte maduro | Mas complejo y normalmente mas caro. Mejor desde 50-100 clientes. |

Recomendacion practica para WA Sender:

1. Neon si la prioridad es costo y Postgres managed puro.
2. Supabase si se valora dashboard, backups, posible RLS futuro y herramientas de producto.
3. AWS/GCP/Azure solo si ya hay razon empresarial o cliente que lo exija.

### Separar Evolution API

A 25 clientes, Evolution deberia salir del mismo VPS si hay mas de 20-30 instancias conectadas o si las desconexiones generan soporte.

Patron recomendado:

```text
App backend -> WhatsAppProvider adapter -> Evolution cluster/router
Evolution node A -> 10-20 instancias
Evolution node B -> 10-20 instancias
```

No exponer Evolution al publico.

### Costos aproximados

| Concepto | Rango mensual |
|---|---:|
| Managed Postgres app | USD 15-60 |
| VPS app/worker o PaaS pequeno | USD 0-50 |
| VPS Evolution separado | USD 10-60 |
| Redis managed o separado | USD 0-30 |
| Backups/object storage | USD 5-20 |
| Observabilidad basica | USD 0-30 |

Rango total recomendado: USD 40-150/mes, sin contar LLM ni WhatsApp oficial.

### Senales para pasar a E3

- 25 clientes activos o mas.
- Mas de 50 instancias conectadas.
- Worker lag > 5 minutos.
- Campanas compiten por la misma instancia.
- DB conexiones > 60% del limite.
- p95 de API > 700ms en rutas internas.
- Evolution consume mas CPU/RAM que la app.
- Se reciben tickets por desconexion o demora todos los dias.
- Necesidad de deploy sin detener worker/envios.

## E3: 50 clientes

### Objetivo

Convertir la app en sistema separado por responsabilidades.

### Arquitectura recomendada

```text
Cloudflare
  -> App service/reverse proxy
      -> Next.js app replica 1
      -> Next.js app replica 2

Managed Postgres app
Managed Redis / Redis dedicado

Worker pool
  -> campaign-worker-1
  -> campaign-worker-2
  -> scheduler/dispatcher

Evolution pool
  -> evolution-node-1
  -> evolution-node-2
  -> evolution-node-3

Object Storage
Observability + logs centralizados
```

### Cambios tecnicos necesarios

- App debe ser stateless.
- Sesiones Auth.js deben vivir solo en DB/Redis, no memoria local.
- Rate limiting debe migrar de in-memory a Redis.
- Worker debe usar locks distribuidos por `campaignId`, `messageId` e `instanceId`.
- Una instancia WhatsApp solo debe procesar una campana activa a la vez.
- Cola debe particionarse por instancia o workspace.
- Retencion de logs debe ser automatica.
- Metricas deben persistirse.
- Backups deben incluir RPO/RTO objetivo.
- Deploy debe ser rolling o blue/green.

### WhatsApp Cloud API

A 50 clientes, iniciar migracion funcional a WhatsApp Cloud API oficial para nuevos clientes o clientes con mayor volumen.

Razones:

- Evolution/Baileys es fragil ante cambios de WhatsApp Web.
- Soporte manual escala mal.
- Clientes reales necesitaran estabilidad, plantillas y cumplimiento.
- Cloud API permite webhooks/status oficiales y menor riesgo de bloqueo por integracion no oficial.

No apagar Evolution de golpe:

- Mantener Evolution para demo, clientes pequenos o cuentas que aun no califican para Cloud API.
- Nuevos clientes productivos deberian entrar por Cloud API cuando sea posible.

### Costos aproximados

| Concepto | Rango mensual |
|---|---:|
| Managed Postgres medio | USD 60-150 |
| App hosting / 2 replicas | USD 30-120 |
| Worker pool | USD 20-100 |
| Redis managed/dedicado | USD 15-80 |
| Evolution pool | USD 50-150 |
| Object storage + backups | USD 10-50 |
| Observabilidad/logs | USD 20-100 |

Rango total recomendado: USD 120-400/mes, sin contar LLM ni WhatsApp oficial.

### Senales para pasar a E4

- 50 clientes activos o mas.
- Mas de 100 instancias WhatsApp conectadas.
- Ingresos justifican soporte formal.
- Se necesita SLA o uptime comprometido.
- Mas de 10.000 mensajes/dia.
- Mas de 10.000 interacciones LLM/dia.
- DB > 20 GB o crecimiento > 1 GB/semana.
- Restore completo tardaria mas del RTO aceptable.
- Un deploy manual ya es riesgoso.
- Se necesita auditoria, roles internos y suspension de clientes.

## E4: 100 clientes

### Objetivo

Operar como SaaS real, no como proyecto en VPS.

### Arquitectura recomendada

```text
Cloudflare WAF / DNS / Access
  -> App platform / load balancer
      -> Next.js app replicas

Managed Postgres production
  -> PITR
  -> read replica opcional
  -> connection pooler

Managed Redis
  -> queues
  -> rate limits
  -> locks

Worker pool
  -> scheduler
  -> campaign sender workers
  -> webhook/agent workers

WhatsApp provider layer
  -> WhatsApp Cloud API primary
  -> Evolution pool legacy/low-volume

Object storage
  -> backups exports
  -> report exports

Observability
  -> metrics
  -> logs
  -> traces opcional
  -> alerting
  -> status page
```

### Plataforma recomendada

Para 100 clientes, elegir una de estas rutas:

#### Ruta 1: PaaS pragmatico

- App/worker en Railway, Render o Fly.
- DB en Neon o Supabase.
- Redis managed.
- Evolution en VPS dedicados o Fly/VMs con volumen.

Ventaja:

- Menos DevOps.
- Rapido de operar.

Desventaja:

- Costos pueden crecer con uso.
- Evolution con volumen/sesiones sigue siendo delicado.

#### Ruta 2: Cloud mayor

- AWS/GCP/Azure.
- RDS/Cloud SQL/Azure PostgreSQL.
- ECS/Cloud Run/App Service para app/worker.
- ElastiCache/Memorystore/Azure Cache for Redis.
- Object Storage.
- Managed logging/monitoring.

Ventaja:

- Mas control, compliance, networking y escalado.

Desventaja:

- Mayor complejidad y costo operacional.

#### Ruta 3: Hibrida recomendada para WA Sender

- DB principal en Neon o Supabase.
- App/worker en PaaS simple.
- Evolution aislado en VPS/VMs dedicados mientras se migra a Cloud API.
- Cloud API oficial para clientes productivos.

Esta ruta evita reescribir todo y reduce riesgo gradualmente.

### Costos aproximados

| Concepto | Rango mensual |
|---|---:|
| Managed Postgres production | USD 150-400 |
| App replicas | USD 80-250 |
| Worker pool | USD 80-250 |
| Redis managed | USD 40-150 |
| Evolution legacy pool | USD 100-300 |
| Object storage/backups | USD 20-100 |
| Observabilidad/logs | USD 50-250 |
| Soporte/herramientas operativas | USD 50-300 |

Rango total recomendado: USD 300-1.200+/mes, sin contar LLM ni WhatsApp oficial.

## Costos variables: LLM y WhatsApp

### LLM

El costo LLM depende de tokens, no de clientes.

Ejemplo de control recomendado:

- Demo: solo `mock`.
- Beta Basic: presupuesto LLM por workspace, por ejemplo USD 5-10/mes.
- Pro: presupuesto LLM por workspace, por ejemplo USD 20-50/mes.
- Enterprise: pass-through o precio con margen.

OpenAI publica precios por 1M tokens y modelos baratos como `gpt-4o-mini`, `gpt-5-nano` o `gpt-5-mini` pueden ser suficientes para agentes simples. Aun asi, sin cuota por workspace un cliente con agente activo 24/7 puede generar costo inesperado.

Controles obligatorios antes de escalar:

- contador de tokens por workspace.
- presupuesto diario/mensual.
- apagado automatico por exceso.
- fallback a humano o respuesta estatica si LLM falla.
- cache de system prompts.
- limites de longitud de historial.

### WhatsApp Cloud API

WhatsApp Business Platform cobra por mensaje entregado, con precio segun pais del destinatario y categoria: marketing, utility, authentication o service. Los mensajes de servicio dentro de la ventana de atencion pueden ser gratuitos segun reglas vigentes.

Implicacion:

- No usar un precio plano sin medir pais/categoria.
- Marketing puede ser mucho mas caro que utility/service.
- El costo debe pasarse al cliente o incluirse con margen y limites.
- La app debe registrar categoria, pais, cantidad y costo estimado por mensaje.

## Comparacion de opciones de hosting

| Opcion | Mejor para | Usar en | Evitar si |
|---|---|---|---|
| Oracle VPS Free | MVP, beta chica, costo cero | 1-10 clientes | Ya hay SLA, datos criticos o soporte diario. |
| VPS pagado simple | Separar Evolution barato | 10-50 clientes | No quieres administrar Linux. |
| Neon | Postgres managed costo/uso | 25+ clientes | Necesitas ecosistema Supabase completo. |
| Supabase | Postgres + dashboard + backups + posible RLS/storage | 25+ clientes | Solo quieres DB barata y minima. |
| Railway | Deploy rapido app/worker/Redis/Postgres por uso | 25-100 clientes | Costos variables sin control o Evolution con sesiones delicadas. |
| Render | App/worker/Postgres administrado simple | 25-100 clientes | Necesitas control fino o costos minimos. |
| Fly.io | Apps cerca del usuario, VMs pequenas, volumenes | 25-100 clientes | No quieres manejar detalles de maquinas/regiones. |
| AWS/GCP/Azure | Produccion seria, compliance, red privada, soporte | 100+ clientes o enterprise | Presupuesto bajo o equipo DevOps pequeno. |

## Decisiones tecnicas por etapa

### Antes de 10 clientes

- Cerrar checklist beta.
- Mantener single VPS si esta estable.
- No activar envio real por defecto.
- Definir limites por plan en DB y backend.
- Definir presupuesto LLM por workspace.

### Antes de 25 clientes

- Mover DB principal a managed Postgres si ya hay clientes pagos o datos sensibles.
- Mantener PostgreSQL Evolution separado.
- Agregar copia externa de backups.
- Migrar rate limit a Redis.
- Agregar pruebas E2E y cross-tenant.

### Antes de 50 clientes

- Separar workers.
- Separar Evolution por nodos.
- Agregar locks distribuidos.
- Crear `WhatsAppProvider` formal con capabilities.
- Implementar Cloud API para nuevos clientes elegibles.
- Agregar metricas historicas y alertas por cola/worker/instancia.

### Antes de 100 clientes

- App stateless con replicas.
- Managed Redis.
- Managed Postgres con PITR y connection pooling.
- Billing y cuotas reales.
- Admin panel.
- Incident response.
- Soporte formal.
- Cloud API como proveedor primario.

## Senales objetivas para migrar

### Base de datos a managed Postgres

Migrar si se cumple cualquiera:

- Hay clientes pagos reales.
- Restore manual no se prueba semanalmente.
- DB > 10 GB.
- Backups tardan > 30 minutos.
- p95 queries criticas > 300ms.
- conexiones > 60% del limite.
- el VPS es punto unico de perdida inaceptable.
- se requiere PITR.

### Separar Evolution API

Separar si se cumple cualquiera:

- Evolution causa > 30% CPU sostenido.
- Evolution usa > 4 GB RAM sostenidos.
- mas de 20-30 instancias conectadas.
- desconexiones generan soporte diario.
- actualizaciones de Evolution obligan a tocar app/DB principal.
- sesiones Evolution requieren backup/restauracion independiente.

### Separar workers

Separar si se cumple cualquiera:

- worker lag > 2 minutos repetidamente.
- mas de 5 campanas simultaneas.
- app web se ralentiza cuando hay envios.
- jobs duplicados o reinicios afectan envios.
- se necesita escalar trabajadores sin escalar web.

### Managed Redis

Migrar si se cumple cualquiera:

- mas de una replica app o worker.
- rate limit distribuido requerido.
- Redis self-hosted causa incidentes.
- se necesita persistencia/backup administrado.

### WhatsApp Cloud API oficial

Priorizar si se cumple cualquiera:

- cliente paga y requiere estabilidad.
- volumen > 1.000 mensajes/dia por cliente.
- se requiere cumplimiento formal.
- hay bloqueos/desconexiones frecuentes con Baileys.
- se necesitan templates, status oficiales y trazabilidad.
- se venden planes empresariales.

## Funcionalidades que deben cambiar antes de escalar

### Seguridad y multiusuario

- Tests cross-tenant automatizados.
- Helpers de ownership obligatorios en todos los endpoints nuevos.
- Rate limiting Redis-based.
- Audit logs consultables por admin.
- Roles internos y suspension de workspace.

### Campanas

- Idempotencia fuerte por mensaje.
- Locks por instancia.
- Una campana activa por instancia o scheduler justo por instancia.
- Limite de filas por importacion.
- Limite diario/hora por workspace y por instancia.
- Pausa automatica por tasa de fallo.
- Cost tracking por mensaje.

### Consentimiento

- Opt-in explicito por contacto.
- Fuente y fecha de consentimiento.
- Suppression list visible.
- Importaciones con declaracion de consentimiento.
- Bloquear `UNKNOWN` para envio real, salvo flujo legalmente aceptado y auditado.

### Evolution / WhatsApp

- `WhatsAppProvider` formal.
- Capabilities por proveedor.
- Contract tests para payloads Evolution.
- Cloud API provider.
- Webhook verifier por proveedor.
- Migracion por cliente/instancia.

### LLM

- Cuotas por workspace.
- Medicion de tokens/costo.
- Circuit breaker por workspace/provider.
- Historial truncado y resumido.
- Evaluaciones basicas de calidad.
- Fallback humano.

### Operacion

- Backups externos.
- Restore periodico probado.
- Runbook de incidentes.
- Status page.
- Monitoreo historico.
- Alertas con severidad.
- Release tags y rollback probado.

### Producto/SaaS

- Billing.
- Plan limits visibles.
- Admin panel.
- Terminos, privacidad y anti-spam.
- Onboarding y soporte.
- Data export/delete.

## Riesgos por etapa

| Etapa | Riesgo principal | Mitigacion |
|---|---|---|
| 1-5 | Perder datos por VPS unico | Backup externo + restore probado. |
| 10 | Soporte manual por Evolution | Limites bajos + monitoreo + separar si hay desconexiones. |
| 25 | DB y Evolution compiten por recursos | Managed Postgres + Evolution separado. |
| 50 | Workers duplican envios o saturan instancia | Locks distribuidos + particion por instancia. |
| 100 | SaaS sin compliance/soporte | Cloud API, billing, admin, runbooks, SLA beta claro. |

## Decision recomendada

Camino recomendado para WA Sender:

1. Mantener Oracle Free solo hasta beta chica y estable.
2. A 10 clientes, invertir primero en backups externos, alertas y soporte, no en redisenar todo.
3. A 25 clientes pagos, mover la DB principal a managed Postgres. Preferencia: Neon por costo o Supabase si se quiere ecosistema y posible RLS futuro.
4. A 25-50 clientes, separar Evolution API del servidor de app.
5. A 50 clientes, separar workers y Redis/rate-limit; iniciar WhatsApp Cloud API para nuevos clientes.
6. A 100 clientes, operar como SaaS real: app stateless, managed DB, managed Redis, worker pool, observabilidad, billing, soporte y Cloud API como proveedor primario.

Regla final:

- Evolution/Baileys sirve para MVP y beta tecnica.
- WhatsApp Cloud API oficial debe ser el camino para crecimiento comercial.
