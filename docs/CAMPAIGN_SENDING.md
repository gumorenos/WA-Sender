# Campaign Sending Worker

## Alcance implementado

- Ruta UI: `/campaigns/send`.
- API de control:
  - `POST /api/campaigns/:id/start`
  - `POST /api/campaigns/:id/pause`
  - `POST /api/campaigns/:id/resume`
  - `POST /api/campaigns/:id/stop`
- Worker: `scripts/campaign-worker.mjs`.
- Cola BullMQ: `campaign-send`.
- Fallback de desarrollo: polling local cuando `REDIS_URL` no esta configurado.
- Webhook de opt-out: `POST /api/webhooks/evolution`.
- Cliente server-side de Evolution para texto: `sendEvolutionTextMessage`.

## Reglas operativas

- El frontend no envia `userId`.
- Cada endpoint deriva `userId` y `workspaceId` desde la sesion.
- El worker revalida estado de campana, instancia, horario activo, limite diario y consentimiento antes de cada mensaje.
- El envio es secuencial por worker, con concurrencia `1` y delay por campana.
- `REAL_SENDING_ENABLED=false` simula envio aunque Evolution real este configurado.
- `EVOLUTION_MOCK=true` fuerza modo mock.
- Los mensajes con `consent_status=EXPLICITLY_DENIED` se marcan `SKIPPED` y no se envian.
- Las palabras `STOP`, `BAJA`, `CANCELAR`, `CANCELAME`, `SALIR` y `UNSUBSCRIBE` registran opt-out via webhook.

## Variables necesarias

```env
REDIS_URL=redis://localhost:6379/0
WORKER_ENABLED=true
REAL_SENDING_ENABLED=false
EVOLUTION_API_BASE_URL=http://evolution-api:8080
EVOLUTION_API_KEY=replace-with-evolution-api-key
EVOLUTION_WEBHOOK_SECRET=replace-with-webhook-secret
EVOLUTION_MOCK=true
MOCK_WHATSAPP_ENABLED=true
```

## Ejecutar en desarrollo

Con Redis:

```bash
npm run worker
```

Sin Redis:

```bash
set REDIS_URL=
npm run worker
```

El modo sin Redis solo debe usarse en desarrollo. En beta/produccion debe usarse Redis + BullMQ.

## Flujo de envio

1. El operador selecciona campana e instancia activa.
2. Define fecha de inicio, horario activo, zona horaria y delay.
3. La API valida propiedad, estado, plan y configuracion.
4. La campana pasa a `SCHEDULED` o `RUNNING`.
5. El worker toma mensajes `PENDING`.
6. Si el destinatario tiene opt-out, el mensaje pasa a `SKIPPED`.
7. Si el horario no esta activo, el job se reencola conservadoramente.
8. Si el limite diario fue alcanzado, el job se reencola.
9. El worker envia por Evolution o simula envio en mock.
10. El mensaje pasa a `SENT` o `FAILED`.
11. Se registra `campaign_events`.
12. Si no quedan mensajes `PENDING`, la campana pasa a `COMPLETED`.

## Verificacion manual

1. Generar cliente Prisma:

```bash
npm run db:generate
```

2. Aplicar migraciones:

```bash
npm run db:migrate
```

3. Levantar app y worker:

```bash
npm run dev
npm run worker
```

4. Crear una instancia activa en modo mock.
5. Crear una campana con mensajes pendientes.
6. Abrir `/campaigns/send`.
7. Iniciar campana con `EVOLUTION_MOCK=true` y `REAL_SENDING_ENABLED=false`.
8. Revisar `/campaigns/status` y confirmar cambios en enviados/fallidos/logs.

## Pendientes antes de beta real

- Confirmar endpoint exacto de Evolution API para `sendText` en la version desplegada.
- Configurar webhook real de Evolution hacia `/api/webhooks/evolution`.
- Probar opt-out con payload real de Evolution.
- Definir limite diario por plan final.
- Agregar alerta si el worker queda detenido.
- Probar restauracion de backup antes de envio real.
