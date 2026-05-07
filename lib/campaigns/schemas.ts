import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "El nombre de campaña debe tener al menos 3 caracteres.")
    .max(80, "El nombre de campaña no puede superar 80 caracteres."),
  instanceId: z.string().cuid("Selecciona una instancia valida."),
  rawInput: z
    .string()
    .trim()
    .min(1, "Pega al menos una fila para crear la campaña."),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
