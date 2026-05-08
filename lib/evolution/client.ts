import QRCode from "qrcode";

type EvolutionCreateInstanceResponse = {
  instance?: {
    instanceName?: string;
    instanceId?: string;
    status?: string;
    state?: string;
  };
};

type EvolutionConnectResponse = {
  pairingCode?: string | null;
  code?: string | null;
  base64?: string | null;
  qrCode?: string | null;
  qrOrCode?: string | null;
  count?: number;
};

type EvolutionConnectionStateResponse = {
  instance?: {
    instanceName?: string;
    state?: string;
    status?: string;
  };
  state?: string;
  status?: string;
};

type EvolutionSendTextResponse = {
  key?: {
    id?: string;
  };
  messageId?: string;
  id?: string;
  status?: string;
};

type EvolutionExtractResponse =
  | unknown[]
  | {
      contacts?: unknown[];
      chats?: unknown[];
      data?: unknown[];
      response?: unknown[];
      result?: unknown[];
    };

export type EvolutionCreateInstanceResult = {
  providerInstanceName: string;
  providerInstanceId: string | null;
  state: string;
};

export type EvolutionQrResult = {
  qrBase64: string | null;
  pairingCode: string | null;
  state: string | null;
};

export type EvolutionStatusResult = {
  state: string;
};

export type EvolutionSendTextResult = {
  providerMessageId: string | null;
  status: string;
  mocked: boolean;
};

export type EvolutionExtractSource = "contacts" | "chats";

export type EvolutionExtractResult = {
  source: EvolutionExtractSource;
  records: unknown[];
  mocked: boolean;
};

export class EvolutionApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "EvolutionApiError";
  }
}

const DEFAULT_TIMEOUT_MS = 8_000;

function isMockEnabled() {
  return (
    process.env.EVOLUTION_MOCK === "true" ||
    process.env.MOCK_WHATSAPP_ENABLED === "true"
  );
}

function getConfig() {
  return {
    baseUrl: (process.env.EVOLUTION_API_BASE_URL ?? "").replace(/\/+$/, ""),
    apiKey: process.env.EVOLUTION_API_KEY ?? "",
    timeoutMs: Number(process.env.EVOLUTION_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    mock: isMockEnabled(),
  };
}

function assertSafeHttpBaseUrl(baseUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new EvolutionApiError("Evolution API base URL is invalid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new EvolutionApiError("Evolution API base URL must use HTTP or HTTPS.");
  }
}

async function buildQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
}

