# WA Sender - Observability

## Objetivo

Cubrir la capa minima de observabilidad para beta y responder estas preguntas rapidamente:

- si la app esta caida.
- si Evolution API esta caida.
- si Redis o PostgreSQL estan caidos.
- si el worker dejo de procesar campanas.
- si hay instancias WhatsApp desconectadas.
- si el LLM esta fallando.
- si el disco se esta llenando.

## Decision implementada

La beta usa una capa simple y barata:

- `GET /api/health`: health publico y liviano para disponibilidad de la app.
- `GET /api/health/deep`: health interno con chequeos operativos.
- Docker healthchecks para contenedores clave.
- `app-worker` con heartbeat en Redis y archivo local.
- `uptime-kuma` opcional en Docker Compose.
- Logs Docker como fuente principal de investigacion.
- Alertas simples recomendadas desde Uptime Kuma por Telegram o email.

No se agrega Prometheus, Grafana ni Loki en esta fase.

## Endpoints

### `GET /api/health`

Uso:

- reverse proxy.
- Docker healthcheck de `next-app`.
- Uptime Kuma externo.

Respuesta:

```json
{
  "ok": true,
  "service": "wa-sender",
  "status": "ok",
  "checkedAt": "2026-05-08T..."
}
```

### `GET /api/health/deep`

Uso:

- chequeo interno de operacion real.
- Uptime Kuma dentro de la red Docker.
- debugging del estado de beta.

Proteccion:

- requiere `HEALTHCHECK_TOKEN` por header `x-healthcheck-token` o query `?token=...` si la variable esta definida.

Chequeos:

- database.
- redis.
- evolution.
- worker heartbeat.
- instancias WhatsApp desconectadas o en error.
- fallos recientes del LLM.
- uso de disco del contenedor/app host path.

Estados:

- `ok`: todo sano.
- `warn`: algo degradado pero no caido.
- `fail`: hay una falla operativa importante.

Regla:

- `fail` responde `503`.
- `ok` y `warn` responden `200`.

## Worker heartbeat

El worker escribe:

- clave Redis `wa-sender:worker:heartbeat` por defecto.
- archivo local `/tmp/wa-sender-worker-heartbeat.json`.

Objetivo:

- Docker detecta si el worker esta vivo.
- `/api/health/deep` detecta si el heartbeat quedo stale.

Variables:

```text
WORKER_HEARTBEAT_KEY=wa-sender:worker:heartbeat
WORKER_HEARTBEAT_INTERVAL_MS=30000
WORKER_HEARTBEAT_STALE_SECONDS=120
```

## Metricas minimas

Sin agregar stack de metricas dedicado, la beta expone estas senales:

- app status.
- db status.
- redis status.
- evolution status.
- worker heartbeat age.
- cantidad de instancias desconectadas.
- cantidad de fallos LLM recientes en 15 minutos.
- porcentaje de disco usado.

LLM:

- los fallos LLM en playground quedan registrados en `audit_logs` con `resource_type=llm`.

WhatsApp:

- si hay instancias `DISCONNECTED` o `ERROR`, el deep health responde `warn`.

## Uptime Kuma opcional

El servicio ya existe en `docker-compose.yml` y queda bajo perfil `monitoring`.

Levantar:

```bash
docker compose --env-file .env.production --profile monitoring up -d uptime-kuma
```

Monitores recomendados:

1. `https://app.midominio.com/api/health`
2. `http://next-app:3000/api/health/deep?token=...`
3. `http://evolution-api:8080`
4. TCP `postgres-app:5432`
5. TCP `redis:6379`

Nota:

- `uptime-kuma` ahora comparte `edge`, `app_net` y `evolution_net` para poder monitorear servicios publicos e internos.

## Alertas recomendadas

Para beta:

- Telegram: mejor opcion por costo cero y velocidad.
- Email: util como respaldo.

Alertas minimas:

1. `api/health` cae.
2. `api/health/deep` responde `fail`.
3. Evolution API no responde.
4. Worker stale o sin heartbeat.
5. Disco >= 85%.
6. Backup no generado en 24h.

No alertar por cada `warn` menor sin revisar ruido.

## Checklist diario

1. Revisar Uptime Kuma.
2. Revisar `GET /api/health/deep`.
3. Revisar ultimo backup generado.
4. Revisar instancias WhatsApp desconectadas.
5. Revisar errores recientes de `next-app`, `app-worker` y `evolution-api`.

## Checklist semanal

1. Revisar uso de disco.
2. Revisar crecimiento de `campaign_events` y `audit_logs`.
3. Confirmar que el worker sigue marcando heartbeat.
4. Revisar fallos LLM recientes y su causa.
5. Probar restore de backup en base temporal si hubo cambios importantes.

## Logs y comandos

App:

```bash
docker compose --env-file .env.production logs -f next-app
```

Worker:

```bash
docker compose --env-file .env.production logs -f app-worker
```

Evolution:

```bash
docker compose --env-file .env.production logs -f evolution-api
```

Redis:

```bash
docker compose --env-file .env.production logs -f redis
```

PostgreSQL app:

```bash
docker compose --env-file .env.production logs -f postgres-app
```

PostgreSQL evolution:

```bash
docker compose --env-file .env.production logs -f postgres-evolution
```

Backup:

```bash
docker compose --env-file .env.production logs -f postgres-backup
```

Estado de contenedores:

```bash
docker compose --env-file .env.production ps
```

Deep health:

```bash
curl -H "x-healthcheck-token: $HEALTHCHECK_TOKEN" https://app.midominio.com/api/health/deep
```

## Cambios concretos en Compose

Aplicados:

- `app-worker` ahora publica heartbeat en Redis y archivo local.
- `app-worker` usa healthcheck real basado en stale heartbeat.
- `uptime-kuma` comparte redes internas para monitoreo.

No aplicados:

- alertas automaticas por Telegram o email desde codigo.
- stack pesado de metricas.

## Riesgos y limites

- El deep health no reemplaza monitoreo historico.
- El chequeo de disco se hace desde el filesystem visible para la app; sirve como senal minima, no como observabilidad completa del host.
- Las instancias desconectadas se detectan por estado persistido; si nadie refresca estado y no llega webhook, puede haber retraso.
- Los fallos LLM cubren playground y cualquier flujo que registre `resource_type=llm`; no son aun una cobertura universal de todos los usos futuros.
