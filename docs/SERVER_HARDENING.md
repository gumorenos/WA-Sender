# WA Sender - Server Hardening Guide

## 1. Objetivo

Endurecer un VPS Oracle Cloud Always Free con Ubuntu 24.04 ARM64 para operar WA Sender con Docker Compose, Caddy, PostgreSQL, Redis, Evolution API y worker.

Principios:

- Solo exponer lo necesario: SSH restringido, HTTP/HTTPS por Caddy.
- No publicar PostgreSQL, Redis, Evolution API ni Next.js directamente.
- Tratar `.env.production` como secreto.
- Mantener backups exportables y probar restauracion.
- Aplicar cambios de red en pasos pequenos y siempre con una sesion SSH abierta.

Advertencia:

- No ejecutes todos los comandos a ciegas.
- Los pasos de SSH y UFW pueden dejarte fuera del servidor si `ADMIN_PUBLIC_IP` o las llaves SSH estan mal configuradas.
- Mantén una sesion SSH abierta mientras pruebas una segunda sesion nueva.

## 2. Variables usadas en comandos

Reemplazar antes de aplicar:

```bash
export ADMIN_PUBLIC_IP="TU_IP_PUBLICA_ADMIN/32"
export DEPLOY_USER="deploy"
export APP_DIR="/opt/wa-sender"
```

Ver tu IP publica desde tu maquina local:

```bash
curl -4 ifconfig.me
```

## 3. Checklist de hardening

### 3.1 Acceso

- Usar SSH con llave publica, no password.
- Deshabilitar login root por SSH.
- Restringir SSH por IP en Oracle Security List/NSG y UFW.
- Mantener usuario `deploy` con sudo.
- Evitar agregar usuarios al grupo `docker` salvo necesidad clara, porque equivale a root.

### 3.2 Red

- Oracle Security List/NSG:
  - abrir `22/tcp` solo desde `ADMIN_PUBLIC_IP`.
  - abrir `80/tcp` y `443/tcp` para Caddy si se usa A record + Cloudflare.
  - no abrir `3000`, `3001`, `5432`, `6379`, `8080`, `5555`.
- UFW:
  - default deny incoming.
  - default allow outgoing.
  - permitir SSH solo desde IP admin.
  - permitir 80/443 para Caddy.

### 3.3 Docker

- Solo `caddy` puede publicar puertos host.
- `next-app`, `app-worker`, `postgres-app`, `redis`, `evolution-api`, `postgres-evolution` usan `expose` o redes internas.
- No usar imagenes `latest` en beta.
- Validar ARM64 antes del piloto.
- Ejecutar app propia como usuario no root dentro del contenedor.
- Revisar `docker compose config` antes de desplegar.

### 3.4 Secretos

- `.env.production` fuera del repositorio.
- Permisos `640`, propietario `root`, grupo `deploy`.
- No pegar secretos en tickets, logs ni outputs de `docker compose config`.
- Rotar secretos si se exponen.

### 3.5 Backups

- Backups diarios de PostgreSQL app y PostgreSQL Evolution.
- Directorio de backups con permisos restrictivos.
- Copia externa futura antes de clientes reales.
- Prueba de restauracion antes de piloto.

### 3.6 Operacion

- `unattended-upgrades` activo para seguridad.
- `fail2ban` activo para SSH.
- Logs con rotacion.
- Alertas basicas con Uptime Kuma o Cloudflare.
- Revisar disco semanalmente.

## 4. Configuracion SSH recomendada

### 4.1 Crear usuario de despliegue

```bash
sudo adduser --disabled-password --gecos "" "$DEPLOY_USER"
sudo usermod -aG sudo "$DEPLOY_USER"
sudo install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
sudo nano "/home/$DEPLOY_USER/.ssh/authorized_keys"
sudo chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
sudo chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
```

Probar desde otra terminal antes de tocar `sshd`:

```bash
ssh deploy@IP_PUBLICA_ORACLE
```

### 4.2 Endurecer SSH

Crear archivo dedicado:

```bash
sudo tee /etc/ssh/sshd_config.d/99-wa-sender-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
PermitEmptyPasswords no
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
MaxAuthTries 3
LoginGraceTime 20
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deploy ubuntu opc
EOF
```

Validar antes de recargar:

```bash
sudo sshd -t
sudo systemctl reload ssh
sudo systemctl status ssh --no-pager
```

Cuando confirmes que `deploy` funciona, puedes reducir `AllowUsers`:

