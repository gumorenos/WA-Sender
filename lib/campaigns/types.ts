export type CreateCampaignResponse = {
  campaign: {
    id: string;
    name: string;
    totalCount: number;
    pendingCount: number;
    status: "DRAFT";
  };
};

export type CampaignStatusCode =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "STOPPED"
  | "COMPLETED"
  | "FAILED"
  | "DELETING";

export type CampaignMessageStatusCode =
  | "PENDING"
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED";

export type CampaignListItem = {
  id: string;
  name: string;
  status: CampaignStatusCode;
  totalCount: number;
  pendingCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  instanceName: string | null;
};

export type CampaignMessageListItem = {
  id: string;
  recipientPhone: string;
  messageTemplate: string;
  status: CampaignMessageStatusCode;
  sentAt: string | null;
  updatedAt: string;
  lastErrorMessage: string | null;
};

export type CampaignDetail = CampaignListItem & {
  timezone: string;
  delaySeconds: number;
  messages: CampaignMessageListItem[];
};

export type CampaignsListResponse = {
  campaigns: CampaignListItem[];
};

export type CampaignDetailResponse = {
  campaign: CampaignDetail;
};

export type DeleteCampaignResponse = {
  ok: true;
  deletedCampaignId: string;
};
