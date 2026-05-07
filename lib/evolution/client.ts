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
