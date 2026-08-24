const DEFAULT_EVOLUTION_EXTRACT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_EVOLUTION_EXTRACT_MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

type EvolutionResponseLimitEnv = {
  EVOLUTION_EXTRACT_MAX_RESPONSE_BYTES?: string;
};

export class EvolutionResponseTooLargeError extends Error {
  constructor(
    public readonly maxBytes: number,
    public readonly receivedBytes?: number,
  ) {
    super(
      receivedBytes === undefined
        ? `Evolution response exceeds the configured ${maxBytes} byte limit.`
        : `Evolution response exceeded the configured ${maxBytes} byte limit after ${receivedBytes} bytes.`,
    );
    this.name = "EvolutionResponseTooLargeError";
  }
}

export function getEvolutionExtractMaxResponseBytes(
  env: EvolutionResponseLimitEnv = process.env,
) {
  const raw = env.EVOLUTION_EXTRACT_MAX_RESPONSE_BYTES;
  const parsed = raw ? Number(raw) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_EVOLUTION_EXTRACT_MAX_RESPONSE_BYTES;
  }

  return Math.min(
    Math.max(1, Math.floor(parsed)),
    MAX_EVOLUTION_EXTRACT_MAX_RESPONSE_BYTES,
  );
}

function parseContentLength(response: Response) {
  const header = response.headers.get("content-length");

  if (!header) {
    return null;
  }

  const parsed = Number(header);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function cancelResponseBody(response: Response) {
  if (!response.body) {
    return;
  }

  try {
    await response.body.cancel();
  } catch {
    // Cancellation is best-effort. The size gate must still fail closed.
  }
}

export async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number,
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes must be a positive safe integer.");
  }

  const announcedBytes = parseContentLength(response);
  if (announcedBytes !== null && announcedBytes > maxBytes) {
    await cancelResponseBody(response);
    throw new EvolutionResponseTooLargeError(maxBytes, announcedBytes);
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new EvolutionResponseTooLargeError(maxBytes, totalBytes);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}
