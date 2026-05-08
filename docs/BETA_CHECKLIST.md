# WA Sender - Beta Go/No-Go Checklist

Fecha: 2026-05-08

## Fuentes revisadas

- `docs/PROJECT_BRIEF.md`
- `docs/PRODUCT_REVIEW.md`
- `docs/SECURITY_NOTES.md`
- `docs/DEPLOYMENT_PLAN.md`
- `docs/BACKUP_RESTORE.md`
- `docs/OBSERVABILITY.md`
- `docker-compose.yml`
- `.env.example`
- `.env.production.example`
- `prisma/schema.prisma`
- `middleware.ts`
- rutas bajo `app/api`
- worker `scripts/campaign-worker.mjs`
- clientes `lib/evolution` y `lib/llm`

## Recomendacion final

No lanzar beta con clientes reales todavia.

Estado recomendado:

| Escenario | Decision | Condicion |
|---|---|---|
| Demo controlada con mocks | GO | Usar `EVOLUTION_MOCK=true`, `LLM_PROVIDER=mock` y datos no reales. |
| Beta tecnica interna | GO condicional | Solo con numeros propios, envio real muy bajo y supervision manual. |
| Beta privada con clientes reales | NO-GO | Resolver bloqueantes P0 de este documento. |
| SaaS comercial | NO-GO | Falta billing, legal, soporte, privacidad formal y operacion madura. |

Criterio pragmatico: WA Sender puede demostrarse, pero no debe procesar clientes reales hasta probar despliegue, restore, Evolution real, aislamiento multiusuario, opt-in y limites por plan.

## 1. Checklist go/no-go

| Area | Estado | Go/No-Go | Evidencia / condicion |
|---|---|---|---|
| Seguridad multiusuario | Parcial | NO-GO beta real | Los modelos usan `workspaceId` y las rutas revisadas filtran por workspace, pero faltan pruebas automatizadas cross-tenant. |
| Auth | Parcial | GO condicional | Auth.js/Google esta implementado; falta validar OAuth real con dominio final, cookies seguras y sesion expirada. |
| RLS / ownership | Parcial | NO-GO beta real | No hay RLS por decision self-hosted; se depende de Prisma y ownership checks. Aceptable solo con tests fuertes. |
| Secrets | Parcial | GO condicional | No hay API keys en `NEXT_PUBLIC_*`; `.env` son ejemplos. Falta rotacion documentada y verificacion en VPS. |
| Docker Compose | Parcial | GO condicional | Solo Caddy publica 80/443/443 UDP. Postgres, Redis y Evolution estan privados. Falta validar en Oracle ARM64. |
| Backups | Parcial | NO-GO beta real | Existen scripts y servicio Docker, pero falta ejecutar backup real y restore verificado. |
| Restore | Pendiente | NO-GO beta real | Documentado, no probado en servidor real. |
| Logs | Parcial | GO condicional | Logs evitan secretos; DB almacena mensajes/telefonos como datos funcionales. Falta politica final de retencion. |
| Monitoreo | Parcial | NO-GO beta real | Healthchecks existen; Uptime Kuma es opcional. Falta configurar alertas reales. |
| Dominio/HTTPS | Pendiente servidor | NO-GO beta real | Caddy/Cloudflare documentados; falta DNS real, certificado, OAuth callback y prueba externa. |
| Evolution API | Parcial | NO-GO beta real | Cliente server-side existe y Evolution no se expone. Falta smoke test real en ARM64. |
| Worker de campanas | Parcial | NO-GO beta real | Hay BullMQ, delay, horario y limite diario; falta prueba de reinicio/idempotencia y doble start. |
| LLM provider | Parcial | GO condicional | Mock, DeepSeek y OpenAI existen. Falta cuota/costo por workspace y pruebas con provider real. |
| Opt-in | Insuficiente | NO-GO beta real | Crear campana guarda mensajes con consentimiento desconocido; no exige opt-in por destinatario. |
| Opt-out | Parcial | GO condicional | Webhook detecta STOP/BAJA/CANCELAR/NO ENVIAR y bloquea futuros mensajes. Falta UI de suppression list. |
| Limites por plan | Parcial | NO-GO beta real | Instancias, agentes, delay y limite diario existen; falta `maxActiveCampaigns`, limite de importacion, cuota LLM y cuota de extraccion. |
| Terminos de uso | Pendiente | NO-GO beta real | Falta ToS, privacidad, anti-spam, uso aceptable y consentimiento de beta. |
| WhatsApp/Baileys | Riesgo alto | GO solo beta tecnica | Riesgo aceptable solo con clientes informados, bajo volumen y plan de apagado. |
| Costos | Parcial | GO condicional | Infra costo minimo; falta limite de gasto LLM y monitoreo de tokens. |
| Soporte al cliente | Pendiente | NO-GO beta real | Falta runbook, canal de soporte, SLA beta y responsable diario. |
| Incidentes | Pendiente | NO-GO beta real | Falta procedimiento documentado y probado de detener worker/envios. |
| Estado del repo | Pendiente | NO-GO release | Hay muchos cambios sin commit. Antes de beta se debe congelar, versionar y etiquetar release. |

