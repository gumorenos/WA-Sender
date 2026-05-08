# WA Sender

WA Sender es una app SaaS para conectar instancias de WhatsApp, crear campanas controladas, extraer numeros con controles de privacidad y probar agentes IA. El MVP usa Next.js App Router, TypeScript, Auth.js, PostgreSQL self-hosted, Redis, BullMQ, Evolution API y proveedores LLM por adapter.

## Prerequisitos

Local:

- Node.js 20 LTS.
- npm.
- Docker y Docker Compose.
- Git.
- Cuenta Google Cloud OAuth para login con Google.

Produccion beta:

- VPS Oracle Cloud Ubuntu 24.04 ARM64.
- Docker y Docker Compose instalados.
- Dominio propio en Cloudflare.
- Puertos publicos 80/443 apuntando a Caddy.
- SSH restringido por IP administradora.

## Estructura de despliegue

Produccion beta usa `docker-compose.yml`.

Servicios:

- `caddy`: unico punto publico, expone 80/443.
- `next-app`: app Next.js privada en Docker.
- `app-worker`: worker BullMQ/campanas privado.
- `postgres-app`: PostgreSQL principal privado.
- `redis`: Redis privado.
- `evolution-api`: Evolution API privada.
- `postgres-evolution`: PostgreSQL separado para Evolution.
- `postgres-backup`: backups diarios.
- `uptime-kuma`: opcional con perfil `monitoring`.

Local usa `docker-compose.local.yml` para dependencias. Publica solo en `127.0.0.1`, no en todas las interfaces.

## Instalacion local

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env` desde el ejemplo:

```bash
cp .env.example .env
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Levantar dependencias locales:

```bash
docker compose -f docker-compose.local.yml up -d postgres-app redis
```

Si quieres probar Evolution real local:

```bash
docker compose -f docker-compose.local.yml up -d postgres-app redis postgres-evolution evolution-api
```

4. Generar Prisma y aplicar migraciones:

```bash
npm run db:generate
npm run db:migrate
```

5. Correr app:

```bash
npm run dev
```

6. Correr worker en otra terminal:

```bash
npm run dev:worker
```

App local:

```text
http://localhost:3000
```

## Scripts npm

```bash
npm run dev          # Next.js dev server
npm run dev:worker   # Worker local de campanas
npm run build        # Build de produccion
npm run lint         # ESLint
npm run test         # Vitest
npm run db:generate  # Prisma generate
npm run db:migrate   # Prisma migrate dev
npm run db:deploy    # Prisma migrate deploy
npm run worker       # Worker en modo produccion/compose
```

## Variables de entorno

Archivos versionados:

- `.env.example`: desarrollo local.
- `.env.production.example`: produccion beta.

Archivos reales no versionados:

- `.env`
- `.env.production`

Reglas:

- No subir secretos reales a Git.
- No usar `NEXT_PUBLIC_*` para secretos.
- `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `AUTH_GOOGLE_SECRET` y `HEALTHCHECK_TOKEN` son server-side.
- `NEXT_PUBLIC_APP_URL` puede ser publico.

## Configurar Google OAuth

En Google Cloud Console:

1. Crear OAuth Client ID tipo Web Application.
2. Configurar redirect local:

```text
http://localhost:3000/api/auth/callback/google
```

3. Configurar redirect produccion:

```text
https://app.midominio.com/api/auth/callback/google
```

4. Configurar en `.env` o `.env.production`:

```env
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_SECRET=...
NEXTAUTH_SECRET=...
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
```

Para generar secreto:

```bash
openssl rand -base64 32
```

## Configurar Evolution API

Local mock recomendado:

```env
EVOLUTION_MOCK=true
MOCK_WHATSAPP_ENABLED=true
REAL_SENDING_ENABLED=false
EVOLUTION_API_BASE_URL=http://localhost:8080
```

Local real con `docker-compose.local.yml`:

```env
EVOLUTION_MOCK=false
MOCK_WHATSAPP_ENABLED=false
REAL_SENDING_ENABLED=false
EVOLUTION_API_BASE_URL=http://localhost:8080
EVOLUTION_API_KEY=local-evolution-api-key
```

Produccion beta:

```env
EVOLUTION_API_BASE_URL=http://evolution-api:8080
EVOLUTION_API_KEY=replace-with-strong-evolution-api-key
EVOLUTION_WEBHOOK_SECRET=replace-with-strong-webhook-secret
REAL_SENDING_ENABLED=false
```

Regla beta:

- Evolution API no publica puerto directo en `docker-compose.yml`.
- La app y el worker la consumen por red Docker interna.
- Si se activa `evo.midominio.com`, debe usarse Caddy con basic auth y preferiblemente Cloudflare Access.

## Probar QR

Modo mock:

1. `EVOLUTION_MOCK=true`.
2. Inicia sesion.
3. Abre `/instances`.
4. Crea instancia.
5. Abre el modal QR.
6. El QR debe generarse sin contactar WhatsApp real.

Modo Evolution real local:

1. Levantar Evolution:

```bash
docker compose -f docker-compose.local.yml up -d postgres-evolution evolution-api
```

2. Configurar `.env`:

```env
EVOLUTION_MOCK=false
EVOLUTION_API_BASE_URL=http://localhost:8080
EVOLUTION_API_KEY=local-evolution-api-key
```

3. Reiniciar `npm run dev`.
4. Crear instancia y refrescar QR.

## Probar campana mock

1. Mantener:

```env
REAL_SENDING_ENABLED=false
EVOLUTION_MOCK=true
MOCK_WHATSAPP_ENABLED=true
```

2. Crear una instancia mock.
3. Ir a `/campaigns/create`.
4. Pegar datos con dos columnas:

```text
51999888777\tHola {nombre}
5215512345678\tMensaje de prueba
```

5. Guardar campana.
6. Ir a `/campaigns/send`.
7. Programarla con delay conservador.
8. Correr worker:

```bash
npm run dev:worker
```

9. Revisar `/campaigns/status`.

## Probar playground con LLM mock

Configurar:

```env
LLM_PROVIDER=mock
MOCK_LLM_ENABLED=true
```

Pasos:

1. Crear agente manual o builder.
2. Activarlo.
3. Ir a `/agents/playground`.
4. Seleccionar agente.
5. Enviar mensaje.
6. Debe responder sin consumir API externa.

## Docker Compose produccion beta

1. Crear `.env.production`:

```bash
cp .env.production.example .env.production
```

2. Editar valores reales:

- `APP_HOST`
- `CADDY_EMAIL`
- `AUTH_SECRET`
- `NEXTAUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `EVOLUTION_API_KEY`
- `EVOLUTION_WEBHOOK_SECRET`
- `HEALTHCHECK_TOKEN`