async function requestEvolution<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = getConfig();

  if (!config.baseUrl || !config.apiKey) {
    throw new EvolutionApiError("Evolution API is not configured.");
  }

  assertSafeHttpBaseUrl(config.baseUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey: config.apiKey,
        ...init.headers,
      },
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as T) : ({} as T);

    if (!response.ok) {
      throw new EvolutionApiError(
        `Evolution API request failed with ${response.status}.`,
        response.status,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof EvolutionApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new EvolutionApiError("Evolution API request timed out.");
    }

    throw new EvolutionApiError("Evolution API request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function requestEvolutionFirst<T>(
  candidates: Array<{ path: string; init?: RequestInit }>,
): Promise<T> {
  let lastError: EvolutionApiError | null = null;

  for (const candidate of candidates) {
    try {
      return await requestEvolution<T>(candidate.path, candidate.init);
    } catch (error) {
      if (!(error instanceof EvolutionApiError)) {
        throw error;
      }

      lastError = error;

      if (error.status && error.status !== 404 && error.status !== 405) {
        throw error;
      }
    }
  }

  throw lastError ?? new EvolutionApiError("Evolution API extraction failed.");
}

function unwrapExtractRecords(
  data: EvolutionExtractResponse,
  source: EvolutionExtractSource,
) {
  if (Array.isArray(data)) {
    return data;
  }

  const records =
    (source === "contacts" ? data.contacts : data.chats) ??
    data.data ??
    data.response ??
    data.result ??
    [];

  return Array.isArray(records) ? records : [];
}

export function getEvolutionRuntimeMode() {
  return getConfig().mock ? "mock" : "real";
}

export function buildProviderInstanceName(workspaceId: string, name: string) {
  return `ws_${workspaceId.slice(0, 8)}_${name}`.toLowerCase();
}

export async function createEvolutionInstance(
  providerInstanceName: string,
): Promise<EvolutionCreateInstanceResult> {
  if (getConfig().mock) {
    return {
      providerInstanceName,
      providerInstanceId: `mock_${providerInstanceName}`,
      state: "connecting",
    };
  }

  const data = await requestEvolution<EvolutionCreateInstanceResponse>(
    "/instance/create",
    {
      method: "POST",
      body: JSON.stringify({
        instanceName: providerInstanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        rejectCall: true,
        groupsIgnore: true,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
      }),
    },
  );

  return {
    providerInstanceName: data.instance?.instanceName ?? providerInstanceName,
    providerInstanceId: data.instance?.instanceId ?? null,
    state: data.instance?.state ?? data.instance?.status ?? "connecting",
  };
}

export async function getEvolutionQr(
  providerInstanceName: string,
): Promise<EvolutionQrResult> {
  if (getConfig().mock) {
    return {
      qrBase64: await buildQrDataUrl(`mock-wa-sender:${providerInstanceName}`),
      pairingCode: "MOCK-QR",
      state: "connecting",
    };
  }

  const data = await requestEvolution<EvolutionConnectResponse>(
    `/instance/connect/${encodeURIComponent(providerInstanceName)}`,
  );

  const qrSource =
    data.base64 ??
    data.qrCode ??
    (data.qrOrCode?.startsWith("data:image/") ? data.qrOrCode : null);
  const qrBase64 =
    qrSource ??
    (data.code ? await buildQrDataUrl(data.code) : null);

  return {
    qrBase64,
    pairingCode: data.pairingCode ?? null,
    state: qrBase64 ? "connecting" : null,
  };
}

export async function getEvolutionStatus(
  providerInstanceName: string,
): Promise<EvolutionStatusResult> {
  if (getConfig().mock) {
    return {
      state: "connecting",
    };
  }

  const data = await requestEvolution<EvolutionConnectionStateResponse>(
    `/instance/connectionState/${encodeURIComponent(providerInstanceName)}`,
  );

  return {
    state: data.instance?.state ?? data.instance?.status ?? data.state ?? data.status ?? "close",
  };
}

export async function deleteEvolutionInstance(providerInstanceName: string) {
  if (getConfig().mock) {
    return;
  }

  await requestEvolution(`/instance/delete/${encodeURIComponent(providerInstanceName)}`, {
    method: "DELETE",
  });
}

export async function sendEvolutionTextMessage({
  message,
  phone,
  providerInstanceName,
}: {
  providerInstanceName: string;
  phone: string;
  message: string;
}): Promise<EvolutionSendTextResult> {
  const normalizedPhone = phone.replace(/[^\d]/g, "");

  if (getConfig().mock || process.env.REAL_SENDING_ENABLED !== "true") {
    return {
      providerMessageId: `mock_msg_${providerInstanceName}_${Date.now()}`,
      status: "mocked",
      mocked: true,
    };
  }

  const data = await requestEvolution<EvolutionSendTextResponse>(
    `/message/sendText/${encodeURIComponent(providerInstanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: normalizedPhone,
        text: message,
        options: {
          delay: 0,
          linkPreview: false,
        },
      }),
    },
  );

  return {
    providerMessageId: data.key?.id ?? data.messageId ?? data.id ?? null,
    status: data.status ?? "sent",
    mocked: false,
  };
}

export async function extractEvolutionNumbers({
  providerInstanceName,
  source,
}: {
  providerInstanceName: string;
  source: EvolutionExtractSource;
}): Promise<EvolutionExtractResult> {
  if (getConfig().mock) {
    const records =
      source === "contacts"
        ? [
            {
              id: "51999888777@s.whatsapp.net",
              pushName: "Cliente Peru",
              isMyContact: true,
              updatedAt: new Date().toISOString(),
            },
            {
              id: "5215512345678@s.whatsapp.net",
              pushName: "Cliente Mexico",
              isMyContact: true,
              updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
            },
          ]
        : [
            {
              remoteJid: "5491123456789@s.whatsapp.net",
              pushName: "Lead Argentina",
              isMyContact: false,
              lastMessageTimestamp: Math.floor(Date.now() / 1000),
            },
            {
              remoteJid: "120363000000000000@g.us",
              subject: "Grupo de ventas",
              isMyContact: false,
            },
          ];

    return {
      source,
      records,
      mocked: true,
    };
  }

  const encodedInstance = encodeURIComponent(providerInstanceName);
  const endpointName = source === "contacts" ? "findContacts" : "findChats";
  const data = await requestEvolutionFirst<EvolutionExtractResponse>([
    {
      path: `/chat/${endpointName}/${encodedInstance}`,
      init: { method: "POST", body: JSON.stringify({}) },
    },
    {
      path: `/chat/${endpointName}/${encodedInstance}`,
    },
  ]);

  return {
    source,
    records: unwrapExtractRecords(data, source),
    mocked: false,
  };
}