## 2. Bloqueantes antes de beta

P0 obligatorio:

1. Commit/tag de release reproducible: no desplegar desde worktree sucio.
2. Ejecutar `npm run lint`, `npm run test` y `npm run build` en limpio.
3. Ejecutar `docker compose --env-file .env.production config` en el VPS.
4. Validar build y arranque real de `docker-compose.yml` en Oracle Cloud ARM64.
5. Validar DNS, HTTPS, Cloudflare `Full (strict)` y callback OAuth de Google.
6. Ejecutar migraciones en entorno beta y confirmar que los planes seed existen.
7. Probar login con dos usuarios y verificar aislamiento cross-tenant por IDs.
8. Probar Evolution real: crear instancia, QR, estado, envio unico, webhook entrante y opt-out.
9. Confirmar que Evolution API no tiene puerto publico ni subdominio abierto sin Access/basicauth.
10. Ejecutar backup manual y `verify-restore.sh` contra base temporal.
11. Decidir y probar backup del volumen `evolution_instances` si la version usada guarda sesiones fuera de Postgres.
12. Configurar Uptime Kuma o equivalente con alertas por Telegram/email.
13. Configurar alertas para app caida, deep health fail, worker stale, Evolution caida, disco >= 85% y backup ausente en 24h.
14. Implementar o bloquear `maxActiveCampaigns` al crear/iniciar campanas.
15. Implementar limite maximo de filas por importacion segun plan.
16. Implementar opt-in explicito o atestacion de consentimiento antes de envio real.
17. Bloquear envio real a destinatarios con `consentStatus=UNKNOWN` salvo flujo beta aprobado y auditado.
18. Agregar UI o procedimiento operativo para suppression list / numeros bloqueados.
19. Definir cuotas LLM por workspace y presupuesto maximo diario/mensual.
20. Documentar terminos de uso beta, politica de privacidad, anti-spam y consentimiento.
21. Documentar procedimiento de incidente y rollback.
22. Hacer prueba de reinicio del worker en mitad de una campana.
23. Confirmar que `REAL_SENDING_ENABLED=false` sigue siendo default y que solo se activa deliberadamente.

## 3. Riesgos aceptables para beta

Aceptables solo si la beta es privada, pequena y supervisada:

1. Single VPS Oracle como punto unico de falla.
2. Rate limit in-memory mientras exista una sola replica de app.
3. PostgreSQL self-hosted si hay backup diario y restore probado.
4. Uptime Kuma en el mismo VPS como monitoreo minimo inicial.
5. Evolution API/Baileys como integracion no oficial, siempre informado al cliente beta.
6. Envio real de bajo volumen con limites conservadores y supervision manual.
7. LLM mock por defecto y provider real solo para clientes beta aprobados.
8. Sin billing automatico durante beta cerrada.
9. Sin roles avanzados si cada workspace tiene un solo owner.
10. Sin alta disponibilidad mientras el SLA beta sea explicitamente limitado.

