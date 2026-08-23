# WA Sender - Backups y Restore

## Objetivo

Proteger los datos críticos del MVP/beta y poder demostrar que un backup realmente se puede restaurar:

- base de datos principal de WA Sender;
- base de datos de Evolution API cuando exista;
- campañas, mensajes, agentes y configuraciones;
- sesiones y datos Auth.js persistidos;
- auditoría y demás datos de aplicación incluidos en PostgreSQL.

La estrategia actual está pensada para una beta pequeña en un VPS, pero separa deliberadamente dos responsabilidades distintas:

1. **backup/recovery**: crear, verificar, copiar, retener y restaurar dumps;
2. **retención de datos de la aplicación**: purgar datos personales/operativos según la política de Etapa 7.

`backup.sh` **no debe borrar datos de la aplicación**. La política de retención vive fuera del proceso de backup para evitar reglas contradictorias y efectos destructivos inesperados.

## Decisión implementada

- Backups periódicos con `pg_dump` en formato custom.
- Retención local configurable, 7 días por defecto.
- Export opcional a carpeta externa montada.
- Servicio Docker `postgres-backup`.
- Scripts versionados en `scripts/backup`.
- Checksums SHA-256 por dump.
- Manifest por ejecución.
- Heartbeat escrito **solo después de completar correctamente** el ciclo de backup.
- Healthcheck del contenedor basado en frescura del último backup exitoso.
- Restore con `pg_restore` y verificación de checksum cuando existe.
- CI ejecuta un round-trip real `pg_dump -> createdb -> pg_restore -> SELECT`.

## Archivos

- `scripts/backup/backup.sh`: crea dumps, checksums, manifest, copia externa opcional, poda backups vencidos y registra heartbeat al finalizar con éxito.
- `scripts/backup/backup-loop.sh`: ejecuta el backup al inicio si corresponde y luego por intervalo configurable.
- `scripts/backup/healthcheck.sh`: falla si no existe heartbeat o si está vencido.
- `scripts/backup/restore.sh`: verifica checksum si existe y restaura un `.dump` en una base objetivo.
- `scripts/backup/verify-restore.sh`: helper existente para validaciones manuales de restore.
- `docker-compose.yml`: servicio `postgres-backup` y su healthcheck.
- `backups/.gitkeep`: carpeta local, ignorando dumps reales.
- `backups-external/.gitkeep`: carpeta opcional para copia externa, ignorando dumps reales.

## Retención de backups

### Local

- `BACKUP_RETENTION_DAYS=7` por defecto.
- Se eliminan carpetas de backup más antiguas que el límite configurado.

### Externa

- Si `BACKUP_EXPORT_DIR` existe y es escribible dentro del contenedor, cada ejecución se copia allí.
- En Compose se monta desde `BACKUP_EXTERNAL_PATH`.
- La copia externa usa la misma retención por defecto.

### Retención de datos de aplicación

No se ejecuta desde `backup.sh`.

La Etapa 7 define y prueba por separado, entre otras reglas:

- `ExtractedNumber`: 30 días por defecto;
- conversaciones/mensajes: 90 días;
- webhook ledger `PROCESSED`: 30 días;
- playground: 30 días;
- auditoría: 365 días;
- `OptOut` y webhooks no resueltos se preservan deliberadamente.

Cualquier cambio de esa política debe hacerse en el motor de retención de la aplicación, no en scripts de backup.

## Variables de entorno

Producción:

```text
BACKUP_RETENTION_DAYS=7
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RUN_ON_START=true
BACKUP_HEALTH_MAX_AGE_SECONDS=172800
BACKUP_EXTERNAL_PATH=./backups-external
```

Bases de WA Sender:

```text
POSTGRES_USER=wa_sender
POSTGRES_PASSWORD=...
POSTGRES_DB=wa_sender
```

Base Evolution:

```text
EVOLUTION_POSTGRES_USER=evolution
EVOLUTION_POSTGRES_PASSWORD=...
EVOLUTION_POSTGRES_DB=evolution
```

`BACKUP_HEARTBEAT_FILE` se configura dentro del contenedor y normalmente no necesita modificarse desde el host.

## Health del backup

El heartbeat se actualiza únicamente después de:

1. crear los dumps configurados;
2. generar checksums;
3. escribir manifest;
4. intentar la copia externa según configuración;
5. podar backups vencidos.

El healthcheck falla si:

- el heartbeat no existe;
- `BACKUP_HEALTH_MAX_AGE_SECONDS` es inválido;
- el último backup exitoso excede la antigüedad máxima.

Que el directorio `/backups` sea escribible **no** se considera suficiente para declarar el servicio healthy.

## Seguridad

Los backups no incluyen `.env.production` ni archivos de secretos del servidor, pero los dumps de PostgreSQL pueden contener datos sensibles:

- usuarios y sesiones;
- tokens OAuth persistidos por Auth.js;
- teléfonos;
- mensajes;
- campañas;
- agentes y prompts;
- datos de Evolution.

Reglas:

- No subir dumps a Git.
- No publicar backups en buckets públicos.
- Object Storage debe ser privado.
- Habilitar cifrado en reposo del proveedor cuando esté disponible.
- Restringir permisos de los directorios de backup en el host.
- Rotar credenciales si un backup se expone accidentalmente.
- El cifrado adicional de backups y la copia externa real siguen siendo requisitos antes de una beta con datos de terceros.

