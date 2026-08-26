# Rate limiting operativo

WA-Sender usa Redis como backend distribuido para los rate limits de API.

## Política

- En `production`, Redis es obligatorio por defecto aunque `RATE_LIMIT_REDIS_REQUIRED` no esté definido.
- `.env.production.example` fija explícitamente `RATE_LIMIT_REDIS_REQUIRED=true`.
- Si Redis no está configurado o falla mientras es obligatorio, la operación protegida devuelve `503 RATE_LIMIT_UNAVAILABLE` y **no continúa** con un contador local.
- `RATE_LIMIT_REDIS_REQUIRED=false` habilita deliberadamente el fallback local; está destinado a desarrollo/single-process controlado, no a producción multi-réplica.
- En desarrollo, el fallback local sigue permitido por defecto.

## Privacidad

Las claves lógicas pueden incorporar identificadores de workspace/usuario/IP. Antes de persistirse en Redis se transforman a SHA-256 bajo el prefijo `wa-sender:ratelimit:`. Los logs de fallback tampoco escriben la clave lógica completa.

## Respuestas

- límite excedido: HTTP `429`, `Retry-After`, `Cache-Control: no-store`;
- Redis requerido no disponible: HTTP `503`, código `RATE_LIMIT_UNAVAILABLE`, `Retry-After: 1`, `Cache-Control: no-store`.

## QA de staging pendiente

- levantar dos réplicas app compartiendo Redis y demostrar un único contador global;
- detener Redis y confirmar 503 en ambas réplicas, sin efectos posteriores de la mutación;
- restaurar Redis y comprobar recuperación sin reiniciar la app;
- confirmar que no aparecen workspace/user IDs en las keys Redis ni en logs de error;
- mantener `RATE_LIMIT_REDIS_REQUIRED=true` en staging/producción.
