# WA Sender - Auth and Database Decision

## 1. Proposito

Este documento compara y decide la estrategia inicial de autenticacion y base de datos para WA Sender.

Opciones evaluadas:

- A: Supabase Cloud con Supabase Auth y Supabase Postgres.
- B: Self-hosted en Oracle con Auth.js/NextAuth y PostgreSQL propio.

Contexto:

- Despliegue inicial en Oracle Cloud Always Free.
- Costo minimo.
- 1 a 5 clientes iniciales.
- Dominio propio.
- App multiusuario.
- Secretos nunca expuestos al frontend.
- Nunca aceptar `userId` desde frontend.
- Planes y limites por usuario/workspace.
- Necesidad de escalar mas adelante.

## 2. Comparacion tecnica y operativa

| Criterio | A: Supabase Cloud | B: Self-hosted Oracle |
|---|---|---|
| Costo inicial | Bajo, pero puede crecer con limites de plan | Minimo si Oracle Always Free cubre la carga |
| Mantenimiento DB | Menor, Supabase opera la base | Mayor, backups y actualizaciones son responsabilidad propia |
| Auth Google | Supabase Auth lo resuelve bien | Auth.js lo resuelve bien con mas control en app |
| Control de datos | Parcialmente delegado a Supabase | Control completo en VPS propio |
| Latencia app-DB | Red externa desde Oracle a Supabase | Local dentro del VPS/Docker network |
| Backups | Mas facil si se usa tooling de Supabase | Deben implementarse y probarse manualmente |
| Multiusuario | Bueno, especialmente con RLS si se usa bien | Bueno si el backend aplica `workspaceId` consistentemente |
| Secretos | Seguros si se usa server-side correctamente | Seguros si solo viven en servidor y `.env` |
| Worker BullMQ | Worker en Oracle consulta Supabase por red | Worker consulta PostgreSQL local |
| Lock-in | Medio: Auth y DB acoplados a Supabase | Bajo: PostgreSQL estandar + Auth.js |
| Escalabilidad | Facil crecer operativamente al inicio | Escala vertical primero; luego migrar DB/Redis |
| Complejidad inicial | Baja para auth/db | Media por operacion, baja por arquitectura |
| Riesgo principal | Costos/limites y dependencia externa | Backups, restauracion y mantenimiento |

## 3. Recomendacion para MVP

Decision recomendada para MVP:

- Usar Auth.js con Google OAuth.
- Usar PostgreSQL self-hosted en Oracle Cloud.
- Usar sesiones server-side o sesiones persistidas en DB.
- Crear usuario y workspace personal al primer login.
- Aplicar planes y limites sobre `workspace`, no sobre `userId` enviado por frontend.

Razon:

- El objetivo explicito es costo minimo.
- El VPS Oracle ya sera el centro del despliegue.
- La carga inicial sera baja: 1 a 5 clientes.
- PostgreSQL local simplifica acceso de `web` y `worker`.
- Auth.js evita depender de Supabase Auth para identidad.
- PostgreSQL estandar facilita migrar despues a un Postgres administrado sin cambiar el dominio de la app.

## 4. Recomendacion para beta con clientes reales

Mantener la misma decision para beta real:

- Auth.js + Google OAuth.
- PostgreSQL self-hosted.
- Backups diarios obligatorios.
- Restauracion probada antes de operar con clientes reales.
- Monitoreo de DB, disco y backups.

Condicion:

- Si no se puede comprometer operacion minima de backups/restauracion, Supabase Cloud pasa a ser mejor opcion para beta real, aunque tenga mas costo y dependencia externa.

## 5. Recomendacion para escalar

Escalado recomendado:

1. Mantener Auth.js.
2. Migrar PostgreSQL self-hosted a PostgreSQL administrado cuando la carga u operacion lo justifique.
3. Mantener el mismo modelo de datos y la misma app, cambiando principalmente `DATABASE_URL`.
4. Separar Redis si BullMQ crece.
5. Separar workers horizontalmente.
6. Evaluar Supabase Postgres, Neon, Aiven, RDS o un VPS dedicado de PostgreSQL.

No se recomienda migrar a Supabase Auth como primer paso de escalado salvo que exista una razon fuerte:

- necesidad de features propias de Supabase Auth.
- equipo sin capacidad para mantener Auth.js.
- estrategia deliberada de usar ecosistema Supabase.

Razon:

- Cambiar de Auth.js a Supabase Auth afecta sesiones, callbacks, user IDs y flujos de login.
- Migrar solo PostgreSQL es menos invasivo que migrar auth y base a la vez.

## 6. Cambios necesarios al modelo de datos

### 6.1 Tenancy

Usar `workspace` como frontera tenant desde el inicio.

Tablas base:

- `users`
- `oauth_accounts` o tablas equivalentes del adapter Auth.js.
- `sessions` si se usan sesiones persistidas.
- `workspaces`
- `workspace_members`
- `plans`

Regla:

- Las tablas de negocio deben usar `workspaceId`.
- El backend deriva `userId` desde la sesion.
- El backend deriva `workspaceId` desde membresia activa.
- El frontend nunca envia `userId` como autoridad.