## Servicio Docker

El servicio se llama `postgres-backup` y ejecuta:

```text
sh /scripts/backup-loop.sh
```

Estructura esperada:

```text
backups/
  20260823T045025Z/
    wa_sender_app.dump
    wa_sender_app.dump.sha256
    evolution.dump
    evolution.dump.sha256
    manifest.txt
```

Formato:

- `pg_dump --format=custom --compress=9`;
- restauración mediante `pg_restore`.

## Comandos de backup

Levantar el servicio:

```bash
docker compose --env-file .env.production up -d postgres-backup
```

Backup manual:

```bash
docker compose --env-file .env.production run --rm postgres-backup sh /scripts/backup.sh
```

Logs:

```bash
docker compose --env-file .env.production logs -f postgres-backup
```

Listar archivos:

```bash
ls -lah backups
find backups -maxdepth 2 -type f
```

## Export a almacenamiento externo

Opción simple:

1. Montar disco, NFS o almacenamiento de objetos mediante una herramienta del host como `rclone`.
2. Configurar:

```text
BACKUP_EXTERNAL_PATH=/mnt/wa-sender-backups
```

3. Reiniciar el servicio:

```bash
docker compose --env-file .env.production up -d postgres-backup
```

El contenedor copia cada ejecución a `/backup-external`, que apunta a `BACKUP_EXTERNAL_PATH`.

Antes de depender de esa copia:

- verificar lectura y escritura;
- ejecutar un restore desde la copia externa, no solo desde el disco local;
- no guardar credenciales del proveedor dentro del repositorio.

## Restore de WA Sender

Restaurar sobre una base existente es destructivo para su estado actual. Crear primero un backup del estado que se va a reemplazar.

1. Detener app y worker:

```bash
docker compose --env-file .env.production stop next-app app-worker
```

2. Restaurar:

```bash
docker compose --env-file .env.production run --rm postgres-backup \
  sh -c 'sh /scripts/restore.sh \
    /backups/20260823T045025Z/wa_sender_app.dump \
    postgres-app \
    "$POSTGRES_DB" \
    "$POSTGRES_USER" \
    5432 \
    "$POSTGRES_PASSWORD"'
```

3. Aplicar migraciones si el código desplegado requiere un esquema posterior:

```bash
docker compose --env-file .env.production --profile migrate run --rm app-migrate
```

4. Levantar app y worker:

```bash
docker compose --env-file .env.production up -d next-app app-worker
```

5. Verificar readiness:

```bash
docker compose --env-file .env.production ps
curl -fsS https://app.midominio.com/api/health/ready
```

## Restore de Evolution

Detener Evolution antes de restaurar su base:

```bash
docker compose --env-file .env.production stop evolution-api
```

```bash
docker compose --env-file .env.production run --rm postgres-backup \
  sh -c 'sh /scripts/restore.sh \
    /backups/20260823T045025Z/evolution.dump \
    postgres-evolution \
    "$EVOLUTION_POSTGRES_DB" \
    "$EVOLUTION_POSTGRES_USER" \
    5432 \
    "$EVOLUTION_POSTGRES_PASSWORD"'
```

```bash
docker compose --env-file .env.production up -d evolution-api
```

Si la versión de Evolution usada conserva estado crítico en `evolution_instances`, debe diseñarse y validarse también el backup/restore coherente de ese volumen.

## Evidencia automática actual

En el PR de Etapa 8 v2, GitHub Actions ejecuta en cada cambio:

- validación sintáctica de los scripts shell;
- heartbeat fresco -> éxito;
- heartbeat vencido -> fallo esperado;
- `docker compose config` local y producción;
- creación de dumps reales de PostgreSQL;
- checksum del dump;
- creación de una base temporal;
- `pg_restore` del dump;
- consultas a tablas reales restauradas;
- build completo de la imagen Docker.

Run de referencia: `32618800416`, job `97143671086`, conclusión `success`.

Esta señal reduce el riesgo de descubrir un backup inválido recién durante un incidente, pero **no sustituye** una prueba de restore sobre una copia real/no vacía ni un restore desde el almacenamiento externo productivo.

## Checklist operativo antes de beta real

- Confirmar `postgres-backup` healthy.
- Confirmar backup exitoso reciente.
- Confirmar `manifest.txt`.
- Confirmar checksums.
- Confirmar espacio en disco.
- Copiar backups fuera del VPS.
- Probar restore desde la copia externa en una base temporal.
- Verificar `/api/health/ready` después del restore.
- Verificar consistencia de Evolution y su volumen de sesiones si aplica.
- Mantener separada la ejecución del motor de retención de datos.

## Riesgos pendientes

- Backup local en el mismo VPS no protege contra pérdida total del servidor.
- Los dumps contienen datos personales y posiblemente tokens persistidos.
- Cifrado adicional/gestión de claves de backups sigue pendiente.
- Evolution puede requerir backup adicional de su volumen de sesiones.
- Object Storage requiere configuración y credenciales fuera del repositorio.
- Falta validar restore con una copia real/no vacía y en arquitectura ARM64 de staging.
