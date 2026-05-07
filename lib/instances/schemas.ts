import { z } from "zod";

export const instanceNameSchema = z
  .string()
  .trim()
  .min(3, "El nombre debe tener al menos 3 caracteres.")
  .max(40, "El nombre no puede superar 40 caracteres.")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Usa solo letras, numeros, guiones y guiones bajos.",
  );

export const createInstanceSchema = z.object({
  name: instanceNameSchema,
});

export const instanceStatusFilterSchema = z
  .enum(["all", "active", "connecting", "disconnected"])
  .default("all");

export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;
export type InstanceStatusFilter = z.infer<typeof instanceStatusFilterSchema>;
