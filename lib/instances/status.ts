import type { InstanceStatus } from "@prisma/client";
import type { PublicInstanceStatus } from "./types";

export function toPublicInstanceStatus(status: InstanceStatus): PublicInstanceStatus {
  if (status === "ACTIVE") {
    return "open";
  }

  if (status === "CONNECTING") {
    return "connecting";
  }

  if (status === "ERROR") {
    return "error";
  }

  return "disconnected";
}

export function evolutionStateToDbStatus(state: string | null | undefined): InstanceStatus {
  const normalized = state?.toLowerCase();

  if (normalized === "open") {
    return "ACTIVE";
  }

  if (
    normalized === "connecting" ||
    normalized === "created" ||
    normalized === "qrcode" ||
    normalized === "qr"
  ) {
    return "CONNECTING";
  }

  if (normalized === "error") {
    return "ERROR";
  }

  return "DISCONNECTED";
}
