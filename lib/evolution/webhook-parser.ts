import { normalizeCampaignPhone } from "../campaign-parser";
import { containsOptOutKeyword } from "../campaigns/scheduling";

export type ParsedEvolutionWebhookMessage = {
  providerInstanceId: string;
  remoteJid: string;
  phone: string;
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  pushName: string | null;
  providerMessageId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return false;
}

function readNestedText(value: unknown): string | null {
  const data = asRecord(value);

  if (!data) {
    return null;
  }

  const direct = firstString(
    data.conversation,
    data.text,
    data.body,
    data.caption,
    data.message,
  );

  if (direct) {
    return direct;
  }

  for (const key of [
    "data",
    "message",
    "extendedTextMessage",
    "imageMessage",
    "videoMessage",
  ]) {
    const nested = readNestedText(data[key]);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function readPhoneFromJid(value: string | null) {
  if (!value) {
    return null;
  }

  const candidate = value.split("@")[0] ?? value;
  return normalizeCampaignPhone(candidate);
}

function minimizeWebhookText(text: string) {
  if (containsOptOutKeyword(text)) {
    // The suppression decision matters long-term; the user's surrounding free text does not.
    return "STOP";
  }

  return text.slice(0, 4000);
}

export function parseEvolutionWebhookPayload(
  payload: unknown,
): ParsedEvolutionWebhookMessage | null {
  const root = asRecord(payload);

  if (!root) {
    return null;
  }

  const data = asRecord(root.data);
  const key = asRecord(data?.key) ?? asRecord(root.key);
  const message = asRecord(data?.message) ?? asRecord(root.message);

  const providerInstanceId = firstString(
    root.instance,
    root.instanceName,
    root.instanceId,
    data?.instance,
    data?.instanceName,
    data?.instanceId,
  );
  const remoteJid = firstString(
    key?.remoteJid,
    data?.remoteJid,
    data?.from,
    data?.sender,
    root.remoteJid,
    root.from,
    root.sender,
    root.phone,
  );
  const text = readNestedText(message ?? data ?? root);

  if (!providerInstanceId || !remoteJid || !text) {
    return null;
  }

  const isGroup = remoteJid.includes("@g.us");
  const phone = readPhoneFromJid(remoteJid) ?? (isGroup ? remoteJid.split("@")[0] : null);

  if (!phone) {
    return null;
  }

  return {
    providerInstanceId,
    remoteJid,
    phone,
    text: minimizeWebhookText(text),
    fromMe: firstBoolean(key?.fromMe, data?.fromMe, root.fromMe),
    isGroup,
    pushName: firstString(data?.pushName, root.pushName),
    providerMessageId: firstString(key?.id, data?.messageId, root.messageId),
  };
}
