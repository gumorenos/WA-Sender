-- Persist a conservative, workspace-scoped daily budget for automatic agent work.
-- LLM attempts are reserved before provider generation; provider starts are reserved
-- immediately before the WhatsApp provider call. Both are serialized in application
-- transactions with a PostgreSQL advisory lock.
CREATE TABLE "agent_daily_usage" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "usage_date" VARCHAR(10) NOT NULL,
    "timezone" TEXT NOT NULL,
    "llm_attempts" INTEGER NOT NULL DEFAULT 0,
    "llm_denied" INTEGER NOT NULL DEFAULT 0,
    "provider_starts" INTEGER NOT NULL DEFAULT 0,
    "provider_denied" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_daily_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_daily_usage_workspace_id_usage_date_key"
    ON "agent_daily_usage"("workspace_id", "usage_date");

CREATE INDEX "agent_daily_usage_workspace_id_usage_date_idx"
    ON "agent_daily_usage"("workspace_id", "usage_date");

ALTER TABLE "agent_daily_usage"
    ADD CONSTRAINT "agent_daily_usage_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;