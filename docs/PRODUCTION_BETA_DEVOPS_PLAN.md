# WA Sender - Production Beta DevOps Plan

## 1. Proposito

Este documento define la arquitectura DevOps recomendada para desplegar WA Sender en produccion beta sobre un VPS Oracle Cloud Always Free.

Contexto objetivo:

- Ubuntu 24.04 ARM64.
- 4 OCPU ARM.
- 24 GB RAM.
- 200 GB disco.
- Docker disponible.
- Dominio propio.
- Cloudflare disponible.
- 1 a 5 clientes iniciales.
- Presupuesto minimo posible.

No incluye codigo ni configuraciones ejecutables. Es una guia de arquitectura, operacion y decisiones.

## 2. Arquitectura recomendada para produccion beta

La arquitectura recomendada para beta es un despliegue single-server con Docker Compose, servicios privados por defecto y solo el reverse proxy expuesto a Internet.

Componentes principales:

- Reverse proxy HTTPS: Caddy recomendado para beta.
- Web app: Next.js App Router + TypeScript.
- Worker: proceso Node.js separado para BullMQ.
- PostgreSQL self-hosted.
- Redis self-hosted.
- Evolution API.
- Backup job.
- Monitoreo ligero.

Decision recomendada:

- Usar PostgreSQL self-hosted inicialmente para minimizar costo.
- Usar Caddy para HTTPS automatico y menor carga operativa.
- Usar Cloudflare como DNS y proxy para `app` y `api/webhooks` si no rompe webhooks ni websockets.
- Mantener Evolution API privada; la app debe ser el unico consumidor directo.
- No exponer PostgreSQL, Redis ni paneles internos publicamente.

Razonamiento:

- Para 1 a 5 clientes, el VPS propuesto tiene recursos suficientes.
- El mayor riesgo no es capacidad, sino operacion: backups, disco, seguridad, actualizaciones y caidas.
- Self-hosted reduce costo mensual, pero exige disciplina de backups y monitoreo.

## 3. Servicios en Docker Compose

Servicios recomendados:

- `caddy`
  - Reverse proxy.
  - TLS automatico.
  - Unico servicio expuesto por puertos 80 y 443.

- `web`
  - Next.js app.
  - Maneja UI, auth, API routes, webhooks y backend HTTP.
  - No debe ser accesible directamente desde Internet sin proxy.

- `worker`
  - BullMQ worker para campanas.
  - Ejecuta envios, scheduler y tareas diferidas.
  - Puede dividirse luego en `scheduler-worker` y `campaign-worker`.

- `postgres`
  - Base de datos principal.
  - Volumen persistente.
  - Red Docker privada.

- `redis`
  - Cola BullMQ, locks y scheduling.
  - Volumen opcional segun politica de persistencia.
  - Red Docker privada.

- `evolution-api`
  - Integracion WhatsApp QR/Baileys.
  - Red Docker privada.
  - Solo accesible por `web` y `worker`.

- `backup`
  - Job programado o contenedor auxiliar para `pg_dump`.
  - Puede ejecutarse como cron host o contenedor dedicado.

- `watchtower` o mecanismo equivalente
  - No recomendado para auto-update sin control en beta.
  - Preferible usar actualizaciones manuales con checklist.

- `uptime-kuma`
  - Opcional, recomendado si se quiere monitoreo visual barato.
  - Debe protegerse con auth fuerte y preferiblemente restringirse por Cloudflare Access o VPN.

No recomendado inicialmente:

- Kubernetes.
- Docker Swarm.
- Alta disponibilidad.
- Base de datos externa pagada si el presupuesto minimo es prioridad.
- Exponer Evolution API con subdominio publico para gestion directa.

## 4. Servicios publicos y privados

### 4.1 Publicos

Publicos mediante Caddy y Cloudflare:

- App principal:
  - `https://app.tudominio.com`

- Webhooks publicos necesarios:
  - `https://app.tudominio.com/api/webhooks/evolution`
  - Futuro: `https://app.tudominio.com/api/webhooks/whatsapp-cloud`

- Healthcheck publico basico:
  - `https://app.tudominio.com/api/health`
  - Debe devolver informacion minima, sin secretos ni estado interno detallado.

### 4.2 Privados

Privados dentro de Docker network:

- PostgreSQL.
- Redis.
- Evolution API.
- Worker BullMQ.
- Healthcheck profundo.
- Logs.
- Backups.
- Adminer, pgAdmin o herramientas similares si se usan temporalmente.

Regla:

- Si un servicio no necesita recibir trafico desde usuarios o proveedores externos, no debe tener puerto publicado al host.

## 5. Subdominios recomendados

Beta minima:

- `app.tudominio.com`
  - App principal y API routes.

- `status.tudominio.com`
  - Uptime Kuma o pagina de estado, opcional.
  - Recomendado proteger con Cloudflare Access si muestra informacion interna.

