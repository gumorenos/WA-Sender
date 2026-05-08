# WA Sender - Agent Playground

## Alcance implementado

El playground de agentes permite probar la version activa de un agente desde `/agents/playground` con una experiencia tipo telefono.

Incluye:

- Selector de agente del workspace autenticado.
- Chat simulado con historial de sesion.
- Reinicio local de conversacion.
- Envio server-side mediante `POST /api/agents/playground`.
- Persistencia de mensajes en `playground_sessions.messages_json`.
- Adapter LLM comun con proveedores `mock`, `deepseek` y `openai`.
- Manejo amigable de errores de configuracion como `DEEPSEEK_API_KEY is missing.`.

## Seguridad

- El frontend nunca recibe API keys ni secretos de proveedores LLM.
- El endpoint valida sesion con Auth.js.
- El endpoint filtra agente y sesion por `workspaceId`.
- El endpoint no acepta `userId` desde frontend.
- El input del usuario se limita a 1200 caracteres.
- Los logs registran IDs, provider, modelo y longitud del input, pero no guardan secretos.

## Provider adapter

La interfaz base vive en `lib/llm/types.ts`:

```ts
LLMProvider.generateResponse({
  systemPrompt,
  messages,
  temperature,
  maxTokens,
});
```

Proveedores actuales:

- `MockProvider`: desarrollo local sin costo.
- `DeepSeekProvider`: API compatible con chat completions.
- `OpenAIProvider`: API de chat completions.

La variable `LLM_PROVIDER` controla el provider operativo global:

```text
LLM_PROVIDER=mock
LLM_PROVIDER=deepseek
LLM_PROVIDER=openai
```

Si `LLM_PROVIDER` no existe, se usa el provider configurado en el agente. En desarrollo se recomienda mantener `LLM_PROVIDER=mock`.

## Variables de entorno

```text
LLM_PROVIDER=mock
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

## Pendientes

- Agregar Gemini y Groq al adapter.
- Permitir configuracion granular por agente cuando se habiliten credenciales por workspace.
- Agregar retencion configurable del historial de playground.
- Agregar metricas agregadas de consumo sin guardar contenido sensible innecesario.
