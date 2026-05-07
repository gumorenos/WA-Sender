# WA Sender - Functional Plan

## 1. Proposito

Este documento fija la base funcional visible del MVP antes de conectar auth, base de datos y providers reales.

## 2. Base visual implementada

- Sidebar oscuro tipo operador con navegacion persistente.
- Shell responsive para rutas internas.
- Login separado como entrada publica.
- Rutas mock para dashboard, instancias, campanas, agentes y utilidades.
- Componentes reutilizables:
  - `AppShell`
  - `Sidebar`
  - `StatCard`
  - `EmptyState`
  - `PageHeader`
  - `Button`
  - `Card`
  - `SelectField`
  - `TextAreaField`

## 3. Limites intencionales de esta etapa

- No conecta Auth.js todavia.
- No conecta PostgreSQL, Redis ni BullMQ.
- No conecta Evolution API ni providers LLM reales.
- Usa datos mock para fijar experiencia y estructura.

## 4. Decision de estructura

- Las rutas internas viven bajo `app/(app)/...` para compartir `AppShell`.
- La ruta `/login` queda fuera del shell interno.
- La ruta `/` redirige a `/dashboard`.
- La UI usa tokens visuales centralizados en `app/globals.css`.

## 5. Siguiente paso funcional recomendado

- Integrar Auth.js con Google OAuth y guardas de sesion/workspace sin reescribir la base visual.
