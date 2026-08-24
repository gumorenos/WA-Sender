ALTER TABLE "workspaces"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Lima';

ALTER TABLE "campaign_messages"
  ADD COLUMN "daily_quota_date" VARCHAR(10),
  ADD COLUMN "daily_quota_reserved_at" TIMESTAMP(3),
  ADD COLUMN "daily_quota_released_at" TIMESTAMP(3);

CREATE INDEX "campaign_messages_workspace_id_sent_at_idx"
  ON "campaign_messages"("workspace_id", "sent_at");

CREATE INDEX "campaign_messages_workspace_id_daily_quota_date_daily_quota_released_at_idx"
  ON "campaign_messages"("workspace_id", "daily_quota_date", "daily_quota_released_at");
