# WA Sender - WhatsApp Instances

## Decision

El modulo de instancias WhatsApp usa un adapter server-side para Evolution API.

Reglas:

- El frontend nunca llama a Evolution API.
- `EVOLUTION_API_KEY`, `EVOLUTION_API_BASE_URL` y tokens internos quedan solo en backend.
- Cada instancia pertenece a `workspaceId`; el frontend no envia `userId`.
- El nombre publico de instancia se valida con letras, numeros, guiones y guiones bajos.
- El nombre real usado ante Evolution se deriva como `ws_<workspace-prefix>_<name>` para evitar colisiones entre tenants.
- El endpoint de QR devuelve solo `qrBase64`, `pairingCode` y estado normalizado.

## Endpoints internos de WA Sender

```text
GET    /api/instances
POST   /api/instances
GET    /api/instances/:id/status
GET    /api/instances/:id/qr
DELETE /api/instances/:id
```

Todos requieren sesion Auth.js activa y validan `workspaceId`.

## Endpoints Evolution API usados

Segun documentacion oficial Evolution API v2:

```text
POST   /instance/create
GET    /instance/connect/{instance}
GET    /instance/connectionState/{instance}
DELETE /instance/delete/{instance}
```

El header `apikey` solo se agrega server-side.

## Variables de entorno

```text
EVOLUTION_API_BASE_URL=http://evolution-api:8080
EVOLUTION_API_KEY=
EVOLUTION_MOCK=true
EVOLUTION_TIMEOUT_MS=8000
```

Compatibilidad:

- `MOCK_WHATSAPP_ENABLED=true` tambien activa modo mock para compatibilidad con la configuracion previa.
- En produccion beta usar `EVOLUTION_MOCK=false`.

## Probar con mock

1. Configurar `.env`:

```text
EVOLUTION_MOCK=true
MOCK_WHATSAPP_ENABLED=true
```

2. Ejecutar:

```bash
npm run dev
```

3. Abrir `/instances`.
4. Crear una instancia como `ventas_lima`.
5. Abrir el modal QR.
6. Verificar que se muestra un QR generado localmente y que el estado queda `connecting`.

## Probar con Evolution real

1. Levantar Evolution API por Docker Compose.
2. Configurar `.env.production` o `.env`:

```text
EVOLUTION_MOCK=false
MOCK_WHATSAPP_ENABLED=false
EVOLUTION_API_BASE_URL=http://evolution-api:8080
EVOLUTION_API_KEY=<global-api-key>
```

3. Ejecutar migraciones de WA Sender.
4. Iniciar la app.
5. Crear una instancia.
6. Abrir QR y escanearlo desde WhatsApp.
7. Usar `Actualizar estado` hasta ver `Open`.

## Seguridad

- No retornar `providerInstanceId`, `hash.apikey`, `serverUrl`, `access_token_wa_business` ni configuracion completa de Evolution.
- No guardar el `hash.apikey` devuelto por Evolution.
- No exponer `evo.midominio.com` salvo necesidad administrativa protegida.
- Eliminar una instancia intenta eliminarla primero en Evolution; si Evolution responde 404, se limpia el registro local.

## Referencias

- Evolution API Create Instance: https://doc.evolution-api.com/v2/api-reference/instance-controller/create-instance-basic
- Evolution API Instance Connect: https://doc.evolution-api.com/v2/api-reference/instance-controller/instance-connect
- Evolution API Connection State: https://doc.evolution-api.com/v2/api-reference/instance-controller/connection-state
- Evolution API Delete Instance: https://doc.evolution-api.com/v2/api-reference/instance-controller/delete-instance
