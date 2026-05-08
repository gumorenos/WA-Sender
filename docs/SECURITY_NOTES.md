# WA Sender - Security Notes

## Estado de auditoria

Fecha: 2026-05-08

Alcance revisado:

- Rutas API bajo `app/api`.
- Autenticacion con Auth.js.
- Validacion multi-tenant por `workspaceId`.
- Integracion Evolution API.
- Providers LLM.
- Healthchecks y observabilidad.
- Logs y audit logs.
- Variables de entorno.

## Controles implementados

### Autenticacion

- Las rutas internas de UI se protegen por `middleware.ts`.
- Las rutas API protegidas se bloquean temprano si no existe cookie de sesion:
  - `/api/me`
  - `/api/instances`
  - `/api/campaigns`
  - `/api/agents`
  - `/api/utilities`
- Las rutas API mantienen validacion server-side con `getCurrentWorkspace()`; el middleware es defensa adicional, no fuente de autorizacion.

### Autorizacion y ownership

- La frontera tenant es `workspaceId`.
- Los endpoints de negocio derivan `userId` y `workspaceId` desde la sesion.
- No se acepta `userId` desde el frontend como autoridad.
- Los recursos sensibles se consultan con filtro `workspaceId`.
- Se agregaron helpers en `server/security/guards.ts`:
  - `requireUser()`
  - `requireWorkspace()`
  - `requireOwnership()`

### Validacion de inputs

- Los cuerpos JSON de endpoints de escritura usan Zod.
- Los parametros dinamicos principales usan `routeIdSchema`.
- Las campanas se parsean y validan nuevamente en backend antes de persistir.
- La extraccion de numeros requiere `privacyConfirmed=true`.

### Rate limiting

Se agrego rate limiting basico in-memory en `lib/security/rate-limit.ts`.

Protege:

- Crear instancias.
- Consultar QR/estado de instancias.
- Eliminar instancias.
- Crear campanas.
- Iniciar, pausar, reanudar y detener campanas.
- Crear/editar/activar agentes.
- Playground de agentes.
- Asignacion agente-instancia.
- Webhook Evolution por IP.
- Extraccion de numeros.

Limitacion:

- Es in-memory y sirve para beta single-server.
- Si se escala a multiples replicas, debe migrarse a Redis.

### Secretos

- No hay secretos bajo `NEXT_PUBLIC_*`.
- `NEXT_PUBLIC_APP_URL` es el unico valor publico esperado.
- Evolution API y LLM API keys solo se leen server-side.
- `EVOLUTION_WEBHOOK_SECRET` protege `/api/webhooks/evolution`.
- `/api/health/deep` exige `HEALTHCHECK_TOKEN` en produccion.

### SSRF y llamadas externas

- Evolution API usa URL desde variable de entorno, no desde el usuario.
- El cliente Evolution valida que `EVOLUTION_API_BASE_URL` use `http` o `https`.
- El worker aplica la misma validacion antes de enviar mensajes.
- Providers LLM usan URLs fijas para OpenAI y DeepSeek.

### Logs y datos sensibles

- No se loguean API keys ni tokens.
- No se loguean mensajes completos en consola.
- Audit logs de webhooks evitan telefono completo y guardan:
  - `phoneLast4`
  - `phoneHash`
- Las conversaciones y campanas siguen almacenando telefono/mensaje porque son datos funcionales del producto; deben tratarse como datos personales.

### Auditoria

Se registran audit logs para:

- Login.
- Crear instancia.
- Eliminar instancia.
- Crear campana.
- Iniciar campana.
- Crear/editar/activar/desactivar agente.
- Asociar agente-instancia.
- Extraer numeros.
- Opt-out.
- Fallos LLM relevantes.

## Endpoints publicos permitidos

- `/api/auth/*`: Auth.js.
- `/api/health`: healthcheck basico sin datos sensibles.
- `/api/health/deep`: protegido por token en produccion.
- `/api/webhooks/evolution`: protegido por secreto compartido y rate limit.

## Riesgos pendientes

- No hay RLS de PostgreSQL porque el MVP usa Prisma con validaciones server-side. Si se adopta Supabase o acceso directo por cliente, se deben crear policies RLS.
- El rate limit in-memory no protege despliegues multi-replica.
- Falta una politica legal formal de privacidad, anti-spam y retencion por pais.
- Falta panel de administracion para bloqueo manual de contactos.
- Falta rotacion documentada de secretos.
- Falta prueba automatizada de autorizacion cruzada entre workspaces.
- Falta bloqueo por plan para volumen horario mas granular.

## Reglas para nuevos endpoints

1. No aceptar `userId` desde frontend.
2. Resolver usuario y workspace en backend.
3. Validar input con Zod.
4. Filtrar todo recurso por `workspaceId`.
5. No devolver tokens, provider IDs internos ni secretos.
6. Agregar rate limit si el endpoint escribe datos, llama proveedores externos o consume LLM.
7. Registrar audit log si cambia estado critico.
8. No guardar mensajes completos en logs operativos.
9. Si el endpoint es interno, proteger con token, secreto o red privada.

## Verificacion recomendada

```bash
npm run lint
npm run test
npm run build
```

En produccion, validar:

```bash
curl -i https://app.midominio.com/api/health/deep
curl -i -H "x-healthcheck-token: $HEALTHCHECK_TOKEN" https://app.midominio.com/api/health/deep
curl -i https://app.midominio.com/api/instances
```

Resultado esperado:

- `/api/health/deep` sin token devuelve `401`.
- `/api/health/deep` con token devuelve estado.
- `/api/instances` sin sesion devuelve `401`.
