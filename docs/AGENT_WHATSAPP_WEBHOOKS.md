# WA Sender - Agente IA conectado a WhatsApp

## Objetivo

Conectar mensajes entrantes de Evolution API con agentes IA activos asociados a una instancia WhatsApp.

Cuando llega un mensaje entrante:

1. El webhook valida `EVOLUTION_WEBHOOK_SECRET`.
2. Se identifica la instancia por `providerInstanceId`.
3. Se ignoran mensajes enviados por la propia instancia.
4. Se ignoran grupos por defecto.
5. Se registra el mensaje entrante en una conversacion.
6. Si el texto contiene opt-out, se guarda el bloqueo y solo se envia confirmacion.
7. Si hay un agente activo asociado, se carga su version activa.
8. Se aplica rate limit por contacto y circuit breaker de LLM.
9. Se genera respuesta con el adapter LLM configurado.
10. Se envia la respuesta por Evolution API server-side.
11. Se registran logs y mensajes de conversacion.

## Endpoint

`POST /api/webhooks/evolution`

Headers aceptados:

- `x-wa-sender-webhook-secret: <EVOLUTION_WEBHOOK_SECRET>`
- `x-evolution-webhook-secret: <EVOLUTION_WEBHOOK_SECRET>`

El endpoint no requiere sesion de usuario porque lo llama Evolution API, pero siempre valida el secreto compartido y resuelve `workspaceId` desde la instancia registrada.

## Asociacion agente-instancia

API interna:

- `GET /api/agents/assignments`
- `PUT /api/agents/assignments`

Payload para asignar:

```json
{
  "instanceId": "cm...",
  "agentId": "cm...",
  "active": true
}
```

Payload para quitar asignacion:

```json
{
  "instanceId": "cm...",
  "agentId": null,
  "active": true
}
```

Reglas:

- Una instancia puede tener un agente asignado por workspace.
- El webhook solo responde si el agente esta en estado `ACTIVE`.
- El frontend nunca envia `userId`; la API usa la sesion para validar ownership.

## Tablas nuevas

- `agent_instance_assignments`: asociacion entre instancia y agente.
- `conversations`: conversacion por workspace, instancia y telefono.
- `conversation_messages`: mensajes entrantes, salientes e internos.
- `opt_outs`: contactos bloqueados por solicitud explicita.

## Opt-out

Palabras detectadas:

- `STOP`
- `BAJA`
- `CANCELAR`
- `NO ENVIAR`
- `SALIR`
- `UNSUBSCRIBE`

Al detectar opt-out:

- Se crea o actualiza `opt_outs`.
- Se marcan mensajes de campana del telefono como `EXPLICITLY_DENIED` / `DENIED`.
- Se crea o actualiza `extracted_numbers` con `consent_status=EXPLICITLY_DENIED`.
- Se registra `audit_logs`.
- Se envia un unico mensaje de confirmacion si Evolution API esta disponible.

## Controles anti-abuso

- Ignora grupos por defecto con `AGENT_IGNORE_GROUPS=true`.
- Ignora mensajes `fromMe`.
- No responde a contactos en `opt_outs`.
- No responde a contactos con `consent_status=EXPLICITLY_DENIED`.
- Rate limit por contacto con `AGENT_REPLY_RATE_LIMIT_SECONDS`.
- Circuit breaker por agente si el LLM falla repetidamente.
- Modo mock para LLM y Evolution.
- No existen mecanismos de evasion o aceleracion de envio.

## Variables de entorno

```env
EVOLUTION_WEBHOOK_SECRET=replace-with-webhook-secret
AGENT_DEFAULT_TIMEZONE=America/Lima
AGENT_IGNORE_GROUPS=true
AGENT_REPLY_RATE_LIMIT_SECONDS=60
AGENT_LLM_CIRCUIT_BREAKER_THRESHOLD=3
AGENT_LLM_CIRCUIT_BREAKER_WINDOW_MINUTES=10
AGENT_WEBHOOK_MAX_MESSAGE_CHARS=1200
AGENT_OPT_OUT_CONFIRMATION=Confirmamos que no recibiras mas mensajes automaticos. Si necesitas ayuda, escribe a un asesor humano.
```

## Payload de ejemplo

```json
{
  "event": "messages.upsert",
  "instance": "ws_demo_sales",
  "data": {
    "key": {
      "remoteJid": "51999888777@s.whatsapp.net",
      "fromMe": false,
      "id": "ABC123"
    },
    "pushName": "Cliente Peru",
    "message": {
      "conversation": "Hola, quiero saber los precios"
    }
  }
}
```

Payload opt-out:

```json
{
  "event": "messages.upsert",
  "instance": "ws_demo_sales",
  "data": {
    "key": {
      "remoteJid": "51999888777@s.whatsapp.net",
      "fromMe": false,
      "id": "ABC124"
    },
    "pushName": "Cliente Peru",
    "message": {
      "conversation": "BAJA por favor"
    }
  }
}
```

## Verificacion manual

1. Crear una instancia WhatsApp.
2. Crear un agente y cambiarlo a `ACTIVE`.
3. Ir a `/agents` y asociar el agente a la instancia.
4. Configurar `EVOLUTION_WEBHOOK_SECRET`.
5. En desarrollo usar `EVOLUTION_MOCK=true` y `LLM_PROVIDER=mock`.
6. Enviar un payload de prueba:

```bash
curl -X POST http://localhost:3000/api/webhooks/evolution \
  -H "Content-Type: application/json" \
  -H "x-wa-sender-webhook-secret: $EVOLUTION_WEBHOOK_SECRET" \
  -d @payload.json
```

Resultado esperado:

- `agent_reply_sent` si hay agente activo y no hay bloqueo.
- `opt_out_registered` si el texto contiene opt-out.
- `ignored_from_me` si `fromMe=true`.
- `ignored_group` si el mensaje proviene de un grupo.
- `ignored_rate_limited` si el contacto ya recibio respuesta recientemente.

## Pendientes

- Validar el formato exacto de webhook de la version final de Evolution API en beta.
- Agregar panel dedicado de conversaciones.
- Agregar configuracion UI para horarios del agente.
- Agregar bloqueo manual de contactos desde UI.
