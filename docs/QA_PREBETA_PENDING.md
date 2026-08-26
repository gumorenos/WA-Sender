# QA pre-beta pendiente — WA-Sender

Última actualización: 2026-08-26

Este archivo es el **tracker operativo actual** de la cadena pre-beta posterior a Etapa 9. El detalle histórico por PR que existía en revisiones anteriores permanece en el historial Git; la evidencia específica de #28 está además en `docs/QA_PREBETA_STAGE28_RETENTION.md` y la auditoría acumulada actual en `docs/QA_PREBETA_FINAL_P0_AUDIT.md`.

La regla de seguridad sigue siendo obligatoria:

- `REAL_SENDING_ENABLED=false`;
- `AGENT_REAL_REPLY_ENABLED=false`;
- `PRIVACY_RETENTION_ENABLED=false` hasta validar backup/staging;
- ante resultado incierto del provider, **no reintentar a ciegas**.

---

## Estado actual de la cadena

`main` no representa todavía el estado funcional acumulado. La cadena revisada continúa mediante PRs apilados.

| PR | Área | Estado de código / evidencia |
| --- | --- | --- |
| #17 | Reconciliación `UNKNOWN_PROVIDER_RESULT` | implementado; QA automático registrado |
| #18 | Handoff humano persistente | implementado; QA automático registrado |
| #19 | Recovery de webhooks stale | implementado; QA automático registrado |
| #20 | Sweep global `CampaignMessage=SENDING` stale | implementado; QA automático registrado |
| #21 | Recovery seguro `PROVIDER_CONFIG_ERROR` conocido NOT_SENT | implementado; QA automático registrado |
| #22 | Cuota diaria de campañas atómica | implementado; QA automático registrado |
| #23 | Cap de bytes en extracción Evolution | implementado; QA automático registrado |
| #24 | Linealización de auto-replies pre-provider | implementado; QA automático registrado |
| #25 | Reconciliación `assistant_unknown` | implementado; QA automático registrado |
| #26 | Budgets diarios atómicos de agentes | implementado; QA automático registrado |
| #27 | Lease persistente pre-LLM `assistant_generating` | implementado; última evidencia conocida 196/196 tests, 46 archivos |
| #28 | Privacy retention runner | HEAD `09de3df3d8bcb44654322f3eebab373680311c16`; CI #155 `success`; evidencia 201/201 tests, 48 archivos |
| #29 | Rate limit distribuido fail-closed | HEAD `ed08088ff31bd91e0b82719278d0752cade31426`; CI #157 `success`; evidencia 204/204 tests, 48 archivos |
| #30 | Auditoría P0 final acumulada | código implementado; CI real del HEAD final todavía pendiente |

Todos estos PRs deben permanecer DRAFT mientras falte QA real/infra deliberado.

---

## #28 — cierre documental

- [x] HEAD actual revalidado: `09de3df3d8bcb44654322f3eebab373680311c16`.
- [x] CI run #155, id `32981041062`: `success`.
- [x] Evidencia automatizada detallada registrada en `docs/QA_PREBETA_STAGE28_RETENTION.md`.
- [x] `PRIVACY_RETENTION_ENABLED=false` por defecto.
- [x] Advisory transaction lock global.
- [x] Heartbeat/healthcheck.
- [x] OptOut preservado.
- [x] Solo webhooks `PROCESSED` elegibles para purge.
- [x] `HUMAN_HANDOFF` preservado.
- [x] `assistant_generating`, `assistant_pending`, `assistant_unknown` preservados.
- [x] Logs sin contenido/PII.

Pendiente únicamente de Etapa 10 / entorno real:

- [ ] habilitar retention destructivo solo en staging después de backup+restore verificado;
- [ ] ejecutar sobre DB no vacía representativa;
- [ ] dos runners reales simultáneos -> un solo sweep;
- [ ] kill/restart de runner/PostgreSQL y validación de heartbeat/recovery;
- [ ] alerta real de heartbeat stale;
- [ ] volumen alto: tiempo de sweep/locks y necesidad de batching/índices.

---

## #29 — rate limiting distribuido