```bash
sudo sed -i 's/^AllowUsers .*/AllowUsers deploy/' /etc/ssh/sshd_config.d/99-wa-sender-hardening.conf
sudo sshd -t
sudo systemctl reload ssh
```

## 5. Firewall UFW recomendado

### 5.1 Reglas base

Advertencia:

- Ejecuta esto solo despues de confirmar `ADMIN_PUBLIC_IP`.
- Mantén una sesion SSH abierta.

```bash
sudo apt-get update
sudo apt-get install -y ufw

sudo ufw default deny incoming
sudo ufw default allow outgoing

sudo ufw allow from "$ADMIN_PUBLIC_IP" to any port 22 proto tcp comment 'SSH admin only'
sudo ufw allow 80/tcp comment 'Caddy HTTP ACME redirect'
sudo ufw allow 443/tcp comment 'Caddy HTTPS'
sudo ufw allow 443/udp comment 'Caddy HTTP3'

sudo ufw logging medium
sudo ufw --force enable
sudo ufw status verbose
```

### 5.2 Si usas Cloudflare Tunnel para todo

No abras 80/443. Mantén solo SSH desde IP admin y salida a Cloudflare.

Para cerrar reglas ya creadas:

```bash
sudo ufw status numbered
sudo ufw delete NUMERO_DE_REGLA_80
sudo ufw delete NUMERO_DE_REGLA_443_TCP
sudo ufw delete NUMERO_DE_REGLA_443_UDP
sudo ufw status verbose
```

## 6. Puertos abiertos y cerrados

Abiertos en beta con Caddy:

```text
22/tcp   solo desde ADMIN_PUBLIC_IP
80/tcp   publico hacia Caddy
443/tcp  publico hacia Caddy
443/udp  publico hacia Caddy si se usa HTTP/3
```

Cerrados al publico:

```text
3000/tcp  Next.js
3001/tcp  Uptime Kuma
5432/tcp  PostgreSQL
6379/tcp  Redis
8080/tcp  Evolution API
5555/tcp  Prisma Studio
```

Verificacion:

```bash
sudo ss -tulpn
sudo ufw status verbose
docker compose --env-file .env.production ps
```

Esperado:

- En `docker compose ps`, solo `caddy` publica `0.0.0.0:80`, `0.0.0.0:443` y opcionalmente `0.0.0.0:443/udp`.
- Ningun servicio de datos publica puertos host.

## 7. Reglas para Docker y redes internas

### 7.1 Reglas obligatorias

- No agregar `ports` a `postgres-app`, `postgres-evolution`, `redis`, `evolution-api`, `next-app` ni `app-worker`.
- Usar `expose` para comunicacion entre contenedores.
- Mantener `EVOLUTION_API_BASE_URL=http://evolution-api:8080`.
- No conectar el navegador directamente a Evolution API.
- No montar el socket Docker dentro de contenedores de app.
- No ejecutar contenedores con `privileged: true`.
- No montar `/`, `/var/run/docker.sock`, `/etc`, `/root` dentro de contenedores.

### 7.2 Docker y UFW

Docker puede crear reglas iptables que no pasan por UFW para puertos publicados. Por eso la defensa principal es:

- no publicar puertos innecesarios en Compose.
- revisar `docker compose ps`.
- revisar `sudo iptables -S DOCKER-USER`.

Opcional avanzado:

- Usar reglas `DOCKER-USER` solo despues de validar en staging.
- Un error aqui puede cortar trafico legitimo entre contenedores o hacia Caddy.

Ver reglas Docker:

```bash
sudo iptables -S DOCKER-USER
sudo iptables -S DOCKER
```

## 8. Manejo seguro de variables de entorno

### 8.1 Crear archivo de produccion

```bash
sudo install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
cd "$APP_DIR"
cp .env.production.example .env.production
nano .env.production
```

Permisos:

```bash
sudo chown root:"$DEPLOY_USER" "$APP_DIR/.env.production"
sudo chmod 640 "$APP_DIR/.env.production"
```

Generar secretos:

```bash
openssl rand -base64 48
```

Evitar que secretos queden en historial:

```bash
set +o history
nano .env.production
set -o history
```

### 8.2 Reglas de secretos

- No commitear `.env.production`.
- No compartir salida completa de `docker compose config`, porque expande secretos.
- Usar passwords largos y distintos para:
  - `AUTH_SECRET`
  - `POSTGRES_PASSWORD`
  - `REDIS_PASSWORD`
  - `EVOLUTION_API_KEY`
  - `EVOLUTION_WEBHOOK_SECRET`
  - `EVOLUTION_POSTGRES_PASSWORD`