## 4. Riesgos no aceptables

No aceptar para clientes reales:

1. Enviar mensajes reales sin opt-in explicito o atestacion de consentimiento auditable.
2. Permitir campanas con `consentStatus=UNKNOWN` sin control adicional.
3. No tener restore probado.
4. No tener alertas activas de caida, disco, worker y backups.
5. Exponer Postgres, Redis o Evolution API directamente a internet.
6. Exponer `evo.midominio.com` sin Cloudflare Access/basicauth y sin necesidad operacional clara.
7. Usar `latest` o imagenes no validadas en ARM64 para beta.
8. No tener plan de apagar envios rapidamente.
9. No tener responsable de soporte durante los primeros 7 dias.
10. No tener terminos beta, privacidad y politica anti-spam aceptadas por el cliente.
11. No tener pruebas cross-tenant antes de aceptar mas de un workspace real.
12. No limitar costo LLM por workspace.
13. No tener backups fuera del VPS para datos de clientes reales.
14. No documentar que Evolution/Baileys puede romper por cambios de WhatsApp.
15. No separar demo/mock de envio real en variables y procedimientos.

## 5. Pruebas que se deben correr

### 5.1 Calidad base

```bash
npm run lint
npm run test
npm run build
```

Criterio:

- Cero errores.
- Tests de parser, scheduling, LLM mock, webhook parser y prompt builder pasan.

### 5.2 Docker local y produccion

```bash
docker compose -f docker-compose.local.yml up -d postgres-app redis
npm run db:deploy
npm run dev
npm run dev:worker
```

```bash
docker compose --env-file .env.production config
docker compose --env-file .env.production build
docker compose --env-file .env.production --profile migrate run --rm app-migrate
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps
```

Criterio:

- Solo `caddy` publica puertos.
- `postgres-app`, `postgres-evolution`, `redis`, `evolution-api`, `next-app` y `app-worker` no publican puertos host.
- Todos los healthchecks quedan healthy o con estado explicado.

### 5.3 Auth y multiusuario

Pruebas manuales minimas:

1. Crear usuario A con Google.
2. Crear usuario B con Google.
3. Crear instancia/campana/agente con A.
4. Intentar leer/modificar/borrar esos IDs autenticado como B.
5. Verificar respuesta `404` o `403`, nunca datos de A.
6. Intentar acceder a `/dashboard`, `/instances`, `/campaigns` sin sesion.
7. Intentar acceder a `/api/instances` sin sesion.

Criterio:

- Ningun dato cruza workspace.
- Ningun endpoint acepta `userId` como autoridad.

### 5.4 Healthchecks y monitoreo

```bash
curl -i https://app.midominio.com/api/health
curl -i https://app.midominio.com/api/health/deep
curl -i -H "x-healthcheck-token: $HEALTHCHECK_TOKEN" https://app.midominio.com/api/health/deep
```

Criterio:

- `/api/health` responde 200.
- `/api/health/deep` sin token responde 401 en produccion.
- `/api/health/deep` con token responde 200 o 503 con detalle operativo.
- Uptime Kuma alerta si se detiene `next-app`, `app-worker`, Redis o Evolution.

### 5.5 Backups y restore

```bash
docker compose --env-file .env.production run --rm postgres-backup sh /scripts/backup.sh
ls -lah backups
docker compose --env-file .env.production run --rm postgres-backup sh /scripts/verify-restore.sh /backups/<backup-id>/wa_sender_app.dump
```

Criterio:

- Dump app y dump Evolution existen.
- Checksums existen.
- Restore temporal pasa.
- Hay copia externa o carpeta externa privada antes de clientes reales.

### 5.6 Evolution API

Pruebas:

1. `EVOLUTION_MOCK=false` en entorno beta controlado.
2. Crear instancia desde UI.
3. Ver QR.
4. Vincular WhatsApp propio.
5. Confirmar estado activo.
6. Enviar un mensaje unico a numero propio desde campana de prueba.
7. Enviar `STOP` o `BAJA` al numero conectado.
8. Confirmar `opt_out` y bloqueo posterior.
9. Desconectar/reconectar instancia y confirmar estado.

