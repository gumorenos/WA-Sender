import { z } from "zod";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CAMPAIGN_CONSENT_SOURCES = [
  "CRM_IMPORT",
  "FORM",
  "CUSTOMER_REQUEST",
  "EXISTING_RELATIONSHIP",
  "OTHER",
] as const;

export const campaignStartSchema = z
  .object({
    instanceId: z.string().cuid("Selecciona una instancia valida."),
    scheduledStartAt: z.string().datetime("La fecha de inicio no es valida."),
    activeWindowStart: z
      .string()
      .regex(TIME_PATTERN, "La hora activa desde debe usar formato HH:mm."),
    activeWindowEnd: z
      .string()
      .regex(TIME_PATTERN, "La hora activa hasta debe usar formato HH:mm."),
    timezone: z
      .string()
      .trim()
      .min(3, "Selecciona una zona horaria.")
      .max(80, "La zona horaria es demasiado larga."),
    delaySeconds: z.coerce
      .number()
      .int()
      .min(30, "El delay minimo permitido es 30 segundos.")
      .max(3600, "El delay maximo permitido es 3600 segundos."),
    consentAttested: z.boolean().refine((value) => value === true, {
      message:
        "Debes confirmar que los destinatarios cuentan con consentimiento para recibir esta campana.",
    }),
    consentSource: z.enum(CAMPAIGN_CONSENT_SOURCES, {
      error: "Selecciona una fuente valida de consentimiento.",
    }),
    consentReference: z
      .string()
      .trim()
      .min(3, "Describe brevemente la evidencia o referencia del consentimiento.")
      .max(240, "La referencia de consentimiento es demasiado larga."),
  })
  .refine((value) => value.activeWindowStart !== value.activeWindowEnd, {
    message: "El horario activo debe tener inicio y fin distintos.",
    path: ["activeWindowEnd"],
  });

export type CampaignStartInput = z.infer<typeof campaignStartSchema>;

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isScheduledStartDue(
  scheduledStartAt: Date | string | null,
  now = new Date(),
) {
  if (!scheduledStartAt) {
    return true;
  }

  return new Date(scheduledStartAt).getTime() <= now.getTime();
}

export function getZonedTimeInMinutes(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: timezone,
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return hour * 60 + minute;
}

export function isWithinActiveWindow({
  activeWindowEnd,
  activeWindowStart,
  now = new Date(),
  timezone,
}: {
  activeWindowStart: string | null;
  activeWindowEnd: string | null;
  now?: Date;
  timezone: string;
}) {
  if (!activeWindowStart || !activeWindowEnd) {
    return true;
  }

  const start = timeToMinutes(activeWindowStart);
  const end = timeToMinutes(activeWindowEnd);
  const current = getZonedTimeInMinutes(now, timezone);

  if (start < end) {
    return current >= start && current <= end;
  }

  return current >= start || current <= end;
}

export function getConservativeRequeueDelayMs() {
  return 60_000;
}

export function containsOptOutKeyword(message: string) {
  return /\b(stop|baja|cancelar|cancelame|salir|unsubscribe)\b|no\s+enviar/i.test(message);
}
