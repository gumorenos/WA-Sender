import { z } from "zod";

export const routeIdSchema = z
  .string()
  .cuid("El identificador del recurso no es valido.");
