# WA Sender - Create Campaign

## Decision

El modulo de crear campaña usa:

- preview local con `lib/campaign-parser.ts`
- guardado server-side con `POST /api/campaigns`
- reparseo obligatorio en backend antes de persistir

Reglas:

- el frontend nunca envia `userId`
- la instancia seleccionada debe pertenecer al `workspaceId` autenticado
- la instancia debe estar en estado `ACTIVE`
- si existe al menos un error de parser, la campaña no se guarda
- la campaña se crea en estado `DRAFT`
- todos los `campaign_messages` se crean en estado `PENDING`

## Formato soportado

- columna 1: numero WhatsApp con formato internacional
- columna 2: mensaje
- separadores validos:
  - tab
  - coma
  - espacios multiples

Ejemplos:

```text
+51 999 888 777    Hola {nombre}
+52 55 1234 5678,Seguimos tu solicitud
+54 9 11 2345 6789	Hola desde Argentina
+57 300 123 4567	Hola desde Colombia
```

## Validacion de numero

La normalizacion actual exige:

- solo 11 a 15 digitos despues de limpiar el formato
- primer digito distinto de `0`
- salida normalizada con prefijo `+`

Esto fuerza un formato internacional tipo E.164 simplificado y rechaza numeros locales sin codigo de pais.

## Endpoints internos

```text
POST /api/campaigns
```

Payload:

```json
{
  "name": "seguimiento_mayo",
  "instanceId": "ckxxxxxxxxxxxxxxxx",
  "rawInput": "+51999888777\tHola {nombre}"
}
```

## Tests

Cobertura inicial del parser:

- tab, coma y espacios multiples
- preservacion del mensaje
- omision de lineas vacias
- error por separador ausente
- error por mensaje vacio
- rechazo de numeros sin codigo internacional
