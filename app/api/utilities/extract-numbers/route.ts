import { ConsentStatus, OptInStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeApiWorkspace } from "@/lib/auth/api";
import { prisma } from "@/lib/db";
import { EvolutionApiError, extractEvolutionNumbers } from "@/lib/evolution/client";
import {
  type ExtractedNumberResult,
  normalizeExtractedNumbers,
} from "@/lib/extract-numbers";
import {
  buildRateLimitKey,
  enforceRateLimit,
  isRateLimitError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import { purgeExpiredExtractedNumbers } from "@/server/privacy/retention";

const extractNumbersSchema = z.object({
  instanceId: z.string().cuid("Selecciona una instancia valida."),
  source: z.enum(["contacts", "chats"]),
  filters: z
    .object({
      omitGroups: z.boolean().default(true),
      omitMissingPhones: z.boolean().default(true),
      dedupe: z.boolean().default(true),
    })
    .default({
      omitGroups: true,
      omitMissingPhones: true,
      dedupe: true,
    }),
  privacyConfirmed: z.literal(true, {
    error: "Debes confirmar la advertencia de privacidad antes de extraer.",
  }),
});

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

function serializeRecord(record: ExtractedNumberResult) {
  return {
    number: record.number,
    displayName: record.displayName,
    source: record.source,
    isSaved: record.isSaved,
    lastSeenOrUpdatedAt: record.lastSeenOrUpdatedAt,
    consentStatus: "unknown",
    optInStatus: "unknown",
  };
}

export async function POST(request: Request) {
  const authorization = await authorizeApiWorkspace(["OWNER", "ADMIN"]);

  if (!authorization.ok) {
    return jsonError(authorization.error, authorization.status);
  }

  const context = authorization.context;

  try {
    await enforceRateLimit({
      key: buildRateLimitKey([
        "extract-numbers",
        context.workspace.id,
        context.user.id,
      ]),
      limit: 6,
      windowMs: 60_000,
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      return rateLimitResponse(error);
    }

    throw error;
  }

  const parsed = extractNumbersSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Datos invalidos.",
      400,
      parsed.error.flatten(),
    );
  }

  const instance = await prisma.whatsAppInstance.findFirst({
    where: {
      id: parsed.data.instanceId,
      workspaceId: context.workspace.id,
    },
    select: {
      id: true,
      name: true,
      providerInstanceId: true,
      status: true,
    },
  });

  if (!instance) {
    return jsonError("Instancia no encontrada.", 404);
  }

  if (!instance.providerInstanceId) {
    return jsonError("La instancia no tiene identificador de proveedor.", 409);
  }

  try {
    const extraction = await extractEvolutionNumbers({
      providerInstanceName: instance.providerInstanceId,
      source: parsed.data.source,
    });
    const normalized = normalizeExtractedNumbers(extraction.records, {
      source: parsed.data.source,
      omitGroups: parsed.data.filters.omitGroups,
      omitMissingPhones: parsed.data.filters.omitMissingPhones,
      dedupe: parsed.data.filters.dedupe,
    });

    const retention = await prisma.$transaction(async (tx) => {
      const retentionResult = await purgeExpiredExtractedNumbers(
        tx,
        context.workspace.id,
      );

      for (const record of normalized) {
        await tx.extractedNumber.upsert({
          where: {
            workspaceId_phone_source: {
              workspaceId: context.workspace.id,
              phone: record.number,
              source: record.source,
            },
          },
          create: {
            workspaceId: context.workspace.id,
            instanceId: instance.id,
            phone: record.number,
            displayName: record.displayName,
            source: record.source,
            isSaved: record.isSaved,
            lastSeenOrUpdatedAt: record.lastSeenOrUpdatedAt
              ? new Date(record.lastSeenOrUpdatedAt)
              : null,
            optInStatus: OptInStatus.UNKNOWN,
            consentStatus: ConsentStatus.UNKNOWN,
          },
          update: {
            instanceId: instance.id,
            displayName: record.displayName,
            isSaved: record.isSaved,
            lastSeenOrUpdatedAt: record.lastSeenOrUpdatedAt
              ? new Date(record.lastSeenOrUpdatedAt)
              : null,
            extractedAt: new Date(),
            optInStatus: OptInStatus.UNKNOWN,
            consentStatus: ConsentStatus.UNKNOWN,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId: context.workspace.id,
          actorUserId: context.user.id,
          action: "EXPORTED",
          resourceType: "extracted_numbers",
          resourceId: instance.id,
          metadata: {
            instanceName: instance.name,
            source: parsed.data.source,
            totalRaw: extraction.records.length,
            totalNormalized: normalized.length,
            mocked: extraction.mocked,
            filters: parsed.data.filters,
            retentionDays: retentionResult.retentionDays,
            purgedExpiredCount: retentionResult.deletedCount,
          } satisfies Prisma.InputJsonValue,
        },
      });

      return retentionResult;
    });

    return NextResponse.json({
      instance: {
        id: instance.id,
        name: instance.name,
      },
      source: parsed.data.source,
      records: normalized.map(serializeRecord),
      summary: {
        raw: extraction.records.length,
        returned: normalized.length,
        mocked: extraction.mocked,
        consentStatus: "unknown",
      },
      privacy: {
        canUseInCampaign: false,
        retentionDays: retention.retentionDays,
        purgedExpiredCount: retention.deletedCount,
        message:
          "Estos numeros no se agregan automaticamente a campanas ni se marcan como opt-in.",
      },
    });
  } catch (error) {
    if (error instanceof EvolutionApiError) {
      return jsonError(error.message, error.status ?? 502);
    }

    return jsonError("No se pudo extraer numeros desde Evolution API.", 502);
  }
}
