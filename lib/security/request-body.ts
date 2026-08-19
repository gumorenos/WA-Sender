export class RequestBodyTooLargeError extends Error {
  constructor(public readonly limitBytes: number) {
    super(`El cuerpo de la solicitud supera el limite de ${limitBytes} bytes.`);
    this.name = "RequestBodyTooLargeError";
  }
}

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("El cuerpo de la solicitud no contiene JSON valido.");
    this.name = "InvalidJsonBodyError";
  }
}

export async function readJsonBodyWithLimit(
  request: Request,
  limitBytes: number,
): Promise<unknown> {
  const contentLengthHeader = request.headers.get("content-length");

  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);

    if (Number.isFinite(contentLength) && contentLength > limitBytes) {
      throw new RequestBodyTooLargeError(limitBytes);
    }
  }

  if (!request.body) {
    throw new InvalidJsonBodyError();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > limitBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError(limitBytes);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InvalidJsonBodyError();
  }
}
