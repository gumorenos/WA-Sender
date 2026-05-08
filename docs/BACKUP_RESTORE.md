# WA Sender - Backups y Restore

## Objetivo

Proteger datos criticos del MVP/beta:

- Base de datos principal de WA Sender.
- Base de datos de Evolution API si existe.
- Campanas, mensajes, agentes, configuracion, sesiones Auth.js y auditoria.

Esta estrategia esta pensada para 1 a 5 clientes beta en un VPS Oracle Cloud Always Free con disco de 200 GB y costo minimo.

## Decision implementada

- Backups diarios con `pg_dump` en formato custom.
- Retencion local de 7 dias.
- Export opcional a carpeta externa montada.
- Servicio Docker `postgres-backup`.
- Scripts versionados en `scripts/backup`.
- Limpieza automatica de logs operativos antiguos.
- Restore documentado con `pg_restore`.
- Prueba de restore con base temporal.

## Archivos

- `scripts/backup/backup.sh`: ejecuta backup de bases y limpieza de logs.
- `scripts/backup/backup-loop.sh`: loop diario para el contenedor.
- `scripts/backup/restore.sh`: restaura un `.dump` en una base objetivo.
- `scripts/backup/verify-restore.sh`: restaura en una base temporal y valida tablas.
- `docker-compose.yml`: servicio `postgres-backup`.
- `backups/.gitkeep`: carpeta local para backups, ignorando dumps reales.
- `backups-external/.gitkeep`: carpeta opcional para copia externa, ignorando dumps reales.

## Politica de retencion

Local:

- `BACKUP_RETENTION_DAYS=7`.
- Se eliminan carpetas de backup con mas de 7 dias.

Externa:

- Si `BACKUP_EXPORT_DIR` existe dentro del contenedor, se copia cada backup tambien alli.
- En Compose se monta desde `BACKUP_EXTERNAL_PATH`.
- Se aplica la misma retencion por defecto.

Logs:

- `BACKUP_LOG_RETENTION_DAYS=90`.
- Se limpian:
  - `campaign_events` antiguos.
  - `playground_sessions` antiguos.
  - `audit_logs` antiguos que no sean eventos criticos de creacion, actualizacion, borrado, opt-in u opt-out.

Razon:

- Las campanas, mensajes y agentes no se eliminan automaticamente.
- Los logs operativos no crecen sin limite.
- Los eventos de consentimiento y cambios criticos se conservan mas cuidadosamente.

## Variables de entorno

Produccion:

```text
BACKUP_RETENTION_DAYS=7
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RUN_ON_START=true
BACKUP_CLEANUP_LOGS=true
BACKUP_LOG_RETENTION_DAYS=90
BACKUP_EXTERNAL_PATH=./backups-external
```

Bases app:

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

## Seguridad

Los backups no incluyen `.env.production` ni archivos de secretos del servidor.

Pero los dumps de PostgreSQL si contienen datos sensibles:

- usuarios y sesiones.
- posibles tokens OAuth persistidos por Auth.js.
- telefonos.
- mensajes.
- campanas.
- agentes y prompts.
- datos de Evolution.

Reglas:

- No subir backups a repositorios Git.
- No publicar backups en buckets publicos.
- Si se copia a Object Storage, el bucket debe ser privado.
- Activar cifrado del lado del servidor en Object Storage si esta disponible.
- Restringir permisos del directorio `backups` en el VPS.
- Rotar credenciales si un backup se expone accidentalmente.

## Servicio Docker

El servicio se llama `postgres-backup`.

Ejecuta:

```text
sh /scripts/backup-loop.sh
```

Produce una estructura:

```text
backups/
  20260507T010000Z/
    wa_sender_app.dump
    wa_sender_app.dump.sha256
    evolution.dump
    evolution.dump.sha256
    manifest.txt
```

Formato:

- `pg_dump --format=custom --compress=9`.
- Restauracion con `pg_restore`.

## Comandos de backup

Levantar servicio normal:

```bash
docker compose --env-file .env.production up -d postgres-backup
```

Ejecutar backup manual puntual:

```bash
docker compose --env-file .env.production run --rm postgres-backup sh /scripts/backup.sh
```

Ver logs:

```bash
docker compose --env-file .env.production logs -f postgres-backup
```

Listar backups:

```bash
ls -lah backups
find backups -maxdepth 2 -type f
```