- Rotar cualquier secreto pegado accidentalmente en chat, issue o log.

## 9. Estrategia de usuarios Linux y permisos

Usuarios recomendados:

- `deploy`: opera despliegues con sudo.
- `root`: solo tareas administrativas puntuales.
- No crear usuarios humanos adicionales sin necesidad.

Permisos recomendados:

```bash
sudo install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
sudo install -d -m 700 -o root -g root "$APP_DIR/backups"
sudo chown root:"$DEPLOY_USER" "$APP_DIR/.env.production"
sudo chmod 640 "$APP_DIR/.env.production"
```

Docker group:

- Recomendacion segura: no agregar `deploy` al grupo `docker`; usar `sudo docker compose`.
- Si agregas `deploy` a `docker`, tratalo como root-equivalent.

Comando si decides aceptar ese riesgo:

```bash
sudo usermod -aG docker "$DEPLOY_USER"
```

## 10. Fail2ban

Instalar:

```bash
sudo apt-get update
sudo apt-get install -y fail2ban
```

Configurar SSH:

```bash
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
backend = systemd
maxretry = 4
findtime = 10m
bantime = 1h
ignoreip = 127.0.0.1/8 ::1 ADMIN_PUBLIC_IP_SIN_MASCARA
EOF
```

Reemplazar `ADMIN_PUBLIC_IP_SIN_MASCARA`, por ejemplo `203.0.113.10`.

Aplicar:

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

Alternativas o complementos:

- Cloudflare WAF y rate limiting para HTTP.
- Oracle Security List/NSG para restringir SSH antes de llegar al VPS.
- Logs y alertas con Uptime Kuma.

## 11. Actualizaciones automaticas

Instalar:

```bash
sudo apt-get update
sudo apt-get install -y unattended-upgrades apt-listchanges
```

Activar:

```bash
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

Configurar reinicio controlado si aceptas reinicios automaticos de seguridad:

```bash
sudo tee /etc/apt/apt.conf.d/52unattended-upgrades-wa-sender >/dev/null <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
EOF
```

Verificar:

```bash
systemctl status unattended-upgrades --no-pager
sudo unattended-upgrade --dry-run --debug
```

Recomendacion beta:

- No activar reboot automatico al inicio.
- Revisar actualizaciones semanalmente y reiniciar en ventana controlada.

## 12. Backups de configuracion

Crear snapshot local de configuracion antes de cambios grandes:

```bash
sudo install -d -m 700 -o root -g root /root/wa-sender-config-backups
sudo tar -czf "/root/wa-sender-config-backups/config-$(date +%Y%m%d_%H%M%S).tar.gz" \
  /etc/ssh \
  /etc/ufw \
  /etc/fail2ban \
  /etc/docker \
  /etc/apt/apt.conf.d \
  "$APP_DIR/.env.production" \
  "$APP_DIR/docker-compose.yml" \
  "$APP_DIR/docker/caddy" 2>/tmp/wa-sender-backup-warnings.log
```

Listar:

```bash
sudo ls -lh /root/wa-sender-config-backups
sudo cat /tmp/wa-sender-backup-warnings.log
```

Copiar fuera del servidor:

```bash
scp deploy@IP_PUBLICA_ORACLE:/ruta/remota/backup.tar.gz .
```

Nota:

- El backup de configuracion puede contener secretos si incluye `.env.production`.
- Guardarlo cifrado si sale del servidor.

## 13. Comandos exactos de aplicacion por fases

### Fase 0: backup previo

```bash
export ADMIN_PUBLIC_IP="TU_IP_PUBLICA_ADMIN/32"
export DEPLOY_USER="deploy"
export APP_DIR="/opt/wa-sender"

sudo install -d -m 700 -o root -g root /root/wa-sender-config-backups
sudo tar -czf "/root/wa-sender-config-backups/pre-hardening-$(date +%Y%m%d_%H%M%S).tar.gz" /etc/ssh /etc/ufw /etc/fail2ban /etc/docker 2>/tmp/wa-sender-pre-hardening-warnings.log || true
```

### Fase 1: paquetes base

```bash
sudo apt-get update
sudo apt-get install -y ufw fail2ban unattended-upgrades apt-listchanges curl ca-certificates gnupg lsb-release
```

### Fase 2: usuario deploy

```bash
sudo adduser --disabled-password --gecos "" "$DEPLOY_USER"
sudo usermod -aG sudo "$DEPLOY_USER"
sudo install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
sudo nano "/home/$DEPLOY_USER/.ssh/authorized_keys"
sudo chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
sudo chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
```

### Fase 3: SSH

```bash
sudo tee /etc/ssh/sshd_config.d/99-wa-sender-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
PermitEmptyPasswords no
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
MaxAuthTries 3
LoginGraceTime 20
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deploy ubuntu opc
EOF

