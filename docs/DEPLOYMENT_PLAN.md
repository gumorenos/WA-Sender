# WA Sender - Deployment Plan: Dominio, DNS y HTTPS

## 1. Objetivo

Definir la configuracion recomendada de dominio, DNS, HTTPS, puertos y proteccion de servicios para desplegar WA Sender en Oracle Cloud usando Cloudflare.

Este documento se basa en `docs/PROJECT_BRIEF.md` y deja persistida la decision para siguientes fases. No asume que ya exista `docker-compose.yml` ni `Caddyfile`.

## 2. Contexto de despliegue

- Dominio propio gestionado en Cloudflare.
- Servidor objetivo: Oracle Cloud Always Free.
- Sistema esperado: Ubuntu 24.04 ARM64.
- Contenedores: Docker Compose.
- Subdominios tentativos:
  - `app.midominio.com`: aplicacion web WA Sender.
  - `evo.midominio.com`: Evolution API, solo si se decide exponerla de forma protegida.
  - `status.midominio.com`: monitoreo/status opcional.

Valores que deben reemplazarse:

- `midominio.com`: dominio real.
- `ORACLE_PUBLIC_IP`: IP publica IPv4 de la instancia Oracle.
- `ADMIN_PUBLIC_IP`: IP publica desde donde administraras por SSH.
- `TUNNEL_UUID`: UUID del Cloudflare Tunnel si se usa.

## 3. Evaluacion de alternativas

### 3.1 Alternativa A: DNS A record a Oracle + Caddy HTTPS

Descripcion:

- Cloudflare DNS apunta `app.midominio.com` al IP publico de Oracle.
- Cloudflare queda en modo proxied para web.
- Caddy escucha en Oracle en puertos 80/443 y hace reverse proxy a los contenedores internos.
- Caddy gestiona HTTPS en el origin con certificados validos o se usa certificado Origin CA de Cloudflare.

Ventajas:

- Simple de entender y operar.
- Compatible con OAuth, webhooks, websockets y reverse proxy tradicional.
- Menos dependencia operativa de Cloudflare Tunnel.
- Facil de depurar con `curl` y logs del servidor.

Desventajas:

- Requiere abrir 80/443 en Oracle.
- La IP del origin puede quedar expuesta por errores historicos de DNS o servicios no proxied.
- Requiere hardening del firewall.

Uso recomendado:

- `app.midominio.com`.
- `status.midominio.com` si se expone una pagina de status.

### 3.2 Alternativa B: Cloudflare Tunnel

Descripcion:

- `cloudflared` corre en el servidor o como contenedor.
- No se abren puertos HTTP/HTTPS entrantes.
- Cloudflare enruta hostnames publicos a servicios internos.

Ventajas:

- Reduce exposicion directa del VPS.
- No requiere abrir 80/443.
- Facilita proteger servicios internos con Cloudflare Access.
- Util para exponer Evolution API solo al administrador o a rutas concretas.

Desventajas:

- Agrega dependencia operativa de `cloudflared`.
- Si el tunnel cae, el servicio publico cae aunque la app siga viva.
- Depuracion puede ser menos directa.
- Hay que proteger bien el token del tunnel.

Uso recomendado:

- `evo.midominio.com` solo si se necesita acceso externo administrativo.
- Entornos donde se quiere mantener cerrado todo ingreso HTTP al VPS.

### 3.3 Alternativa C: combinacion

Descripcion:

- `app.midominio.com` y opcionalmente `status.midominio.com` usan DNS A proxied a Oracle + Caddy.
- Evolution API se mantiene interna dentro de Docker.
- Si se necesita `evo.midominio.com`, se publica por Cloudflare Tunnel y Cloudflare Access, no por A record abierto.

Ventajas:

- Mantiene simple el acceso principal a la app.
- Reduce el riesgo de exponer Evolution API.
- Permite operar beta con menos piezas criticas que un tunnel para todo.
- Permite agregar tunnel solo donde aporta seguridad.

Desventajas:

- Hay dos patrones de exposicion si se habilita `evo`.
- Requiere documentar bien que Evolution API no es una API publica del producto.

## 4. Recomendacion para beta

Recomendacion: usar la alternativa C.

Decision:

- `app.midominio.com`: Cloudflare DNS proxied A record hacia Oracle + Caddy.
- `status.midominio.com`: opcional, Cloudflare DNS proxied A record hacia Oracle + Caddy.
- `evo.midominio.com`: disponible en el `Caddyfile` de beta, pero solo debe crearse en DNS si se necesita acceso administrativo externo.
- Evolution API no publica puertos Docker; si se accede externamente, siempre sera mediante Caddy con `basicauth` y preferiblemente Cloudflare Access.
- WA Sender backend y worker consumen Evolution API por red interna Docker usando `http://evolution-api:8080`.
- Si necesitas una proteccion mas fuerte para Evolution, usar Cloudflare Tunnel + Cloudflare Access y desactivar DNS publico directo.
- El `Caddyfile` activo por defecto publica solo `app.midominio.com`; los bloques para `evo` y `status` quedan en archivos `.example` para activarlos deliberadamente cuando existan DNS y controles de acceso.

Razon tecnica:

- La app web necesita una entrada publica estable para usuarios, OAuth y posibles webhooks.
- Evolution API maneja sesiones, tokens y acciones de envio; exponerla como subdominio publico aumenta el riesgo sin aportar valor al usuario final.
- Caddy simplifica HTTPS en el origin.
- Cloudflare proxy agrega capa de proteccion y configuracion DNS centralizada.

## 5. Registros DNS exactos

### 5.1 Configuracion recomendada para beta

En Cloudflare DNS:

```text
Type: A
Name: app
Content: ORACLE_PUBLIC_IP
Proxy status: Proxied
TTL: Auto
```

```text
Type: A
Name: status
Content: ORACLE_PUBLIC_IP
Proxy status: Proxied
TTL: Auto
```

No crear `evo` por defecto.

Si Cloudflare requiere el hostname completo:

```text
app.midominio.com     A     ORACLE_PUBLIC_IP     Proxied
status.midominio.com  A     ORACLE_PUBLIC_IP     Proxied
```

### 5.2 Si se decide exponer Evolution API temporalmente con Tunnel

Crear un Cloudflare Tunnel llamado, por ejemplo:

```text
wa-sender-evo
```

Public hostname:

```text
Hostname: evo.midominio.com
Service: http://evolution-api:8080
Protection: Cloudflare Access obligatorio
```

El DNS normalmente queda como CNAME gestionado por Cloudflare Tunnel:

```text
Type: CNAME
Name: evo
Target: TUNNEL_UUID.cfargotunnel.com
Proxy status: Proxied
TTL: Auto
```

Regla:

- No usar `A evo -> ORACLE_PUBLIC_IP` salvo en emergencia controlada y con protecciones estrictas.

### 5.3 Si se usa Tunnel para todo

No recomendado como primera opcion beta, pero valido si se quiere cerrar 80/443.

```text
Type: CNAME
Name: app
Target: TUNNEL_UUID.cfargotunnel.com
Proxy status: Proxied
TTL: Auto
```

```text
Type: CNAME
Name: status
Target: TUNNEL_UUID.cfargotunnel.com
Proxy status: Proxied
TTL: Auto
```

```text
Type: CNAME
Name: evo
Target: TUNNEL_UUID.cfargotunnel.com
Proxy status: Proxied
TTL: Auto
```

## 6. Configuracion Cloudflare recomendada

### 6.1 SSL/TLS

Configurar:

- SSL/TLS mode: `Full (strict)`.
- Always Use HTTPS: enabled.
- Automatic HTTPS Rewrites: enabled.
- Minimum TLS Version: 1.2 o superior.

Razon:

- `Full (strict)` cifra navegador -> Cloudflare y Cloudflare -> origin, validando el certificado del origin.
- No usar `Flexible` para una app con login, sesiones y datos personales.

### 6.2 DNS proxy

Para web:

- `app`: proxied.
- `status`: proxied si se expone.

Para servicios no HTTP:

- No crear registros publicos salvo necesidad explicita.

### 6.3 Reglas de seguridad recomendadas

Para `app.midominio.com`:

- WAF gestionado habilitado si esta disponible.
- Rate limiting para rutas sensibles:
  - `/api/auth/*`
  - `/api/campaigns/*`
  - `/api/webhooks/*`
- Bloquear paises no relevantes solo si hay razon operativa clara.
- No cachear rutas autenticadas ni API.

Cache rules:

- Bypass cache para:
  - `/api/*`
  - `/auth/*`
  - rutas privadas del dashboard.
- Cache normal para assets estaticos de Next.js:
  - `/_next/static/*`.

Para `evo.midominio.com` si existe:

- Cloudflare Access obligatorio.
- Permitir solo emails administradores.
- Idealmente usar tunnel, no A record.
- No cache.
- No exponerlo a usuarios finales.

### 6.4 Origin hardening

Opcional recomendado despues de validar beta:

- Permitir trafico 80/443 solo desde rangos IP de Cloudflare en el firewall del servidor.
- Mantener SSH limitado a `ADMIN_PUBLIC_IP`.
- Si se usa Tunnel para todo, cerrar 80/443.