- `admin.tudominio.com`
  - No recomendado en beta salvo necesidad real.
  - Si existe, debe estar protegido por Cloudflare Access, VPN o allowlist.

- `evolution.tudominio.com`
  - No recomendado publicamente.
  - Solo usar si Evolution API exige callback externo directo y no puede resolverse via app.
  - Si se expone, debe tener auth fuerte, IP restrictions si aplican y nunca mostrar panel abierto.

Recomendacion:

- Empezar con un solo subdominio publico: `app.tudominio.com`.
- Usar rutas internas para webhooks en la misma app.

## 6. Estrategia con Cloudflare

### 6.1 DNS y proxy

Recomendacion inicial:

- DNS en Cloudflare.
- Proxy naranja activo para `app.tudominio.com` si los webhooks de Evolution API funcionan correctamente con proxy.
- SSL/TLS en modo Full Strict.
- Certificado valido en Caddy.

Ventajas:

- Oculta IP real parcialmente.
- Mitiga trafico basico malicioso.
- Facilita reglas WAF simples.
- Permite rate limits o reglas por pais si se requiere.

Precauciones:

- Confirmar que Evolution API puede enviar webhooks a URL proxied por Cloudflare.
- Confirmar soporte de websockets si alguna pantalla usa conexion persistente.
- No confiar en Cloudflare como unica capa de seguridad.

### 6.2 Cloudflare Tunnel

Uso recomendado:

- Considerarlo si no se quiere abrir puertos 80/443 directamente en el VPS.
- Util si Oracle Cloud firewall o redes complican exposicion.

Tradeoff:

- Reduce exposicion directa.
- Agrega dependencia operacional de `cloudflared`.
- Puede complicar depuracion inicial.

Recomendacion beta:

- Empezar con Caddy + Cloudflare DNS/proxy.
- Migrar a Cloudflare Tunnel si se quiere cerrar puertos o si hay problemas de exposicion.

### 6.3 Reglas Cloudflare recomendadas

- Activar SSL Full Strict.
- Redirigir HTTP a HTTPS.
- Bloquear metodos no usados en rutas sensibles.
- Rate limit para `/api/auth/*`, `/api/webhooks/*` y endpoints de acciones.
- Proteger `status` o `admin` con Cloudflare Access si existen.
- No cachear rutas de app autenticada ni API.

## 7. Requisitos minimos de CPU/RAM/disco

### 7.1 Para beta con 1 a 2 clientes

CPU:

- 2 OCPU ARM utiles como minimo.
- 4 OCPU ARM suficiente para beta.

RAM:

- Minimo operativo: 6 a 8 GB.
- Recomendado: 12 GB o mas.
- Disponible: 24 GB, suficiente.

Disco:

- Minimo operativo: 50 GB.
- Recomendado beta: 100 GB.
- Disponible: 200 GB, suficiente si hay rotacion de logs y backups.

### 7.2 Distribucion de recursos estimada

- Next.js web: 512 MB a 1.5 GB RAM.
- Worker BullMQ: 256 MB a 1 GB RAM.
- PostgreSQL: 1 GB a 4 GB RAM segun configuracion.
- Redis: 128 MB a 512 MB RAM.
- Evolution API: 512 MB a 2 GB RAM, variable por sesiones.
- Caddy: bajo consumo.
- Monitoreo ligero: 128 MB a 512 MB RAM.

### 7.3 Cuellos de botella esperados

- Evolution API si hay muchas instancias WhatsApp.
- PostgreSQL si crecen logs y mensajes sin retencion.
- Disco por backups, logs y sesiones de Evolution.
- Worker si se agregan demasiadas campanas concurrentes.

## 8. Riesgos de ARM64

Riesgos:

- Algunas imagenes Docker pueden no publicar builds ARM64.
- Dependencias nativas de Node.js pueden requerir compilacion.
- Evolution API o librerias asociadas a Chromium/Baileys pueden tener diferencias.
- Herramientas de monitoreo o backup pueden tener imagenes no multi-arch.
- Builds locales pueden diferir si el desarrollo se hace en Windows x64.

Mitigaciones:

- Confirmar soporte ARM64 de cada imagen antes de fijar stack.
- Usar imagenes oficiales multi-arch cuando sea posible.
- Construir imagenes en el propio VPS o con buildx multi-platform.
- Fijar versiones de imagenes, no usar `latest`.
- Probar Evolution API en ARM64 antes de comprometer piloto real.
- Mantener modo mock para aislar problemas de proveedor.

## 9. Plan de backups

### 9.1 Objetivos

Objetivo beta:

- RPO: maximo 24 horas de perdida aceptable inicialmente.
- RTO: restauracion manual en 2 a 6 horas.

Para clientes reales:

- Reducir RPO a 6 horas o menos si el uso crece.
- Probar restauracion antes de operar produccion real.

### 9.2 Que respaldar

Obligatorio:

- PostgreSQL via `pg_dump`.
- Variables de entorno y secretos, almacenados fuera del repositorio.
- Volumen/sesiones de Evolution API.
- Configuracion de Caddy.
- Docker Compose y archivos de despliegue.

Opcional:

- Redis, si se requiere conservar jobs tras reinicio.
- Logs resumidos.

No confiar solo en:

- Snapshots del volumen Docker.
- Volumen persistente local sin copia externa.

### 9.3 Frecuencia

Beta inicial:

- Backup PostgreSQL diario.
- Backup de Evolution sessions diario.
- Backup antes de cada actualizacion.
- Retencion local: 7 dias.
- Retencion externa: minimo 14 a 30 dias cuando haya clientes reales.

### 9.4 Destinos

Minimo costo:

- Copia local comprimida en otra carpeta del VPS.
- Descarga manual periodica a equipo local durante beta temprana.

Recomendado para beta real:

- Object Storage compatible S3.
- Oracle Object Storage si entra en presupuesto/free tier.
- Backblaze B2 o Cloudflare R2 si el costo es aceptable.

### 9.5 Pruebas de restauracion

Debe existir checklist para:

- Restaurar PostgreSQL en base limpia.
- Restaurar sesiones Evolution.
- Levantar stack en servidor nuevo.
- Verificar login, dashboard, campanas y estado de instancias.

Regla:

- Backup no probado no cuenta como backup confiable.

## 10. Plan de actualizacion

### 10.1 Politica de versiones

- Fijar tags de imagenes Docker.
- No usar `latest` en produccion beta.
- Mantener changelog interno.
- Separar `.env` de codigo.
- Hacer backup antes de migraciones.

### 10.2 Flujo recomendado

1. Revisar cambios.
2. Probar localmente o en entorno staging si existe.
3. Crear backup PostgreSQL y sesiones Evolution.
4. Aplicar migraciones de base de datos.
5. Descargar o construir nuevas imagenes.
6. Reiniciar servicios de forma controlada.
7. Revisar logs de `web`, `worker`, `postgres`, `redis` y `evolution-api`.
8. Ejecutar smoke test:
   - login.
   - dashboard.
   - instancia status.
   - campana mock.
   - healthcheck.
9. Mantener plan de rollback.

### 10.3 Rollback

Debe poder revertirse:

- Imagen `web`.
- Imagen `worker`.
- Migracion de DB cuando sea posible.
- Configuracion Caddy.

Precaucion:

- Migraciones destructivas deben evitarse en beta.
- Preferir migraciones expand/contract para cambios de datos importantes.

## 11. Plan de monitoreo

### 11.1 Monitoreo minimo

Healthchecks:

- App responde.
- DB accesible.
- Redis accesible.
- Worker vivo.
- Evolution API responde.

Metricas manuales o visibles:

- Uso CPU.
- Uso RAM.
- Uso disco.
- Contenedores reiniciando.
- Errores recientes de worker.
- Fallos de envio.
- Campanas atascadas.
- Instancias desconectadas.

### 11.2 Herramientas recomendadas

Minimo costo:

- Docker logs.
- `docker compose ps`.
- Healthchecks Docker.
- Cron de backup con logs.
- Alertas simples por email/Telegram si se implementan luego.

Recomendado beta:

- Uptime Kuma para HTTP checks.
- Netdata si se quiere visibilidad rapida del VPS.
- Sentry o alternativa para errores de app, si el plan gratuito alcanza.

Futuro:

- Prometheus + Grafana.
- Loki para logs centralizados.
- Alertmanager.

### 11.3 Alertas importantes

- App caida.
- Webhook devolviendo 5xx.
- Worker detenido.
- Redis caido.
- PostgreSQL caido.
- Disco > 80%.
- Backup fallido.
- Campanas en `running` sin progreso.
- Error repetido de Evolution API.

## 12. Checklist de seguridad

Red y exposicion:

- Solo puertos 80 y 443 publicos.
- SSH restringido por llave, no password.
- Firewall de Oracle Cloud configurado.
- Firewall del host activo.
- PostgreSQL no publicado.
- Redis no publicado.
- Evolution API no publicada salvo necesidad validada.

Aplicacion:

- Auth Google configurado con dominios correctos.
- Cookies seguras.
- `AUTH_SECRET` fuerte.
- No aceptar `userId` desde frontend.
- Validar workspace/tenant en cada recurso.
- Rate limiting en auth, webhooks y acciones sensibles.
- No exponer secrets al navegador.

Secrets:

- `.env` fuera de git.
- Rotacion manual documentada.
- API keys LLM solo server-side.
- Token Evolution solo server-side.
- Webhook secret obligatorio.