Criterio:

- No se exponen API keys ni provider internal IDs al frontend.
- Webhook requiere secreto.
- Mensajes de grupos y `fromMe` se ignoran.

### 5.7 Worker de campanas

Pruebas:

1. Campana mock de 3 mensajes con delay bajo permitido.
2. Start, pause, resume, stop.
3. Reiniciar `app-worker` mientras un mensaje esta en proceso.
4. Simular Redis caido.
5. Simular Evolution caido.
6. Validar limite diario del plan.
7. Validar ventana horaria fuera de horario.
8. Validar no envio a `EXPLICITLY_DENIED`.

Criterio:

- No hay duplicados en condiciones normales.
- Al detener, mensajes pendientes pasan a `CANCELLED`.
- Al fallar provider, se registran fallos y no se acelera el envio.

### 5.8 LLM provider

Pruebas:

1. `LLM_PROVIDER=mock`: playground responde.
2. `LLM_PROVIDER=deepseek` sin key: error claro, sin romper app.
3. `LLM_PROVIDER=openai` sin key: error claro, sin romper app.
4. Provider real con limite de mensajes bajo.
5. Webhook agente con LLM fallando activa circuit breaker.

Criterio:

- No se exponen API keys.
- No se guardan secretos en logs.
- Hay limite operativo de costo.

### 5.9 Privacidad y consentimiento

Pruebas:

1. Extraer numeros exige confirmacion de privacidad.
2. Numeros extraidos quedan `UNKNOWN`, no `EXPLICITLY_GRANTED`.
3. Crear campana desde numeros extraidos exige confirmacion/opt-in.
4. Opt-out por webhook bloquea futuros envios.
5. Export CSV/XLSX no incluye datos innecesarios.
6. Audit log registra extraccion sin guardar secretos.

Criterio:

- Ninguna ruta convierte extraccion en audiencia opt-in automaticamente.
- Ningun mensaje real sale a consentimiento denegado.

## 6. Plan de rollback

### 6.1 Antes del despliegue

1. Congelar commit y tag de release.
2. Guardar commit anterior conocido estable.
3. Ejecutar backup manual.
4. Verificar restore temporal.
5. Guardar copia de `.env.production` fuera del repo.
6. Guardar copia de `docker/caddy/Caddyfile` activo.
7. Confirmar que `REAL_SENDING_ENABLED=false` hasta completar smoke tests.

### 6.2 Rollback de aplicacion

Pasos:

1. Detener worker para evitar nuevos envios:

```bash
docker compose --env-file .env.production stop app-worker
```

2. Volver a imagen o commit anterior:

```bash
git checkout <commit-estable>
docker compose --env-file .env.production build next-app app-worker
docker compose --env-file .env.production up -d next-app caddy
```

3. Validar health:

```bash
curl -I https://app.midominio.com/api/health
```

4. Rehabilitar worker solo si la base y la app estan sanas:

```bash
docker compose --env-file .env.production up -d app-worker
```

### 6.3 Rollback de migracion/base de datos

Regla:

- No restaurar base completa salvo que la migracion rompa datos o la app no pueda operar.

Pasos si es necesario:

1. Detener app y worker.
2. Ejecutar backup del estado roto para investigacion.
3. Restaurar ultimo dump verificado.
4. Ejecutar migraciones compatibles con el codigo restaurado.
5. Levantar app.
6. Validar login, dashboard y health.

### 6.4 Rollback de Evolution o WhatsApp

Pasos:

1. Detener `app-worker`.
2. Poner `REAL_SENDING_ENABLED=false`.
3. Desactivar agente auto-reply o assignments afectados.
4. Detener `evolution-api` si hay sospecha de exposicion o comportamiento anomalo.
5. Rotar `EVOLUTION_API_KEY` y `EVOLUTION_WEBHOOK_SECRET` si hubo exposicion.
6. Comunicar pausa operacional a clientes beta.