## 7. Configuracion Caddy recomendada

### 7.1 Caddyfile para beta con A record + Cloudflare proxied

Ejemplo conceptual:

```caddyfile
{
    email admin@midominio.com
}

app.midominio.com {
    encode zstd gzip

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
    }

    reverse_proxy web:3000
}

status.midominio.com {
    encode zstd gzip

    reverse_proxy status:3001
}
```

Notas:

- `web:3000` debe ser el nombre del servicio Docker de Next.js.
- `status:3001` puede ser Uptime Kuma u otro servicio de status.
- Si no hay servicio de status, no configurar ese bloque todavia.

### 7.2 No publicar Evolution API con Caddy por defecto

No incluir este bloque en beta:

```caddyfile
evo.midominio.com {
    reverse_proxy evolution-api:8080
}
```

Si temporalmente se expone por Caddy, debe tener al menos:

- Autenticacion adicional.
- Restriccion por IP.
- Rate limit.
- Sin cache.
- Logs revisados.

Ejemplo solo para emergencia administrativa:

```caddyfile
evo.midominio.com {
    basicauth {
        admin HASH_GENERADO_POR_CADDY
    }

    reverse_proxy evolution-api:8080
}
```

Preferencia:

- Usar Cloudflare Tunnel + Cloudflare Access para `evo`, no Caddy publico.

## 8. Configuracion Nginx alternativa

Nginx es valido, pero para beta Caddy es mas simple por HTTPS automatico.

Ejemplo conceptual:

```nginx
server {
    listen 80;
    server_name app.midominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.midominio.com;

    ssl_certificate /etc/letsencrypt/live/app.midominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.midominio.com/privkey.pem;

    location / {
        proxy_pass http://web:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 9. Puertos a abrir en Oracle

### 9.1 Para recomendacion beta A/C

Abrir en Oracle Security List o Network Security Group:

```text
TCP 80   desde 0.0.0.0/0       HTTP para redireccion y ACME/Cloudflare
TCP 443  desde 0.0.0.0/0       HTTPS publico
TCP 22   solo desde ADMIN_PUBLIC_IP/32
```

Despues de estabilizar:

- Evaluar limitar 80/443 solo a rangos Cloudflare.
- Mantener 22 siempre restringido a tu IP o a una VPN.

### 9.2 Para Cloudflare Tunnel completo

No abrir 80/443.

Abrir:

```text
TCP 22 solo desde ADMIN_PUBLIC_IP/32
```

Permitir salida del servidor hacia Cloudflare:

```text
Outbound TCP 7844
Outbound UDP 7844
Outbound TCP 443
```

Nota:

- `cloudflared` requiere salida hacia la red de Cloudflare. La documentacion de Cloudflare indica puerto 7844 TCP/UDP para tunnel.

## 10. Puertos a mantener cerrados

Mantener cerrados al publico:

```text
TCP 3000  Next.js interno
TCP 3001  status interno si existe
TCP 5432  PostgreSQL
TCP 6379  Redis
TCP 8080  Evolution API interno
TCP 8081  paneles internos si existen
TCP 9090  metricas internas si existen
TCP 5555  Prisma Studio u otras herramientas dev
```

Regla:

- Ningun contenedor de aplicacion, DB, Redis o Evolution debe publicar puertos directamente a internet.
- Solo Caddy/Nginx o Cloudflare Tunnel deben actuar como entrada.

## 11. Como proteger Evolution API

Decision beta:

- Evolution API no debe ser publica.
- WA Sender backend se comunica con Evolution API por red interna Docker.
- El frontend nunca llama Evolution API directamente.
- `EVOLUTION_API_KEY` solo vive en backend/worker.

Controles:

- No mapear `8080:8080` en `docker-compose.yml`.
- Usar red Docker interna.
- Configurar API key fuerte.
- Configurar webhook secret fuerte.
- Solo aceptar webhooks esperados.
- Registrar eventos resumidos, no secretos.
- Rotar API key si se expone accidentalmente.

Si se necesita `evo.midominio.com`:

- Usar Cloudflare Tunnel.
- Activar Cloudflare Access.
- Permitir solo administradores.
- No cachear.
- Deshabilitar cuando no se use.
- No conectar usuarios finales a ese subdominio.

## 12. Como validar que HTTPS funciona

### 12.1 Validacion DNS

Desde una terminal:

```bash
dig app.midominio.com
dig status.midominio.com
```

Esperado con Cloudflare proxied:

- La respuesta puede mostrar IPs de Cloudflare, no el IP real de Oracle.

### 12.2 Validacion HTTP a HTTPS

```bash
curl -I http://app.midominio.com
```

Esperado:

```text
HTTP/1.1 301
location: https://app.midominio.com/...
```

### 12.3 Validacion HTTPS

```bash
curl -I https://app.midominio.com
```

Esperado:

```text
HTTP/2 200
```

o:

```text
HTTP/2 302
```

si redirige a login.

### 12.4 Validacion certificado

```bash
openssl s_client -connect app.midominio.com:443 -servername app.midominio.com
```

Revisar:

- Certificado valido.
- Hostname correcto.
- No errores de verificacion.

### 12.5 Validacion Cloudflare

En navegador:

- Abrir `https://app.midominio.com`.
- Verificar candado HTTPS.
- Revisar que no haya mixed content.
- En Cloudflare, revisar que no existan errores 525 o 526.

