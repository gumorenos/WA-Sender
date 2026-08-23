export class RequestBodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`El cuerpo de la solicitud supera el limite de ${maxBytes} bytes.`);
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<unknown | null> {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  if (!request.body) {
    return null;
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

      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError(maxBytes);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(combined);

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
