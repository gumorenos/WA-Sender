# Agents Create Module

## Alcance implementado

- Rutas:
  - `/agents`
  - `/agents/create`
  - `/agents/create/manual`
  - `/agents/create/builder`
  - `/agents/:id/edit`
- API:
  - `GET /api/agents`
  - `POST /api/agents`
  - `GET /api/agents/:id`
  - `GET /api/agents/:id/versions`
  - `PATCH /api/agents/:id`
  - `PATCH /api/agents/:id/status`

## Decisiones de modelado

- `agents.source` guarda el origen principal del agente: `MANUAL` o `BUILDER`.
- `agent_versions.source` guarda el origen exacto de cada version.
- `agent_versions.generated_prompt` guarda el prompt final construido por el backend.
- `agent_versions.system_prompt` se mantiene sincronizado con `generated_prompt` para no romper el modelo ya existente.
- `agent_versions.config_json` guarda el JSON versionable.
- `agent_versions.builder_input_json` guarda la entrada del builder cuando aplica.
- Cada guardado en edicion crea una nueva version y actualiza `activeAgentVersionId`.

## Reglas funcionales

- El builder no usa LLM para redactar el prompt.
- El prompt se genera con template deterministico en `lib/agents/prompt-builder.ts`.
- El frontend nunca envia `userId`; el backend deriva `workspaceId` desde la sesion.
- El limite de agentes se valida contra `plans.maxAgents`.
- El estado operativo del agente se controla por `PATCH /api/agents/:id/status`.
- El historial visible de versiones sale de `GET /api/agents/:id/versions`.

## Pendientes fuera de este modulo

- Playground conectado a un provider LLM real o mock.
- Auto-reply real sobre mensajes entrantes.
- UI de detalle por agente y navegacion de historial completo de versiones.