- [x] Producción falla cerrado si Redis/limiter distribuido no está disponible.
- [x] Fallback local queda reservado para desarrollo explícito.
- [x] `.env.production.example`: `RATE_LIMIT_REDIS_REQUIRED=true`.
- [x] HEAD `ed08088ff31bd91e0b82719278d0752cade31426`.
- [x] CI #157: `success`.
- [x] Evidencia del PR: 204/204 tests, 48 archivos.

QA real pendiente:

- [ ] múltiples procesos app reales compartiendo Redis;
- [ ] caída/restart de Redis -> APIs protegidas fallan cerrado, sin multiplicar límites;
- [ ] recuperación de Redis -> servicio vuelve sin reinicio inconsistente;
- [ ] observar métricas/alertas de limiter unavailable.

---

## #30 — P0 encontrados y corregidos en auditoría final

La auditoría completa está en `docs/QA_PREBETA_FINAL_P0_AUDIT.md`.

### Body cap del webhook público Evolution

- [x] `EVOLUTION_WEBHOOK_MAX_BODY_BYTES`, default 1 MiB.
- [x] clamp máximo 10 MiB.
- [x] lectura streaming antes del JSON parse.
- [x] body excedido -> HTTP 413 / `WEBHOOK_BODY_TOO_LARGE`.
- [x] JSON malformado mantiene 400.
- [x] tests unitarios de configuración.

### Budget LLM global incluyendo playground

- [x] playground OWNER/ADMIN continúa rate-limited.
- [x] antes del proveedor reserva `reserveAgentLlmAttempt`.
- [x] comparte `AGENT_DAILY_LLM_LIMIT` y lock PostgreSQL con auto-replies.
- [x] límite agotado -> 429 / `AGENT_DAILY_LLM_LIMIT`.
- [x] metadata operacional del budget en logs/audit, sin contenido.

### Kill switch real de replies

- [x] el cliente Evolution de replies exige `REAL_SENDING_ENABLED=true` **y** `AGENT_REAL_REPLY_ENABLED=true` antes de cualquier fetch real;
- [x] `REAL_SENDING_ENABLED=true` con reply gate apagado -> 503 / `AGENT_REAL_REPLY_DISABLED` antes de red;
- [x] mock/real-send-off permanece seguro;
- [x] tests cubren bloqueo, mock y llamada real solo con ambos gates.

### Backup fail-closed

- [x] configuración incompleta de app DB o Evolution DB ya no se interpreta como skip exitoso;
- [x] host/port/user/password/database requeridos;
- [x] cada dump debe existir y ser no vacío;
- [x] fallo ocurre antes de heartbeat;
- [x] CI añade caso negativo: configuración incompleta -> fallo, sin heartbeat y sin dumps;
- [x] se restauró/verificó que el cambio del workflow conserva íntegros los smoke tests preexistentes.

### CI de #30

- [ ] ejecutar GitHub Actions sobre el **HEAD final** de #30.
- [ ] `npm ci`.
- [ ] `npm audit --audit-level=moderate`.
- [ ] Prisma generate + migrate/deploy.
- [ ] shell/node checks.
- [ ] Compose validation.
- [ ] lint.
- [ ] suite completa de tests.
- [ ] Next build.
- [ ] backup/restore round-trip.
- [ ] Docker build.
- [ ] privacy retention runtime smoke.
- [ ] Docker runtime/readiness como usuario `node`.

Las escrituras hechas por el GitHub connector en esta sesión no generaron un workflow automáticamente; por tanto no debe marcarse este bloque como PASS hasta tener evidencia real.

---

## Auditoría P0 final — resultado

Después de los fixes de #29/#30 **no queda otro P0 de código conocido** en las áreas revisadas:

- concurrencia;
- duplicados;
- crash windows;
- auth/roles;
- aislamiento multi-tenant;
- provider uncertainty;
- recovery;
- resource exhaustion;
- SSRF/URL handling;
- secrets/configuración;
- migraciones;
- privacy/retention;
- backup/restore;
- observabilidad de aplicación;
- Caddy/exposición de red.

No convertir P1/futuro en trabajo pre-beta artificial. Los riesgos no P0 están documentados en `docs/QA_PREBETA_FINAL_P0_AUDIT.md`.

---

## QA real obligatorio antes de beta privada

### Infraestructura / ARM64

