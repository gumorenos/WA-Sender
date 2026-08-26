import { NextResponse } from "next/server";

import { getEvolutionWebhookMaxBodyBytes } from "@/lib/evolution/webhook-limits";
import {
  buildRateLimitKey,
  enforceRateLimit,
  getClientIp,
  isRateLimitError,
  rateLimitResponse,
} from "@/lib/security/rate-limit";
import {
  readJsonBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/security/request-body";
import { handleEvolutionWebhook } from "@/server/agents/whatsapp-webhook-service";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function isAuthorized(request: Request) {
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  const received =
    request.headers.get("x-wa-sender-webhook-secret") ??
    request.headers.get("x-evolution-webhook-secret");

  return Boolean(expected && received && expected === received);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return jsonResponse({ error: "Webhook no autorizado." }, 401);
  }

  try {
    await enforceRateLimit({
      key: buildRateLimitKey(["webhook:evolution", getClientIp(request)]),
      limit: 300,
      windowMs: 60_000,
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      return rateLimitResponse(error);
    }

    throw error;
  }

  const maxBodyBytes = getEvolutionWebhookMaxBodyBytes();
  let payload: unknown | null;

  try {
    payload = await readJsonBodyWithLimit(request, maxBodyBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonResponse(
        {
          error: "Payload de webhook demasiado grande.",
          code: "EVOLUTION_WEBHOOK_BODY_TOO_LARGE",
          maxBytes: error.maxBytes,
        },
        413,
      );
    }

    throw error;
  }

  if (!payload) {
    return jsonResponse({ error: "Payload invalido." }, 400);
  }

  const result = await handleEvolutionWebhook(payload);

  return jsonResponse(result);
}
