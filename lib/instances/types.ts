export type PublicInstanceStatus = "disconnected" | "connecting" | "open" | "error";

export type PublicWhatsAppInstance = {
  id: string;
  name: string;
  provider: "EVOLUTION" | "WHATSAPP_CLOUD" | "MOCK";
  status: PublicInstanceStatus;
  createdAt: string;
  updatedAt: string;
  lastQrAt: string | null;
  lastStatusAt: string | null;
};

export type InstancesListResponse = {
  instances: PublicWhatsAppInstance[];
  usage: {
    used: number;
    limit: number;
    remaining: number;
  };
  plan: {
    code: string;
    name: string;
  };
};

export type InstanceQrResponse = {
  qrBase64: string | null;
  pairingCode: string | null;
  status: PublicInstanceStatus;
};

export type InstanceStatusResponse = {
  status: PublicInstanceStatus;
  checkedAt: string;
};
