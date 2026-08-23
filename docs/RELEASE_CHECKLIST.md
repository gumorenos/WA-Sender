# WA Sender — Release / Rollback Checklist

## Alcance

Este checklist aplica a releases de **beta técnica o beta privada**. No autoriza por sí mismo el uso de envío real ni auto-reply real.

Una release se considera lista únicamente cuando existe evidencia reproducible del commit exacto que se pretende desplegar.

## Invariantes de seguridad

Antes, durante y después del deploy deben mantenerse, salvo una activación posterior y deliberada durante una prueba controlada:

```text
REAL_SENDING_ENABLED=false
AGENT_AUTOREPLY_ENABLED=false
AGENT_REAL_REPLY_ENABLED=false
BETA_REQUIRE_INVITE=true
```

Un deploy **no** debe utilizarse como mecanismo para activar envío real o agentes automáticos. Esas activaciones tienen su propio procedimiento de prueba y QA.

## Convención de versión

Para la beta se usa SemVer con pre-release incremental:

```text
v0.1.0-beta.1
v0.1.0-beta.2
v0.1.0-beta.3
```

Reglas:

- el tag debe apuntar al commit exacto cuyo CI está verde;
- nunca mover/reutilizar un tag existente;
- registrar el SHA completo además del tag;
- registrar digest de la imagen Docker usada en el deploy;
- un nuevo commit después del CI obliga a validar el nuevo HEAD antes de taggear/desplegar.

## 1. Preflight del candidato

Registrar:

```text
Fecha UTC:
Operador:
PR:
Commit SHA:
Tag candidato:
Arquitectura host:
Docker version:
Docker Compose version:
Imagen/digest:
```

Verificar:

- [ ] El PR corresponde al cambio que se quiere desplegar.
- [ ] El HEAD exacto tiene CI `success`.
- [ ] `npm audit --audit-level=moderate` está verde.
- [ ] Migraciones del candidato están versionadas y pasaron `prisma migrate deploy` en CI.
- [ ] Tests, build, Compose config, backup/restore y runtime Docker smoke están verdes.
- [ ] No existen cambios sin revisar posteriores al SHA validado.
- [ ] `REAL_SENDING_ENABLED=false`.
- [ ] `AGENT_AUTOREPLY_ENABLED=false`.
- [ ] `AGENT_REAL_REPLY_ENABLED=false`.
- [ ] `BETA_REQUIRE_INVITE=true`.
- [ ] Credenciales/secrets de producción no son placeholders.
- [ ] `HEALTHCHECK_TOKEN` está configurado y no se expone como `NEXT_PUBLIC_*`.
- [ ] Redis, DB y Evolution no exponen puertos públicos no previstos.
- [ ] `vm.overcommit_memory=1` está validado en el host que ejecutará Redis.
- [ ] Existe espacio suficiente en disco para imagen + backup + operación normal.

Validar configuración sin levantar servicios:

```bash
docker compose --env-file .env.production -f docker-compose.yml config -q
```

## 2. Backup obligatorio antes de cambios de esquema/datos

Antes de una migración o deploy que pueda modificar datos:

```bash
docker compose --env-file .env.production run --rm postgres-backup sh /scripts/backup.sh
```

Registrar:

```text
Timestamp backup:
Ruta local:
Ruta externa:
wa_sender_app.dump SHA-256:
evolution.dump SHA-256:
Heartbeat backup:
```

Verificar:

- [ ] El dump principal existe.
- [ ] El checksum pasa.
- [ ] El heartbeat corresponde a la ejecución recién completada.
- [ ] Para datos reales de terceros, existe además una copia fuera del VPS.
- [ ] Si el release cambia esquema de forma material, existe un restore probado compatible con el rollback previsto.

No continuar si el backup falla.

## 3. Preparar imagen exacta

La imagen que se despliega debe corresponder al SHA/tag validado.

Ejemplo conceptual:

```bash
git rev-parse HEAD

docker build -t wa-sender-app:v0.1.0-beta.N .
docker image inspect wa-sender-app:v0.1.0-beta.N --format '{{index .RepoDigests 0}}'
```

Registrar el digest disponible. Si la imagen se obtiene desde registry, preferir despliegue por digest o tag inmutable.

Verificar:

- [ ] Runtime user = `node`.
- [ ] La imagen contiene Prisma Client generado.
- [ ] La imagen no contiene secrets reales de build.
- [ ] Arquitectura de la imagen coincide con el host.

## 4. Migraciones

No ejecutar `prisma migrate dev` en producción.

Usar el servicio dedicado:

```bash
docker compose --env-file .env.production --profile migrate run --rm app-migrate
```

Verificar:

- [ ] El comando termina con exit code 0.
- [ ] No aparece una migración inesperada.
- [ ] El esquema resultante corresponde al código que se va a arrancar.

### Regla de rollback de migraciones

Prisma no convierte automáticamente todas las migraciones en reversibles. Si una migración modifica/destruye datos, el rollback puede requerir **restaurar el backup previo**.

No ejecutar una migración irreversible sin tener definido antes cómo recuperar los datos.

## 5. Deploy

Levantar/actualizar servicios usando el artefacto exacto validado.

Ejemplo:

```bash
docker compose --env-file .env.production up -d postgres-app redis postgres-evolution evolution-api

docker compose --env-file .env.production --profile migrate run --rm app-migrate

docker compose --env-file .env.production up -d next-app app-worker postgres-backup caddy
```

No activar `uptime-kuma` salvo que se haya decidido usar el perfil de monitoring.

Verificar:

```bash
docker compose --env-file .env.production ps
```

Todos los servicios requeridos deben estar en estado esperado y sin crash loops.

## 6. Smoke post-deploy

### Readiness pública/interna

```bash
curl -fsS https://app.midominio.com/api/health/ready
```

Esperado:

- HTTP 200;
- `database.status=ok`;
- `redis.status=ok`.

### Deep health

Usar el header, nunca query string:

```bash
curl -fsS \
  -H "x-healthcheck-token: $HEALTHCHECK_TOKEN" \
  https://app.midominio.com/api/health/deep
```

Revisar explícitamente:

- database;
- redis;
- Evolution;
- worker heartbeat;
- WhatsApp instances;
- LLM failures;
- disk.

### Worker

```bash
docker compose --env-file .env.production ps app-worker
docker compose --env-file .env.production logs --tail=100 app-worker
```

Verificar que no exista crash loop y que el heartbeat sea fresco.

### Backup

```bash
docker compose --env-file .env.production ps postgres-backup
docker compose --env-file .env.production logs --tail=100 postgres-backup
```

Verificar heartbeat y backup reciente.

### Browser / auth

Cuando exista staging real:

- [ ] login Google allowlisted;
- [ ] redirect de no autenticado;
- [ ] sesión persiste;
- [ ] logout;
- [ ] MEMBER/ADMIN/OWNER según permisos esperados;
- [ ] dashboard y navegación principal sin errores de consola.

## 7. Condiciones de rollback inmediato

Hacer rollback si ocurre cualquiera de los siguientes:

- migración falla o deja esquema inconsistente;
- `/api/health/ready` no estabiliza;
- DB o Redis quedan inaccesibles;
- app o worker entran en crash loop;
- auth deja de funcionar;
- se detecta cruce de tenant/permisos;
- aparecen envíos inesperados;
- un kill switch no bloquea lo esperado;
- Evolution pierde estado crítico tras el cambio;
- métricas/logs muestran corrupción o duplicación no reconciliable.

## 8. Procedimiento de rollback

### 8.1 Contención

Confirmar primero:

```text
REAL_SENDING_ENABLED=false
AGENT_AUTOREPLY_ENABLED=false
AGENT_REAL_REPLY_ENABLED=false
```

Si existe riesgo de tráfico inesperado, detener `app-worker` antes de seguir:

```bash
docker compose --env-file .env.production stop app-worker
```

### 8.2 Rollback solo de aplicación

Si no hubo cambios incompatibles de DB:

1. seleccionar la imagen/tag/digest anterior conocido como bueno;
2. actualizar `APP_IMAGE` al artefacto anterior;
3. recrear `next-app` y `app-worker`;
4. validar readiness/deep health;
5. mantener envío real desactivado.

Ejemplo conceptual:

```bash
docker compose --env-file .env.production up -d --force-recreate next-app app-worker
```

### 8.3 Rollback con restauración de DB

Si la migración/datos requieren volver al estado anterior:

1. detener app + worker;
2. conservar también un backup del estado fallido para análisis;
3. restaurar el dump previo al release según `docs/BACKUP_RESTORE.md`;
4. desplegar el código/imagen compatible con ese esquema;
5. verificar readiness y deep health;
6. ejecutar smoke funcional antes de reabrir tráfico.

No restaurar una DB “por probar”: es una acción destructiva y debe estar justificada por el plan de rollback del release.

## 9. Cierre y evidencia

Registrar al finalizar:

```text
Fecha/hora deploy:
Commit SHA:
Tag:
Imagen/digest:
Migraciones aplicadas:
Backup previo:
Resultado /api/health/ready:
Resultado deep health:
Worker heartbeat:
Backup heartbeat:
Smoke auth/browser:
Incidencias:
Rollback necesario: sí/no
```

- [ ] La evidencia quedó guardada.
- [ ] No se modificaron flags de envío como parte implícita del deploy.
- [ ] El release quedó asociado al SHA/tag exacto.
- [ ] Si hubo rollback, se documentó causa y estado final.

## 10. Requisitos que este checklist no sustituye

Antes de beta con terceros siguen siendo obligatorios los P0 de `docs/QA_PENDING.md`, incluyendo:

- ARM64/staging real;
- OAuth real;
- Evolution real y redelivery;
- worker timeout/crash/recovery y reconciliación `UNKNOWN_PROVIDER_RESULT`;
- kill switches con tráfico controlado;
- backup externo y restore desde esa copia;
- alertas reales;
- runbooks operacionales;
- handoff humano cuando sea requisito del flujo.

`docs/QA_PENDING.md` continúa siendo la fuente de verdad sobre qué QA permanece abierto.

## Branch protection

Antes de usar `main` como rama de releases, configurar protección/ruleset para exigir como mínimo el check de CI del PR antes de mergear.

La configuración de branch protection es una política del repositorio, no un archivo versionado. Debe validarse desde GitHub y registrarse en `docs/QA_PENDING.md` cuando esté activa.
