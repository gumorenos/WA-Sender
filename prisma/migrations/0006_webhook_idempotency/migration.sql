CREATE TABLE "webhook_events" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "action" TEXT,
  "duplicate_count" INTEGER NOT NULL DEFAULT 0,
  "last_duplicate_at" TIMESTAMP(3),
  "processed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_events_provider_instance_id_provider_event_id_key"
  ON "webhook_events"("provider", "instance_id", "provider_event_id");
CREATE INDEX "webhook_events_workspace_id_created_at_idx"
  ON "webhook_events"("workspace_id", "created_at");
CREATE INDEX "webhook_events_instance_id_created_at_idx"
  ON "webhook_events"("instance_id", "created_at");

ALTER TABLE "webhook_events"
  ADD CONSTRAINT "webhook_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_events"
  ADD CONSTRAINT "webhook_events_instance_id_fkey"
  FOREIGN KEY ("instance_id") REFERENCES "whatsapp_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