Errores comunes:

- `525`: problema de handshake SSL entre Cloudflare y origin.
- `526`: certificado del origin invalido para `Full (strict)`.
- `521`: origin caido o firewall bloqueando Cloudflare.
- `522`: timeout hacia origin.

## 13. Como revertir si algo falla

### 13.1 Si falla Cloudflare proxy

Pasos:

1. Cambiar temporalmente `app` de `Proxied` a `DNS only`.
2. Verificar que Caddy responde directamente con certificado valido.
3. Revisar firewall Oracle para 80/443.
4. Revisar logs de Caddy.
5. Volver a `Proxied` cuando este estable.

### 13.2 Si falla `Full (strict)`

Pasos:

1. Verificar certificado origin.
2. Confirmar que Caddy sirve certificado para el hostname correcto.
3. Revisar que 443 esta abierto.
4. Como mitigacion temporal, usar `Full`, no `Flexible`.
5. Volver a `Full (strict)` cuando el certificado este corregido.

Regla:

- No usar `Flexible` para WA Sender.

### 13.3 Si falla Cloudflare Tunnel

Pasos:

1. Deshabilitar public hostname del tunnel afectado.
2. Validar que el servicio interno responde dentro del servidor.
3. Revisar logs de `cloudflared`.
4. Reiniciar `cloudflared`.
5. Si el tunnel era para `evo`, mantener Evolution interno y operar desde la app.

### 13.4 Si se expuso Evolution API por error

Pasos:

1. Eliminar DNS `evo` o ponerlo offline.
2. Quitar cualquier publicacion de puerto `8080`.
3. Rotar `EVOLUTION_API_KEY`.
4. Rotar `EVOLUTION_WEBHOOK_SECRET`.
5. Revisar logs de acceso.
6. Revisar sesiones/instancias afectadas.

## 14. Cambios a aplicar en docker-compose.yml cuando exista

Existe `docker-compose.yml` en la raiz del proyecto. La configuracion implementada para beta sigue estas reglas.

### 14.0 Implementacion actual

Archivos creados:

- `docker-compose.yml`
- `Dockerfile`
- `.dockerignore`
- `.env.production.example`
- `docker/caddy/Caddyfile`
- `docker/caddy/Caddyfile.evolution.example`
- `docker/caddy/Caddyfile.full.example`
- `app/api/health/route.ts`
- `scripts/worker-placeholder.mjs`

Servicios incluidos:

- `caddy`: unico servicio con puertos publicos 80/443.
- `next-app`: aplicacion Next.js privada detras de Caddy.
- `app-worker`: proceso placeholder hasta implementar BullMQ real.
- `app-migrate`: perfil manual para ejecutar migraciones Prisma.
- `postgres-app`: PostgreSQL principal self-hosted.
- `redis`: Redis con password para BullMQ/cache.
- `evolution-api`: Evolution API privada, sin puertos publicados.
- `postgres-evolution`: PostgreSQL separado para Evolution API.
- `postgres-backup`: backup local diario de ambas bases.
- `uptime-kuma`: monitoreo opcional bajo perfil `monitoring`.

Decision operativa:

- Las bases de datos de WA Sender y Evolution se separan en contenedores PostgreSQL distintos para reducir acoplamiento operativo y facilitar restauraciones independientes.
- Redis se comparte inicialmente usando bases logicas separadas: WA Sender usa `/0` y Evolution usa `/1`.
- El worker actual no envia campanas; es un placeholder seguro para validar la topologia Docker hasta implementar BullMQ.
- Las imagenes se fijan por version en `.env.production.example`; se debe validar compatibilidad ARM64 antes de beta real.
- Para activar `evo.midominio.com`, copiar `docker/caddy/Caddyfile.evolution.example` sobre `docker/caddy/Caddyfile`, crear el DNS correspondiente, generar `EVOLUTION_ADMIN_PASSWORD_HASH` y reiniciar Caddy.
- Para activar `status.midominio.com`, levantar el perfil `monitoring` y copiar `docker/caddy/Caddyfile.full.example` sobre `docker/caddy/Caddyfile`.

