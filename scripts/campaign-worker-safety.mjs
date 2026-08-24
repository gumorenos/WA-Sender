export const CLAIMED_NOT_SENT = "CLAIMED_NOT_SENT";
export const PROVIDER_CALL_STARTED = "PROVIDER_CALL_STARTED";
export const UNKNOWN_PROVIDER_RESULT = "UNKNOWN_PROVIDER_RESULT";

const GLOBAL_SWEEP_CAMPAIGN_STATUSES = ["RUNNING", "PAUSED", "STOPPED", "FAILED"];

export class ProviderSendError extends Error {
  constructor(
    message,
    {
      code,
      outcome = "NOT_SENT",
      retryable = false,
      fatalCampaign = false,
    } = {},
  ) {
    super(message);
    this.name = "ProviderSendError";
    this.code = code ?? "PROVIDER_SEND_ERROR";
    this.outcome = outcome;
    this.retryable = retryable;
    this.fatalCampaign = fatalCampaign;
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

function staleClaimRecoveryData(campaignStatus) {
  const stopped = campaignStatus === "STOPPED";

  return {
    status: stopped ? "CANCELLED" : "PENDING",
    lastErrorCode: stopped ? "CAMPAIGN_STOPPED" : "CLAIM_RECOVERED",
    lastErrorMessage: stopped
      ? "Campana detenida antes de invocar al proveedor; claim stale cancelado de forma segura."
      : "Claim stale recuperado antes de invocar al proveedor; seguro para reprocesar cuando la campana vuelva a estar RUNNING.",
  };
}

function staleUnknownRecoveryData() {
  return {
    status: "FAILED",
    lastErrorCode: UNKNOWN_PROVIDER_RESULT,
    lastErrorMessage:
      "El worker quedo stale despues de iniciar el envio. No reintentar automaticamente: verificar con el proveedor.",
  };
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
        data: staleClaimRecoveryData(campaign.status),
      });

      if (reset.count === 1) {
        recovered.push({
          id: message.id,
          action:
            campaign.status === "STOPPED"
              ? "CANCELLED_STOPPED_CLAIM"
              : "RESET_TO_PENDING",
        });
      }
      continue;
    }

    const quarantined = await prisma.campaignMessage.updateMany({
      where: {
        id: message.id,
        status: "SENDING",
        updatedAt: { lt: cutoff },
      },
      data: staleUnknownRecoveryData(),
    });

    if (quarantined.count === 1) {
      recovered.push({ id: message.id, action: "QUARANTINED_UNKNOWN" });
    }
  }

  return recovered;
}

async function recoverGlobalCandidate(prisma, candidate, cutoff) {
  return prisma.$transaction(async (tx) => {
    if (candidate.lastErrorCode === CLAIMED_NOT_SENT) {
      const transitioned = await tx.campaignMessage.updateMany({
        where: {
          id: candidate.id,
          workspaceId: candidate.workspaceId,
          campaignId: candidate.campaignId,
          status: "SENDING",
          lastErrorCode: CLAIMED_NOT_SENT,
          updatedAt: { lt: cutoff },
          campaign: {
            status: candidate.campaign.status,
          },
        },
        data: staleClaimRecoveryData(candidate.campaign.status),
      });

      if (transitioned.count !== 1) {
        return null;
      }

      const stopped = candidate.campaign.status === "STOPPED";
      const action = stopped ? "CANCELLED_STOPPED_CLAIM" : "RESET_TO_PENDING";

      await tx.campaignEvent.create({
        data: {
          workspaceId: candidate.workspaceId,
          campaignId: candidate.campaignId,
          messageId: candidate.id,
          type: stopped
            ? "MESSAGE_STALE_CLAIM_CANCELLED"
            : "MESSAGE_STALE_CLAIM_RECOVERED",
          payload: {
            reason: stopped ? "CAMPAIGN_STOPPED" : CLAIMED_NOT_SENT,
            source: "GLOBAL_STALE_SWEEP",
            campaignStatus: candidate.campaign.status,
          },
        },
      });

      return {
        id: candidate.id,
        workspaceId: candidate.workspaceId,
        campaignId: candidate.campaignId,
        campaignStatus: candidate.campaign.status,
        action,
        campaignFailed: false,
      };
    }

    const transitioned = await tx.campaignMessage.updateMany({
      where: {
        id: candidate.id,
        workspaceId: candidate.workspaceId,
        campaignId: candidate.campaignId,
        status: "SENDING",
        updatedAt: { lt: cutoff },
        campaign: {
          status: candidate.campaign.status,
        },
      },
      data: staleUnknownRecoveryData(),
    });

    if (transitioned.count !== 1) {
      return null;
    }

    await tx.campaignEvent.create({
      data: {
        workspaceId: candidate.workspaceId,
        campaignId: candidate.campaignId,
        messageId: candidate.id,
        type: "MESSAGE_STALE_PROVIDER_RESULT_UNKNOWN",
        payload: {
          reason: UNKNOWN_PROVIDER_RESULT,
          source: "GLOBAL_STALE_SWEEP",
          campaignStatus: candidate.campaign.status,
        },
      },
    });

    let campaignFailed = false;

    if (candidate.campaign.status === "RUNNING") {
      const failed = await tx.campaign.updateMany({
        where: {
          id: candidate.campaignId,
          workspaceId: candidate.workspaceId,
          status: "RUNNING",
        },
        data: { status: "FAILED" },
      });

      if (failed.count === 1) {
        campaignFailed = true;
        await tx.campaignEvent.create({
          data: {
            workspaceId: candidate.workspaceId,
            campaignId: candidate.campaignId,
            type: "CAMPAIGN_FAILED_UNKNOWN_PROVIDER_RESULT",
            payload: {
              reason: "GLOBAL_STALE_SENDING_AFTER_PROVIDER_CALL",
            },
          },
        });
      }
    }

    return {
      id: candidate.id,
      workspaceId: candidate.workspaceId,
      campaignId: candidate.campaignId,
      campaignStatus: candidate.campaign.status,
      action: "QUARANTINED_UNKNOWN",
      campaignFailed,
    };
  });
}

export async function recoverGlobalStaleSendingMessages(
  prisma,
  {
    now = new Date(),
    staleAfterMs = 10 * 60_000,
    limit = 200,
  } = {},
) {
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const candidates = await prisma.campaignMessage.findMany({
    where: {
      status: "SENDING",
      updatedAt: { lt: cutoff },
      campaign: {
        status: { in: GLOBAL_SWEEP_CAMPAIGN_STATUSES },
      },
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: safeLimit,
    select: {
      id: true,
      workspaceId: true,
      campaignId: true,
      lastErrorCode: true,
      campaign: {
        select: {
          status: true,
        },
      },
    },
  });

  const recovered = [];

  for (const candidate of candidates) {
    const transition = await recoverGlobalCandidate(prisma, candidate, cutoff);
    if (transition) {
      recovered.push(transition);
    }
  }

  return {
    cutoff,
    scannedCount: candidates.length,
    recovered,
  };
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