### 6.5 Rollback DNS/HTTPS

Pasos:

1. Si Cloudflare proxy falla, cambiar temporalmente `app` a DNS only solo para diagnostico.
2. No usar SSL `Flexible`.
3. Restaurar Caddyfile anterior.
4. Reiniciar Caddy.
5. Si `evo` fue expuesto por error, eliminar DNS, rotar secretos y revisar logs.

## 7. Plan de soporte primeros 7 dias

### Dia 0 - Antes de invitar clientes

1. Definir responsable tecnico primario y respaldo.
2. Crear canal de soporte directo para clientes beta.
3. Preparar mensaje de alcance beta: no SLA comercial, riesgo de WhatsApp/Baileys, bajo volumen.
4. Confirmar terminos beta, privacidad y anti-spam aceptados.
5. Confirmar backups y alertas activos.
6. Confirmar que el boton operativo de emergencia es detener `app-worker` y desactivar envio real.

### Dias 1 a 3 - Supervision alta

Rutina dos veces al dia:

1. Revisar Uptime Kuma.
2. Revisar `/api/health/deep`.
3. Revisar `docker compose ps`.
4. Revisar logs de `next-app`, `app-worker`, `evolution-api` y `postgres-backup`.
5. Confirmar ultimo backup menor a 24 horas.
6. Revisar uso de disco.
7. Revisar instancias desconectadas.
8. Revisar fallos de campanas y opt-outs.
9. Revisar errores LLM y costo/token si provider real esta activo.
10. Contactar proactivamente al cliente si se pausa una campana o instancia.

### Dias 4 a 7 - Estabilizacion

Rutina diaria:

1. Revisar metricas basicas y alertas.
2. Revisar feedback del cliente.
3. Revisar cola de campanas y worker heartbeat.
4. Revisar logs de privacidad: extracciones, exports y opt-outs.
5. Ejecutar restore temporal si hubo migracion o cambio importante.
6. Documentar incidentes y bugs en backlog.

### Severidades de soporte

| Severidad | Ejemplo | Respuesta inicial | Accion |
|---|---|---:|---|
| S0 | Envio no autorizado, fuga de datos, Evolution expuesto | 15 min | Detener worker, desactivar envio real, rotar secretos, comunicar. |
| S1 | App caida, login roto, DB caida | 30 min | Revisar health/logs, rollback si aplica. |
| S2 | Campana no avanza, instancia desconectada | 2 h | Revisar worker, Evolution, estado de instancia. |
| S3 | Bug UI, reporte menor | 24 h | Registrar y priorizar. |

## 8. Decision de lanzamiento

Decision actual: NO LANZAR beta con clientes reales.

Se puede avanzar a beta privada cuando todos los P0 esten cerrados y exista evidencia de pruebas.

Criterios minimos para cambiar a GO beta privada:

1. Checklist P0 completo.
2. Release versionado y desplegado desde commit limpio.
3. Restore probado.
4. Evolution real validado en servidor ARM64.
5. Alertas activas.
6. Opt-in/opt-out operativo y documentado.
7. Limites de plan aplicados en backend.
8. Plan de soporte de 7 dias asignado a una persona.
9. Cliente beta acepta terminos, privacidad y limitaciones de WhatsApp/Baileys.

## 9. Decisiones registradas

1. La beta real debe iniciar con `REAL_SENDING_ENABLED=false` y activarse solo por cliente aprobado.
2. Evolution API no debe ser publica por defecto.
3. El agente WhatsApp auto-reply debe estar apagado por defecto.
4. Numeros extraidos nunca equivalen a opt-in.
5. `consentStatus=UNKNOWN` no debe considerarse suficiente para envio real en beta con clientes.
6. Backups locales no son suficientes para datos reales; se requiere copia externa privada.
7. Rate limiting in-memory solo es aceptable mientras haya una unica replica.
8. No se aceptan clientes reales sin procedimiento de incidente y responsable de soporte.