3. Construir imagen:

```bash
docker compose --env-file .env.production build next-app app-worker
```

4. Levantar bases e infraestructura:

```bash
docker compose --env-file .env.production up -d postgres-app redis postgres-evolution evolution-api
```

5. Aplicar migraciones:

```bash
docker compose --env-file .env.production --profile migrate run --rm app-migrate
```

6. Levantar app, worker, Caddy y backup:

```bash
docker compose --env-file .env.production up -d caddy next-app app-worker postgres-backup
```

7. Ver estado:

```bash
docker compose --env-file .env.production ps
```

8. Ver logs:

```bash
docker compose --env-file .env.production logs -f next-app
```

## Caddy y dominios

Caddy base:

```text
docker/caddy/Caddyfile
```

Publica solo:

```text
app.midominio.com -> next-app:3000
```

Opcionales:

- `docker/caddy/Caddyfile.evolution.example`: app + Evolution con basic auth.
- `docker/caddy/Caddyfile.full.example`: app + Evolution + Uptime Kuma.

No actives `evo.midominio.com` salvo necesidad administrativa clara.

## Cloudflare y Oracle Cloud

DNS recomendado:

```text
app.midominio.com A ORACLE_PUBLIC_IP Proxied
```

Opcional:

```text
status.midominio.com A ORACLE_PUBLIC_IP Proxied
```

No crear `evo.midominio.com` por defecto.

Puertos abiertos en Oracle:

```text
80/tcp  public
443/tcp public
22/tcp  solo ADMIN_PUBLIC_IP/32
```

Puertos cerrados al publico:

```text
3000, 5432, 6379, 8080, 3001
```

En `docker-compose.yml`, solo Caddy usa `ports`. PostgreSQL, Redis, Evolution, app y worker usan `expose` o redes internas.

## Uptime Kuma opcional

Levantar:

```bash
docker compose --env-file .env.production --profile monitoring up -d uptime-kuma
```

Para publicarlo por `status.midominio.com`, copiar deliberadamente:

```bash
cp docker/caddy/Caddyfile.full.example docker/caddy/Caddyfile
docker compose --env-file .env.production up -d caddy
```

## Backups

Servicio:

```bash
docker compose --env-file .env.production up -d postgres-backup
```

Backup manual:

```bash
docker compose --env-file .env.production run --rm postgres-backup sh /scripts/backup.sh
```

Restore y prueba de restore estan documentados en:

```text
docs/BACKUP_RESTORE.md
```

## Healthchecks

Publico:

```bash
curl -i https://app.midominio.com/api/health
```

Profundo con token:

```bash
curl -H "x-healthcheck-token: $HEALTHCHECK_TOKEN" https://app.midominio.com/api/health/deep
```

En produccion, `/api/health/deep` sin token debe responder `401`.

## Comandos de verificacion

```bash
npm run lint
npm run test
npm run build
```

Compose local:

```bash
docker compose -f docker-compose.local.yml config
docker compose -f docker-compose.local.yml ps
```

Compose produccion con example sin secretos reales:

```bash
COMPOSE_ENV_FILE=.env.production.example docker compose --env-file .env.production.example config
```

## Riesgos pendientes

- Validar compatibilidad ARM64 de `atendai/evolution-api:v2.1.1` antes de beta.
- Probar restore antes de operar con clientes reales.
- No activar envio real hasta tener consentimiento, terminos y monitoreo operativo.
- Mover rate limiting a Redis si se escala a multiples replicas.
