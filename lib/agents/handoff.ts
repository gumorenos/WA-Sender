import { z } from "zod";

export const CONVERSATION_OPEN_STATUS = "OPEN";
export const CONVERSATION_HUMAN_HANDOFF_STATUS = "HUMAN_HANDOFF";

export const handoffKeywordsSchema = z.object({
  keywords: z
    .array(
      z
        .string()
        .trim()
        .min(2, "Cada keyword debe tener al menos 2 caracteres.")
        .max(80, "Cada keyword no puede superar 80 caracteres."),
    )
    .max(20, "No puedes configurar mas de 20 keywords de handoff.")
    .default([]),
});

export const conversationHandoffSchema = z
  .object({
    active: z.boolean(),
    confirmed: z.boolean().default(false),
    reason: z
      .string()
      .trim()
      .min(3, "Indica un motivo de al menos 3 caracteres.")
      .max(240, "El motivo no puede superar 240 caracteres."),
  })
  .superRefine((value, context) => {
    if (!value.confirmed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmed"],
        message: value.active
          ? "Debes confirmar explicitamente el inicio del handoff humano."
          : "Debes confirmar explicitamente que el agente puede reanudarse.",
      });
    }
  });

export type ConversationHandoffInput = z.infer<typeof conversationHandoffSchema>;
export type HandoffKeywordsInput = z.infer<typeof handoffKeywordsSchema>;

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeHandoffKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Map<string, string>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();
    const normalized = normalizeText(trimmed);

    if (normalized.length < 2 || normalized.length > 80) {
      continue;
    }

    if (!unique.has(normalized)) {
      unique.set(normalized, trimmed);
    }

    if (unique.size >= 20) {
      break;
    }
  }

  return [...unique.values()];
}

export function findMatchingHandoffKeyword(
  text: string,
  rawKeywords: unknown,
): string | null {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return null;
  }

  for (const keyword of normalizeHandoffKeywords(rawKeywords)) {
    const normalizedKeyword = normalizeText(keyword);
    const pattern = new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(normalizedKeyword)}($|[^a-z0-9])`,
      "i",
    );

    if (pattern.test(normalizedText)) {
      return keyword;
    }
  }

  return null;
}