sudo sshd -t
sudo systemctl reload ssh
```

Prueba obligatoria desde otra terminal:

```bash
ssh deploy@IP_PUBLICA_ORACLE
```

### Fase 4: UFW

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from "$ADMIN_PUBLIC_IP" to any port 22 proto tcp comment 'SSH admin only'
sudo ufw allow 80/tcp comment 'Caddy HTTP ACME redirect'
sudo ufw allow 443/tcp comment 'Caddy HTTPS'
sudo ufw allow 443/udp comment 'Caddy HTTP3'
sudo ufw logging medium
sudo ufw --force enable
sudo ufw status verbose
```

### Fase 5: fail2ban

```bash
ADMIN_IP_NO_MASK="$(echo "$ADMIN_PUBLIC_IP" | cut -d/ -f1)"

sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<EOF
[sshd]
enabled = true
port = ssh
filter = sshd
backend = systemd
maxretry = 4
findtime = 10m
bantime = 1h
ignoreip = 127.0.0.1/8 ::1 $ADMIN_IP_NO_MASK
EOF

sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
```

### Fase 6: actualizaciones automaticas

```bash
sudo dpkg-reconfigure --priority=low unattended-upgrades

sudo tee /etc/apt/apt.conf.d/52unattended-upgrades-wa-sender >/dev/null <<'EOF'
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
EOF

systemctl status unattended-upgrades --no-pager
```

### Fase 7: permisos de app

```bash
sudo install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
sudo install -d -m 700 -o root -g root "$APP_DIR/backups"
sudo chown root:"$DEPLOY_USER" "$APP_DIR/.env.production"
sudo chmod 640 "$APP_DIR/.env.production"
```

## 14. Verificacion final

### 14.1 SSH

```bash
sudo sshd -t
sudo systemctl status ssh --no-pager
ssh deploy@IP_PUBLICA_ORACLE
```

Esperado:

- Login con llave funciona.
- Login con password no funciona.
- Root por SSH no funciona.

### 14.2 Firewall

```bash
sudo ufw status verbose
sudo ss -tulpn
```

Esperado:

- `22` solo desde `ADMIN_PUBLIC_IP`.
- `80/443` abiertos si se usa Caddy publico.
- No hay listeners host para `5432`, `6379`, `8080`, `3000`.

### 14.3 Docker

```bash
cd "$APP_DIR"
docker compose --env-file .env.production config >/tmp/wa-sender-compose-rendered.yml
docker compose --env-file .env.production ps
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Esperado:

- Solo `caddy` tiene puertos host.
- DB, Redis, Evolution y Next no publican puertos.

### 14.4 Secretos

```bash
ls -l "$APP_DIR/.env.production"
git -C "$APP_DIR" status --short
```

Esperado:

- `.env.production` no aparece como archivo versionado.
- Permisos `-rw-r-----` o mas restrictivos.

### 14.5 Fail2ban

```bash
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

Esperado:

- Jail `sshd` activo.

### 14.6 Actualizaciones

```bash
systemctl status unattended-upgrades --no-pager
sudo unattended-upgrade --dry-run --debug
```

Esperado:

- Servicio activo.
- Dry run sin errores criticos.

## 15. Reversion segura

### 15.1 Revertir SSH hardening

Solo si te quedaste sin acceso por una regla de SSH y aun tienes consola Oracle:

```bash
sudo mv /etc/ssh/sshd_config.d/99-wa-sender-hardening.conf /root/99-wa-sender-hardening.conf.disabled
sudo sshd -t
sudo systemctl reload ssh
```

### 15.2 Desactivar UFW temporalmente

Solo desde consola Oracle si bloqueaste acceso:

```bash
sudo ufw disable
sudo ufw status verbose
```

Luego corregir reglas y reactivar.

### 15.3 Revertir fail2ban

```bash
sudo systemctl stop fail2ban
sudo systemctl disable fail2ban
```

## 16. Pendientes antes de clientes reales

- Copia externa cifrada de backups.
- Prueba documentada de restauracion PostgreSQL app y Evolution.
- Restriccion opcional de `80/443` solo a rangos Cloudflare en firewall de Oracle, si se mantiene Cloudflare proxied.
- Monitoreo de disco y alertas.
- Rotacion formal de secretos.
- Auditoria de contenedores con `docker scout`, `trivy` o equivalente.