### 14.1 Servicios esperados

```yaml
services:
  caddy:
    image: caddy:latest
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web
    networks:
      - public
      - internal

  web:
    build: .
    expose:
      - "3000"
    networks:
      - internal

  worker:
    build: .
    command: npm run worker
    networks:
      - internal

  postgres:
    image: postgres:16
    expose:
      - "5432"
    networks:
      - internal

  redis:
    image: redis:7
    expose:
      - "6379"
    networks:
      - internal

  evolution-api:
    image: evolution-api-image-placeholder
    expose:
      - "8080"
    networks:
      - internal
```

### 14.2 Regla critica de puertos

Permitido:

```yaml
ports:
  - "80:80"
  - "443:443"
```

No permitido para produccion beta:

```yaml
ports:
  - "3000:3000"
  - "5432:5432"
  - "6379:6379"
  - "8080:8080"
```

Usar `expose` para comunicacion entre contenedores.

### 14.3 Si se usa Cloudflare Tunnel para evo

Agregar servicio conceptual:

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
  restart: unless-stopped
  networks:
    - internal
```

Reglas:

- El token debe venir de `.env`, no del repositorio.
- `cloudflared` debe poder resolver `evolution-api:8080`.
- No publicar puerto para `cloudflared`.

## 15. Cambios a aplicar en Caddyfile cuando exista

Crear:

```text
docker/caddy/Caddyfile
```

Contenido base:

```caddyfile
{
    email {$CADDY_EMAIL}
}

{$APP_HOST} {
    encode zstd gzip

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    }

    reverse_proxy next-app:3000
}
```

Para publicar `evo`, usar `docker/caddy/Caddyfile.evolution.example`.

Para publicar `evo` y `status`, usar `docker/caddy/Caddyfile.full.example` y levantar Uptime Kuma:

```bash
docker compose --env-file .env.production --profile monitoring up -d
```

No activar `evo` ni `status` hasta que existan DNS, certificados esperados y controles de acceso configurados.

## 16. Variables de entorno relacionadas

```text
DOMAIN=midominio.com
APP_URL=https://app.midominio.com
NEXT_PUBLIC_APP_URL=https://app.midominio.com
CADDY_EMAIL=admin@midominio.com

EVOLUTION_API_BASE_URL=http://evolution-api:8080
EVOLUTION_API_KEY=change-me
EVOLUTION_WEBHOOK_SECRET=change-me

CLOUDFLARE_TUNNEL_TOKEN=
```

Si `status` existe:

```text
STATUS_URL=https://status.midominio.com
```

## 17. Checklist de beta

Antes de publicar:

- Confirmar dominio real.
- Confirmar IP publica Oracle.
- Aplicar checklist de hardening de `docs/SERVER_HARDENING.md`.
- Crear DNS `app`.
- Configurar Cloudflare SSL/TLS en `Full (strict)`.
- Abrir 80/443 en Oracle.
- Restringir SSH a `ADMIN_PUBLIC_IP`.
- Verificar que PostgreSQL, Redis y Evolution API no tienen puertos publicos.
- Configurar Caddy.
- Validar HTTPS.
- Validar login OAuth callback con `https://app.midominio.com`.
- Confirmar que Evolution API solo responde desde red interna.

## 18. Hardening del servidor

La guia operativa de hardening para Ubuntu 24.04 ARM64 esta en:

```text
docs/SERVER_HARDENING.md
```

Decisiones registradas:

- SSH con llave publica, sin password y sin root login.
- UFW con `deny incoming`, `allow outgoing`, SSH restringido por IP admin y solo 80/443 publicos para Caddy.
- No agregar usuarios al grupo `docker` salvo necesidad explicita, porque equivale a privilegios root.
- `.env.production` con permisos restrictivos y fuera de Git.
- `fail2ban` para SSH.
- `unattended-upgrades` sin reinicio automatico inicialmente.
- Backups de configuracion antes de cambios grandes.
- App propia en Docker ejecutandose como usuario no root.

## 19. Referencias oficiales consultadas

- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/
- Cloudflare Tunnel firewall ports: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/tunnel-with-firewall/
- Cloudflare proxied DNS records: https://developers.cloudflare.com/dns/manage-dns-records/reference/proxied-dns-records/
- Cloudflare Full strict SSL mode: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/
