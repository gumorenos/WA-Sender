CREATE TABLE "agent_instance_assignments" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_instance_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "contact_phone" TEXT NOT NULL,
  "contact_display_name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "last_message_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_messages" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "provider_message_id" TEXT,
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opt_outs" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "instance_id" TEXT,
  "phone" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'webhook',
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "opt_outs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_instance_assignments_workspace_id_instance_id_key"
  ON "agent_instance_assignments"("workspace_id", "instance_id");
CREATE INDEX "agent_instance_assignments_workspace_id_agent_id_idx"
  ON "agent_instance_assignments"("workspace_id", "agent_id");

CREATE UNIQUE INDEX "conversations_workspace_id_instance_id_contact_phone_key"
  ON "conversations"("workspace_id", "instance_id", "contact_phone");
CREATE INDEX "conversations_workspace_id_agent_id_idx"
  ON "conversations"("workspace_id", "agent_id");
CREATE INDEX "conversations_instance_id_idx"
  ON "conversations"("instance_id");

CREATE INDEX "conversation_messages_workspace_id_conversation_id_idx"
  ON "conversation_messages"("workspace_id", "conversation_id");
CREATE INDEX "conversation_messages_conversation_id_created_at_idx"
  ON "conversation_messages"("conversation_id", "created_at");

CREATE UNIQUE INDEX "opt_outs_workspace_id_phone_key"
  ON "opt_outs"("workspace_id", "phone");
CREATE INDEX "opt_outs_workspace_id_instance_id_idx"
  ON "opt_outs"("workspace_id", "instance_id");

ALTER TABLE "agent_instance_assignments"
  ADD CONSTRAINT "agent_instance_assignments_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_instance_assignments"
  ADD CONSTRAINT "agent_instance_assignments_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_instance_assignments"
  ADD CONSTRAINT "agent_instance_assignments_instance_id_fkey"
  FOREIGN KEY ("instance_id") REFERENCES "whatsapp_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_instance_id_fkey"
  FOREIGN KEY ("instance_id") REFERENCES "whatsapp_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversation_messages"
  ADD CONSTRAINT "conversation_messages_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_messages"
  ADD CONSTRAINT "conversation_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "opt_outs"
  ADD CONSTRAINT "opt_outs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opt_outs"
  ADD CONSTRAINT "opt_outs_instance_id_fkey"
  FOREIGN KEY ("instance_id") REFERENCES "whatsapp_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