## Export opcional a Object Storage o carpeta externa

Opcion simple:

1. Montar un disco, carpeta NFS, bucket con `rclone mount` o `s3fs` en el host.
2. Configurar:

```text
BACKUP_EXTERNAL_PATH=/mnt/wa-sender-backups
```

3. Reiniciar el servicio:

```bash
docker compose --env-file .env.production up -d postgres-backup
```

El contenedor copiara cada backup a `/backup-external`, que apunta a `BACKUP_EXTERNAL_PATH`.

Para Object Storage de Oracle:

- Crear bucket privado.
- Usar una herramienta externa del host como `rclone`.
- No guardar credenciales de Object Storage dentro del repositorio.
- Probar lectura y escritura antes de depender de esa copia.

## Restore de WA Sender app

Restaurar en la base app existente es una operacion destructiva para el contenido actual de esa base. Antes de restaurar, crear un backup del estado actual.

1. Detener app y worker para evitar escrituras:

```bash
docker compose --env-file .env.production stop next-app app-worker
```

2. Ejecutar restore:

```bash
docker compose --env-file .env.production run --rm postgres-backup \
  sh -c 'sh /scripts/restore.sh \
    /backups/20260507T010000Z/wa_sender_app.dump \
    postgres-app \
    "$POSTGRES_DB" \
    "$POSTGRES_USER" \
    5432 \
    "$POSTGRES_PASSWORD"'
```

3. Ejecutar migraciones si el codigo actual espera un esquema mas nuevo:

```bash
docker compose --env-file .env.production --profile migrate run --rm app-migrate
```

4. Levantar app y worker:

```bash
docker compose --env-file .env.production up -d next-app app-worker
```

5. Verificar health:

```bash
docker compose --env-file .env.production ps
curl -I https://app.midominio.com/api/health
```

## Restore de Evolution

Evolution API debe detenerse antes de restaurar su base.

```bash
docker compose --env-file .env.production stop evolution-api
```

```bash
docker compose --env-file .env.production run --rm postgres-backup \
  sh -c 'sh /scripts/restore.sh \
    /backups/20260507T010000Z/evolution.dump \
    postgres-evolution \
    "$EVOLUTION_POSTGRES_DB" \
    "$EVOLUTION_POSTGRES_USER" \
    5432 \
    "$EVOLUTION_POSTGRES_PASSWORD"'
```

```bash
docker compose --env-file .env.production up -d evolution-api
```

Nota:

- Si Evolution guarda sesiones en volumen, la base y el volumen `evolution_instances` deben permanecer coherentes.
- Esta estrategia cubre la base de Evolution; si se detecta que la version usada guarda estado critico fuera de Postgres, agregar backup del volumen `evolution_instances`.

## Prueba de restauracion

Probar restore sin tocar produccion:

```bash
docker compose --env-file .env.production run --rm postgres-backup \
  sh /scripts/verify-restore.sh \
  /backups/20260507T010000Z/wa_sender_app.dump
```

Esperado:

- Crea base temporal `wa_sender_restore_check`.
- Restaura el dump.
- Cuenta tablas en `public`.
- Elimina la base temporal.

Esta prueba debe ejecutarse antes de operar con clientes reales y al menos despues de cambios grandes de esquema.

## Limpieza manual de logs

La limpieza se ejecuta despues del backup diario. Para ejecutarla manualmente junto con backup:

```bash
docker compose --env-file .env.production run --rm postgres-backup sh /scripts/backup.sh
```

Para desactivarla temporalmente:

```text
BACKUP_CLEANUP_LOGS=false
```

## Checklist operativo

- Confirmar que `postgres-backup` esta `healthy`.
- Confirmar que existe un backup de las ultimas 24 horas.
- Confirmar que `manifest.txt` existe.
- Confirmar checksum con `sha256sum -c`.
- Probar restore en base temporal.
- Verificar espacio en disco semanalmente.
- No conservar backups locales infinitamente.
- Copiar backups a una ubicacion externa antes del piloto real.

## Riesgos pendientes

- Backup local en el mismo VPS no protege contra perdida total del servidor.
- El dump puede contener datos personales y tokens persistidos.
- Evolution puede requerir backup adicional de volumen de sesiones segun version/configuracion.
- Object Storage necesita configuracion fuera del repo para no exponer credenciales.
