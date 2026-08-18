import { z } from "zod";

const providerSchema = z.enum(["MOCK", "DEEPSEEK", "OPENAI", "GEMINI", "GROQ"]);

const capabilityItemSchema = z.object({
  enabled: z.boolean().default(false),
  notes: z.string().trim().max(500, "La nota no puede superar 500 caracteres.").optional().default(""),
});

const builderCapabilitiesSchema = z.object({
  servicios: capabilityItemSchema,
  precios: capabilityItemSchema,
  horarios: capabilityItemSchema,
  ubicacion: capabilityItemSchema,
  promociones: capabilityItemSchema,
  reservas: capabilityItemSchema,
  mediosPago: capabilityItemSchema,
  cancelacion: capabilityItemSchema,
  cuotas: capabilityItemSchema,
  otro: capabilityItemSchema,
});

export const builderAudienceSchema = z.object({
  customerType: z.string().trim().min(2, "Describe el tipo de cliente."),
  ageRange: z.string().trim().min(2, "Indica una edad aproximada."),
  technicalLevel: z.string().trim().min(2, "Indica el nivel tecnico."),
  region: z.string().trim().min(2, "Indica el pais o region."),
});

export const builderIdentitySchema = z.object({
  category: z.string().trim().min(2, "Selecciona o describe el rubro."),
  assistantName: z.string().trim().min(3, "El nombre del asistente debe tener al menos 3 caracteres.").max(80, "El nombre del asistente no puede superar 80 caracteres."),
  businessName: z.string().trim().min(2, "Ingresa el nombre del negocio.").max(120, "El nombre del negocio es demasiado largo."),
  website: z.string().trim().max(200, "La web es demasiado larga.").optional().default(""),
  facebook: z.string().trim().max(200, "Facebook es demasiado largo.").optional().default(""),
  instagram: z.string().trim().max(200, "Instagram es demasiado largo.").optional().default(""),
  address: z.string().trim().max(200, "La direccion es demasiado larga.").optional().default(""),
  businessHours: z.string().trim().max(200, "Los horarios son demasiado largos.").optional().default(""),
  otherCategory: z.string().trim().max(120, "El otro rubro es demasiado largo.").optional().default(""),
  objective: z.string().trim().min(10, "Describe el objetivo del asistente.").max(500, "El objetivo es demasiado largo."),
});

export const builderToneSchema = z.object({
  formal: z.boolean().default(false),
  professional: z.boolean().default(false),
  technical: z.boolean().default(false),
  brief: z.boolean().default(false),
  close: z.boolean().default(false),
  sales: z.boolean().default(false),
  empathetic: z.boolean().default(false),
  conversational: z.boolean().default(false),
  useEmojis: z.boolean().default(false),
  shortAnswers: z.boolean().default(false),
});

export const manualAgentSchema = z.object({
  source: z.literal("MANUAL"),
  name: z.string().trim().min(3, "El nombre del agente debe tener al menos 3 caracteres.").max(80, "El nombre del agente no puede superar 80 caracteres."),
  instructions: z.string().trim().min(40, "Las instrucciones deben tener al menos 40 caracteres.").max(8000, "Las instrucciones son demasiado largas."),
  llmProvider: providerSchema.default("MOCK"),
  modelName: z.string().trim().max(120, "El nombre del modelo es demasiado largo.").optional().default(""),
});

export const builderAgentSchema = z.object({
  source: z.literal("BUILDER"),
  llmProvider: providerSchema.default("MOCK"),
  modelName: z.string().trim().max(120, "El nombre del modelo es demasiado largo.").optional().default(""),
  identity: builderIdentitySchema,
  capabilities: builderCapabilitiesSchema,
  audience: builderAudienceSchema,
  tone: builderToneSchema,
}).superRefine((value, context) => {
  const enabledCapabilities = Object.values(value.capabilities).filter(
    (item) => item.enabled,
  );

  if (enabledCapabilities.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Selecciona al menos un tema que el agente pueda responder.",
      path: ["capabilities"],
    });
  }

  const enabledTone = Object.values(value.tone).some(Boolean);

  if (!enabledTone) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Selecciona al menos un rasgo de tono o personalidad.",
      path: ["tone"],
    });
  }
});

export const createAgentSchema = z.discriminatedUnion("source", [
  manualAgentSchema,
  builderAgentSchema,
]);

export const updateAgentSchema = z.discriminatedUnion("source", [
  manualAgentSchema.extend({
    id: z.string().cuid().optional(),
  }),
  builderAgentSchema.extend({
    id: z.string().cuid().optional(),
  }),
]);

export const updateAgentStatusSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]),
});

export const updateAgentAutoReplySchema = z
  .object({
    enabled: z.boolean(),
    confirmed: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.enabled && !value.confirmed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Debes confirmar explicitamente la activacion de respuestas automaticas.",
        path: ["confirmed"],
      });
    }
  });

export const agentInstanceAssignmentSchema = z.object({
  instanceId: z.string().cuid("Selecciona una instancia valida."),
  agentId: z.string().cuid("Selecciona un agente valido.").nullable(),
  active: z.boolean().default(true),
});

export type ManualAgentInput = z.infer<typeof manualAgentSchema>;
export type BuilderAgentInput = z.infer<typeof builderAgentSchema>;
export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type UpdateAgentStatusInput = z.infer<typeof updateAgentStatusSchema>;
export type UpdateAgentAutoReplyInput = z.infer<
  typeof updateAgentAutoReplySchema
>;
export type AgentInstanceAssignmentInput = z.infer<
  typeof agentInstanceAssignmentSchema
>;