### 6.2 Planes y limites

El plan debe pertenecer al workspace:

- `workspaces.planId`
- `plans.maxInstances`
- `plans.maxActiveCampaigns`
- `plans.dailyMessageLimit`
- `plans.minDelaySeconds`
- `plans.maxAgents`
- `plans.allowRealSending`

Razon:

- Permite que un usuario tenga una cuenta personal hoy.
- Permite organizaciones/equipos despues sin rehacer planes.

### 6.3 Auth.js

Opcion recomendada:

- Usar adapter de DB para persistir usuarios, cuentas OAuth y sesiones.

Tablas conceptuales:

- `users`
- `accounts`
- `sessions`
- `verification_tokens`

Nota:

- Los nombres exactos dependen del ORM/adaptador elegido.
- Si el dominio necesita perfiles adicionales, agregar columnas propias o tabla `user_profiles`.

### 6.4 Recursos de negocio

Debe agregarse `workspaceId` a:

- `whatsapp_instances`
- `campaigns`
- `campaign_messages`
- `message_logs`
- `extracted_contacts`
- `contact_consent_events`
- `agents`
- `agent_prompt_versions`
- `usage_counters`
- `system_events`

## 7. Riesgos

### 7.1 Riesgos de Supabase Cloud

- Costos futuros si crecen almacenamiento, auth, proyectos o limites.
- Dependencia operativa externa.
- Latencia adicional desde Oracle hacia Supabase.
- Migracion futura puede incluir auth, usuarios y datos.
- Riesgo de usar Supabase desde frontend de forma insegura si se exponen llaves o se confia demasiado en cliente.

### 7.2 Riesgos de self-hosted

- Backups mal configurados pueden causar perdida de datos.
- Restauraciones no probadas pueden fallar cuando se necesiten.
- Actualizaciones de PostgreSQL/Auth.js requieren disciplina.
- VPS unico es punto unico de falla.
- Seguridad depende de firewall, Docker network, secrets y hardening.
- Si el disco se llena, PostgreSQL puede fallar.

### 7.3 Riesgos comunes

- Aceptar `userId` desde frontend puede romper aislamiento tenant.
- Consultas sin `workspaceId` pueden filtrar datos entre clientes.
- Secretos en variables publicas de Next.js pueden exponerse al navegador.
- Planes y limites mal aplicados pueden permitir abuso.

## 8. Decision final propuesta

Decision:

- Para MVP y beta: opcion B.
- Auth: Auth.js/NextAuth con Google OAuth.
- Database: PostgreSQL self-hosted en Oracle.
- Tenancy: `workspaceId` desde el inicio.
- Planes: asociados a `workspace`, no directamente a requests del frontend.
- Supabase: alternativa futura para Postgres administrado si la operacion self-hosted se vuelve una carga.
- Implementacion inicial: NextAuth v4 estable con `@next-auth/prisma-adapter`, Prisma ORM y sesiones persistidas en base de datos.
- Proteccion inicial: middleware para redireccion temprana y validacion server-side obligatoria en layouts/helpers antes de consultar datos privados.

Condicion de seguridad:

- Esta decision solo es valida si se implementan backups, restauracion probada, monitoreo de disco y reglas estrictas de autorizacion.

## 9. Que actualizar en PROJECT_BRIEF.md

Actualizar:

- Seccion de stack: cambiar auth pendiente a Auth.js con Google OAuth.
- Seccion de base de datos: registrar PostgreSQL self-hosted como decision para MVP/beta.
- Seccion de multi-tenancy: registrar `workspaceId` como decision recomendada.
- Seccion de decisiones pendientes: dejar Supabase como alternativa futura, no como decision abierta para MVP.
- Seccion de despliegue: mantener PostgreSQL y Redis privados dentro de Docker network.

## 10. Variables de entorno necesarias

### 10.1 Auth.js + Google OAuth

```text
AUTH_SECRET=
AUTH_URL=https://app.tudominio.com
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

Segun version/configuracion tambien puede usarse:

```text
NEXTAUTH_URL=https://app.tudominio.com
NEXTAUTH_SECRET=
```

### 10.2 PostgreSQL self-hosted

```text
DATABASE_URL=postgresql://user:password@postgres:5432/wa_sender
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=wa_sender
```

### 10.3 App y tenancy

```text
APP_URL=https://app.tudominio.com
NEXT_PUBLIC_APP_URL=https://app.tudominio.com
DEFAULT_PLAN_CODE=demo
DEFAULT_WORKSPACE_NAME=Mi workspace
```

### 10.4 Seguridad operacional

```text
REAL_SENDING_ENABLED=false
LOG_LEVEL=info
HEALTHCHECK_TOKEN=
BACKUP_RETENTION_DAYS=7
BACKUP_TARGET_PATH=
```

### 10.5 Si se elige Supabase en el futuro

Solo necesarias si se cambia de decision:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DATABASE_URL=
```

Regla:

- `SUPABASE_SERVICE_ROLE_KEY` nunca debe exponerse al frontend.
- Para la decision actual, estas variables no son requeridas.
