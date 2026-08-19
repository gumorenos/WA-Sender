export const CLAIMED_NOT_SENT = "CLAIMED_NOT_SENT";
export const PROVIDER_CALL_STARTED = "PROVIDER_CALL_STARTED";
export const UNKNOWN_PROVIDER_RESULT = "UNKNOWN_PROVIDER_RESULT";

export class ProviderSendError extends Error {
  constructor(message, { code, outcome = "NOT_SENT", retryable = false } = {}) {
    super(message);
    this.name = "ProviderSendError";
    this.code = code ?? "PROVIDER_SEND_ERROR";
    this.outcome = outcome;
    this.retryable = retryable;
  }
}

export function campaignJobId(campaignId) {
  return `campaign-${campaignId}`;
}

export async function claimNextPendingMessage(prisma, campaign) {
  const candidate = await prisma.campaignMessage.findFirst({
    where: {
      campaignId: campaign.id,
      workspaceId: campaign.workspaceId,
      status: "PENDING",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!candidate) {
    return null;
  }

  const claimed = await prisma.campaignMessage.updateMany({
    where: {
      id: candidate.id,
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      status: "PENDING",
    },
    data: {
      status: "SENDING",
      lastErrorCode: CLAIMED_NOT_SENT,
      lastErrorMessage: "Mensaje reclamado por el worker; proveedor aun no invocado.",
    },
  });

  if (claimed.count !== 1) {
    return null;
  }

  return {
    ...candidate,
    status: "SENDING",
    lastErrorCode: CLAIMED_NOT_SENT,
  };
}

export async function markProviderCallStarted(prisma, message) {
  const updated = await prisma.campaignMessage.updateMany({
    where: {
      id: message.id,
      status: "SENDING",
      lastErrorCode: CLAIMED_NOT_SENT,
    },
    data: {
      attemptCount: { increment: 1 },
      lastErrorCode: PROVIDER_CALL_STARTED,
      lastErrorMessage: "Llamada al proveedor iniciada; resultado aun no confirmado.",
    },
  });

  return updated.count === 1;
}

export async function recoverStaleSendingMessages(
  prisma,
  campaign,
  { now = new Date(), staleAfterMs = 10 * 60_000 } = {},
) {
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const stale = await prisma.campaignMessage.findMany({
    where: {
      campaignId: campaign.id,
      workspaceId: campaign.workspaceId,
      status: "SENDING",
      updatedAt: { lt: cutoff },
    },
    select: {
      id: true,
      lastErrorCode: true,
    },
  });

  const recovered = [];

  for (const message of stale) {
    if (message.lastErrorCode === CLAIMED_NOT_SENT) {
      const reset = await prisma.campaignMessage.updateMany({
        where: {
          id: message.id,
          status: "SENDING",
          lastErrorCode: CLAIMED_NOT_SENT,
          updatedAt: { lt: cutoff },
        },
        data: {
          status: "PENDING",
          lastErrorCode: "CLAIM_RECOVERED",
          lastErrorMessage:
            "Claim stale recuperado antes de invocar al proveedor; seguro para reprocesar.",
        },
      });

      if (reset.count === 1) {
        recovered.push({ id: message.id, action: "RESET_TO_PENDING" });
      }
      continue;
    }

    const quarantined = await prisma.campaignMessage.updateMany({
      where: {
        id: message.id,
        status: "SENDING",
        updatedAt: { lt: cutoff },
      },
      data: {
        status: "FAILED",
        lastErrorCode: UNKNOWN_PROVIDER_RESULT,
        lastErrorMessage:
          "El worker quedo stale despues de iniciar el envio. No reintentar automaticamente: verificar con el proveedor.",
      },
    });

    if (quarantined.count === 1) {
      recovered.push({ id: message.id, action: "QUARANTINED_UNKNOWN" });
    }
  }

  return recovered;
}

function getZonedDateParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function getTimezoneOffsetMs(date, timezone) {
  const parts = getZonedDateParts(date, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function localMidnightToUtc(year, month, day, timezone) {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const firstOffset = getTimezoneOffsetMs(guess, timezone);
  let result = new Date(guess.getTime() - firstOffset);
  const secondOffset = getTimezoneOffsetMs(result, timezone);

  if (secondOffset !== firstOffset) {
    result = new Date(guess.getTime() - secondOffset);
  }

  return result;
}

export function getZonedDayRange(now, timezone) {
  const current = getZonedDateParts(now, timezone);
  const nextCalendarDay = new Date(
    Date.UTC(current.year, current.month - 1, current.day + 1),
  );

  return {
    start: localMidnightToUtc(
      current.year,
      current.month,
      current.day,
      timezone,
    ),
    end: localMidnightToUtc(
      nextCalendarDay.getUTCFullYear(),
      nextCalendarDay.getUTCMonth() + 1,
      nextCalendarDay.getUTCDate(),
      timezone,
    ),
  };
}