Datos:

- Backups cifrados si salen del servidor.
- Logs sin mensajes completos cuando no sea necesario.
- Retencion definida para mensajes y contactos.
- Exportaciones de contactos auditadas.

WhatsApp y anti-abuso:

- Delay minimo obligatorio.
- Limites diarios por plan.
- Confirmacion explicita antes de campanas reales.
- No usar contactos extraidos sin opt-in/confirmacion.
- Pausa y stop disponibles.
- No disenar evasion de limites ni envio agresivo.

Operacion:

- Backups probados.
- Actualizaciones con rollback.
- Imagenes con version fija.
- Monitoreo de disco.
- Revisar logs despues de deploy.

## 13. Costos estimados por cliente sin LLM

Supuestos:

- Oracle Cloud Always Free usado correctamente.
- PostgreSQL, Redis, worker y Evolution self-hosted.
- No se incluye costo LLM.
- No se incluye costo legal, soporte ni tiempo operativo.
- No se incluye WhatsApp Cloud API oficial.

Costos fijos mensuales aproximados:

- VPS Oracle Always Free: USD 0.
- Docker/self-hosted: USD 0.
- Cloudflare DNS/proxy plan free: USD 0.
- Dominio: depende del dominio, aproximar USD 1 a 2 por mes prorrateado si cuesta USD 12 a 24 por anio.
- Backups externos: USD 0 a 5 por mes inicialmente, segun proveedor y volumen.
- Monitoreo basico: USD 0 si se usa Uptime Kuma/self-hosted.

Costo marginal por cliente sin LLM:

- Con 1 a 5 clientes: cercano a USD 0 adicional si el VPS soporta la carga.
- Costo real operativo: tiempo de soporte, mantenimiento, backups y resolucion de desconexiones.

Estimacion practica:

- Beta muy temprana sin backup externo pagado: USD 0 a 2/mes total, excluyendo dominio ya comprado.
- Beta con backup externo basico: USD 1 a 7/mes total.
- Por cliente con 5 clientes: USD 0.20 a 1.40/mes si se reparte solo infraestructura externa minima.

Advertencia:

- El costo tecnico puede ser bajo, pero el soporte operativo por WhatsApp QR/Evolution puede ser el costo dominante.

## 14. Cuando migrar a infraestructura mas grande

Migrar o redisenar cuando ocurra cualquiera de estas condiciones:

- Mas de 5 a 10 clientes activos.
- Mas de 10 a 20 instancias WhatsApp conectadas.
- CPU sostenida > 70%.
- RAM sostenida > 75%.
- Disco > 70% con crecimiento rapido.
- Backups tardan demasiado o impactan produccion.
- Campanas quedan atrasadas por falta de worker.
- Necesidad de SLA o disponibilidad comercial.
- Necesidad de staging separado.
- Necesidad de workers horizontales.
- Necesidad de base de datos administrada.
- Incidentes frecuentes por caidas del VPS.
- Evolution API consume recursos o falla de forma aislable.

Ruta de crecimiento recomendada:

1. Separar staging y produccion.
2. Mover backups a object storage.
3. Separar Evolution API si consume muchos recursos.
4. Separar worker en uno o mas procesos dedicados.
5. Mover PostgreSQL a instancia administrada o VPS dedicado.
6. Mover Redis a servicio dedicado si la cola crece.
7. Adoptar WhatsApp Cloud API para clientes que requieran cumplimiento oficial.

## 15. Decisiones que deben registrarse en PROJECT_BRIEF.md

Decisiones DevOps recomendadas para registrar:

- Produccion beta inicia en single VPS Oracle Cloud Always Free.
- Docker Compose sera el orquestador inicial.
- PostgreSQL self-hosted sera la opcion recomendada para beta por costo minimo, con Supabase como alternativa futura si se prioriza reducir carga operativa.
- Redis self-hosted sera usado para BullMQ.
- Caddy sera el reverse proxy recomendado para beta por HTTPS automatico y simplicidad.
- Cloudflare se usara inicialmente para DNS y proxy; Cloudflare Tunnel queda como alternativa si se quiere cerrar puertos publicos.
- Solo Caddy expondria puertos 80/443.
- PostgreSQL, Redis, Evolution API y workers deben permanecer privados.
- Subdominio publico inicial recomendado: `app.tudominio.com`.
- Evolution API no debe exponerse publicamente salvo necesidad tecnica validada.
- Backups diarios de PostgreSQL y sesiones Evolution son obligatorios antes de piloto real.
- Deben probarse restauraciones antes de clientes reales.
- Debe existir monitoreo minimo de app, DB, Redis, worker, Evolution API, disco y backups.
- Imagenes Docker deben fijarse por version; no usar `latest` en produccion beta.
- ARM64 debe validarse con las imagenes reales antes del piloto.

