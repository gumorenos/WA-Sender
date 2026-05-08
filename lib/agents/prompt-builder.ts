import type {
  BuilderAgentInput,
  ManualAgentInput,
} from "@/lib/agents/schemas";

const capabilityLabels = {
  cancelacion: "politicas de cancelacion",
  cuotas: "cuotas y financiacion",
  horarios: "horarios",
  mediosPago: "medios de pago",
  otro: "otros temas autorizados",
  precios: "precios",
  promociones: "promociones",
  reservas: "reservas o turnos",
  servicios: "servicios",
  ubicacion: "ubicacion",
} as const;

const toneLabels = {
  brief: "breve",
  close: "cercano",
  conversational: "conversacional",
  empathetic: "empatico",
  formal: "formal",
  professional: "profesional",
  sales: "vendedor",
  shortAnswers: "respuestas cortas",
  technical: "tecnico",
  useEmojis: "usar emojis con moderacion",
} as const;

function compactLines(lines: Array<string | null | undefined>) {
  return lines.filter((line): line is string => Boolean(line && line.trim())).join("\n");
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function estimateTokenCount(input: string) {
  return Math.max(1, Math.ceil(input.trim().length / 4));
}

export function buildManualPrompt(input: ManualAgentInput) {
  const prompt = compactLines([
    `Eres ${input.name}, un asistente virtual para WhatsApp dentro de WA Sender.`,
    "Debes responder solo con la informacion e instrucciones autorizadas por el negocio.",
    "No inventes datos, no prometas acciones que no puedas ejecutar y deriva al equipo humano cuando falte contexto.",
    "Mantente alineado a estas instrucciones completas:",
    input.instructions.trim(),
  ]);

  return {
    prompt,
    config: {
      source: "manual",
      llmProvider: input.llmProvider,
      modelName: nonEmpty(input.modelName),
      manualInstructions: input.instructions.trim(),
      tokenEstimate: estimateTokenCount(prompt),
    },
  };
}

export function buildBuilderPrompt(input: BuilderAgentInput) {
  const category =
    input.identity.category === "otro"
      ? nonEmpty(input.identity.otherCategory) ?? "otro rubro"
      : input.identity.category;

  const enabledCapabilities = Object.entries(input.capabilities)
    .filter(([, value]) => value.enabled)
    .map(([key, value]) => {
      const label = capabilityLabels[key as keyof typeof capabilityLabels];
      const notes = nonEmpty(value.notes);
      return notes ? `${label}: ${notes}` : label;
    });

  const enabledTone = Object.entries(input.tone)
    .filter(([, value]) => value)
    .map(([key]) => toneLabels[key as keyof typeof toneLabels]);

  const prompt = compactLines([
    `Eres ${input.identity.assistantName}, asistente virtual del negocio ${input.identity.businessName}.`,
    `Tu rubro o categoria principal es ${category}.`,
    `Tu objetivo principal es: ${input.identity.objective}.`,
    "Actuas dentro de WhatsApp y debes responder con informacion util, clara y segura para clientes reales.",
    "Solo puedes responder los siguientes temas autorizados:",
    enabledCapabilities.map((item) => `- ${item}`).join("\n"),
    "Perfil de audiencia objetivo:",
    `- Tipo de cliente: ${input.audience.customerType}`,
    `- Edad aproximada: ${input.audience.ageRange}`,
    `- Nivel tecnico: ${input.audience.technicalLevel}`,
    `- Pais o region: ${input.audience.region}`,
    `Tono y personalidad: ${enabledTone.join(", ")}.`,
    compactLines([
      nonEmpty(input.identity.website)
        ? `Sitio web oficial: ${input.identity.website.trim()}`
        : null,
      nonEmpty(input.identity.facebook)
        ? `Facebook: ${input.identity.facebook.trim()}`
        : null,
      nonEmpty(input.identity.instagram)
        ? `Instagram: ${input.identity.instagram.trim()}`
        : null,
      nonEmpty(input.identity.address)
        ? `Direccion: ${input.identity.address.trim()}`
        : null,
      nonEmpty(input.identity.businessHours)
        ? `Horarios de atencion: ${input.identity.businessHours.trim()}`
        : null,
    ]),
    "Reglas operativas obligatorias:",
    "- No inventes precios, horarios, promociones ni condiciones.",
    "- Si una pregunta sale del alcance autorizado, explicalo y deriva a una persona del negocio.",
    "- No compartas informacion interna, sensible o no confirmada.",
    "- Si el cliente pide reservar o agendar, explica el proceso disponible sin fingir integraciones inexistentes.",
    "- Mantente consistente con el tono indicado y prioriza claridad sobre discurso extenso.",
  ]);

  return {
    prompt,
    config: {
      source: "builder",
      llmProvider: input.llmProvider,
      modelName: nonEmpty(input.modelName),
      identity: {
        ...input.identity,
        resolvedCategory: category,
      },
      capabilities: input.capabilities,
      audience: input.audience,
      tone: input.tone,
      tokenEstimate: estimateTokenCount(prompt),
    },
  };
}