- [ ] Oracle ARM64 provisionado con sizing y almacenamiento definidos.
- [ ] images utilizadas disponibles/validadas para ARM64.
- [ ] PostgreSQL y Redis persistentes.
- [ ] Evolution real desplegado con persistencia de sesiones.
- [ ] app + campaign worker + privacy-retention + backup service.
- [ ] Caddy/TLS y DNS/Cloudflare reales.
- [ ] restart completo del VPS sin pérdida de estado esperado.

### Google OAuth / tenancy / roles

- [ ] OAuth Google real con redirect URI productivo.
- [ ] closed beta allowlist real.
- [ ] ACTIVE/SUSPENDED.
- [ ] OWNER/ADMIN/MEMBER vía browser/HTTP real.
- [ ] cross-tenant negativo en operaciones sensibles.
- [ ] MEMBER no puede mutar campañas, handoff, agents, assignments ni reconciliaciones.

### Evolution / WhatsApp real — solo números propios

- [ ] QR y pairing.
- [ ] reconnect/restart de Evolution.
- [ ] webhook real autenticado.
- [ ] duplicate webhook.
- [ ] payload > cap produce 413 sin afectar proceso.
- [ ] campaña controlada solo a números propios.
- [ ] opt-out STOP/BAJA persistente.
- [ ] handoff por keyword.
- [ ] reply real únicamente durante ventana deliberada con ambos gates activos.
- [ ] confirmar que reply gate apagado bloquea también confirmación automática de opt-out aunque campaign real-send esté activo.

### Crash / uncertainty / múltiples procesos

- [ ] dos campaign workers reales simultáneos.
- [ ] crash después de claim y antes de provider -> recovery conocido NOT_SENT.
- [ ] crash/timeout después de provider start -> UNKNOWN, sin retry automático.
- [ ] dos consumidores sobre mismo webhook -> un solo efecto.
- [ ] `assistant_generating` lease real entre procesos.
- [ ] `assistant_pending/unknown` y reconciliación operacional.
- [ ] kill/restart durante LLM y provider calls.

### Fault injection

- [ ] Redis caído.
- [ ] Evolution caído.
- [ ] LLM timeout/5xx.
- [ ] PostgreSQL temporalmente no disponible.
- [ ] webhook duplicado/reordenado.
- [ ] respuesta Evolution oversized en extracción.
- [ ] body inbound Evolution oversized.

### Backups / recovery

- [ ] DB real no vacía.
- [ ] backup produce ambos dumps + checksums + manifest.
- [ ] config inválida deja backup unhealthy y no genera heartbeat falso.
- [ ] copia off-host privada.
- [ ] cifrado en reposo y, si se define, cifrado adicional.
- [ ] restore desde copia externa en entorno limpio.
- [ ] pérdida/reinicio de VPS y procedimiento de recuperación.
- [ ] decisión/documentación explícita de backup/recovery de sesiones Evolution.

### Observabilidad

- [ ] alerta app/readiness.
- [ ] worker stale.
- [ ] `UNKNOWN_PROVIDER_RESULT`.
- [ ] `assistant_unknown`.
- [ ] `AGENT_DAILY_LLM_LIMIT` y provider budget.
- [ ] rate limiter/Redis unavailable.
- [ ] backup stale.
- [ ] privacy-retention heartbeat stale.
- [ ] disco/volúmenes.
- [ ] Evolution caído.
- [ ] restart completo VPS.

---

## Gate para release candidate reproducible

No desplegar una colección arbitraria de ramas.

Antes de crear el RC:

- [ ] CI real del HEAD final de #30 en `success`.
- [ ] auditoría P0 final sin blocker nuevo.
- [ ] `REAL_SENDING_ENABLED=false`.
- [ ] `AGENT_REAL_REPLY_ENABLED=false`.
- [ ] `PRIVACY_RETENTION_ENABLED=false` para el primer arranque de staging.
- [ ] validar/configurar protección de `main`: el endpoint de rulesets devolvió lista vacía; la protección clásica no pudo leerse con la credencial del conector.
- [ ] crear una única referencia RC desde el SHA acumulado validado.
- [ ] registrar ese SHA y no desplegar por nombres sueltos de branches.

Después del RC validado automáticamente empieza Etapa 10. La activación de envío real y de retención destructiva requiere decisiones explícitas y ensayos acotados.
