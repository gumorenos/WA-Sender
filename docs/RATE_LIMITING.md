# Rate limiting distribuido

## Política

WA-Sender usa Redis como backend compartido para los límites de frecuencia de las APIs sensibles. El objetivo es que dos o más réplicas de `next-app` compartan el mismo contador y no puedan multiplicar el límite por la cantidad de procesos.

### Producción / beta

- `REDIS_URL` debe estar configurado y apuntar al Redis interno del stack.
- `RATE_LIMIT_REDIS_REQUIRED=true` debe mantenerse en producción.
- Si Redis no está disponible, las operaciones protegidas deben fallar con HTTP `503` y código `RATE_LIMIT_UNAVAILABLE`.
- No se debe cambiar a fallback local para mantener tráfico durante una caída de Redis: eso convertiría un fallo visible en una pérdida silenciosa de protección.

### Desarrollo

El fallback local en memoria existe únicamente para facilitar desarrollo sin Redis cuando `RATE_LIMIT_REDIS_REQUIRED=false`. Ese modo no es válido para despliegues con varias réplicas ni para beta real.

## Implementación

- Cada clave lógica se transforma a SHA-256 antes de almacenarse en Redis; no se guardan IDs de usuario/workspace en claro en el nombre de la clave.
- Un script Lua ejecuta de forma atómica `INCR`, consulta el TTL y fija `PEXPIRE` al crear una ventana nueva.
- Superar el límite devuelve HTTP `429` con `Retry-After`.
- No poder aplicar un límite obligatorio devuelve HTTP `503` con `Retry-After: 1`.
- Las respuestas 429/503 usan `Cache-Control: no-store`.

## QA obligatorio

Antes de producción:

- comprobar dos conexiones/procesos independientes contra el mismo Redis;
- comprobar que el cuarto request con límite 3 es rechazado aunque se alterne entre procesos;
- detener Redis y verificar que una mutación sensible devuelve 503 cuando el backend es obligatorio;
- restaurar Redis y comprobar recuperación sin reiniciar la app si el cliente logra reconectar;
- validar los límites desde dos réplicas reales antes de habilitar tráfico.
