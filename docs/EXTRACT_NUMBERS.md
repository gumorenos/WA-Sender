# WA Sender - Extraer Numeros

## Alcance implementado

La utilidad `/utilities/extract-numbers` permite consultar numeros desde una instancia WhatsApp del workspace autenticado.

Incluye:

- Selector de instancia.
- Extraccion desde contactos.
- Extraccion desde chats.
- Filtros para omitir grupos, omitir registros sin telefono y quitar duplicados.
- Copia de numeros al portapapeles.
- Export CSV.
- Export XLSX sin dependencia externa.
- Persistencia en `extracted_numbers`.
- Registro de auditoria por extraccion.

## Backend

Endpoint:

```text
POST /api/utilities/extract-numbers
```

Payload:

```json
{
  "instanceId": "instance_id",
  "source": "contacts",
  "filters": {
    "omitGroups": true,
    "omitMissingPhones": true,
    "dedupe": true
  },
  "privacyConfirmed": true
}
```

Reglas:

- La sesion se valida con Auth.js.
- La instancia se filtra por `workspaceId`.
- El backend no acepta `userId` desde frontend.
- El frontend nunca recibe tokens, `EVOLUTION_API_KEY` ni URLs internas de Evolution.
- El endpoint exige `privacyConfirmed=true`.

## Evolution API

El cliente `lib/evolution/client.ts` agrega:

```ts
extractEvolutionNumbers({ providerInstanceName, source })
```

En modo real intenta:

- `/chat/findContacts/:instance`
- `/chat/findChats/:instance`

En modo mock (`EVOLUTION_MOCK=true`) devuelve datos simulados para contactos y chats.

## Normalizacion

El normalizador vive en `lib/extract-numbers.ts`.

Responsabilidades:

- Extraer telefonos desde JIDs de WhatsApp o strings formateados.
- Normalizar a formato `+<digits>`.
- Detectar grupos por `@g.us`.
- Validar longitud internacional razonable.
- Quitar duplicados.
- Preservar `displayName`, fuente, `isSaved` y fecha si el provider la entrega.

## Privacidad y consentimiento

Por defecto:

- `opt_in_status = UNKNOWN`.
- `consent_status = UNKNOWN`.
- Los numeros extraidos no se agregan automaticamente a campanas.
- Los numeros extraidos no se consideran opt-in.
- El uso posterior en campanas debe requerir confirmacion explicita.

## Auditoria

Cada extraccion crea un `audit_logs` con:

- usuario actor.
- workspace.
- instancia.
- fuente.
- cantidad raw.
- cantidad normalizada.
- modo mock/real.
- filtros aplicados.

No se registran tokens ni secretos.

## Pendientes

- Validar endpoints exactos contra la version de Evolution API desplegada.
- Agregar importacion controlada hacia audiencia/campana con confirmacion y opt-in.
- Agregar paginacion si Evolution devuelve grandes volumenes.
- Agregar retencion/limpieza de numeros extraidos por politica de privacidad.
