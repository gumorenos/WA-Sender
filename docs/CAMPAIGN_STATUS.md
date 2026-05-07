# Estado de campanas

## Decision tecnica

La pantalla `/campaigns/status` separa listado y detalle.

- `GET /api/campaigns` devuelve solo resumenes de campana.
- `GET /api/campaigns/:id` devuelve metricas y mensajes de una sola campana.
- `DELETE /api/campaigns/:id` elimina una campana solo si pertenece al workspace autenticado.

## Motivo

Separar listado y detalle evita traer todos los mensajes de todas las campanas en cada carga.

## Seguridad

- Todas las consultas filtran por `workspaceId`.
- El frontend no envia `userId`.
- El borrado registra evento en `audit_logs`.
