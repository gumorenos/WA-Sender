CREATE TYPE "AgentSource" AS ENUM ('MANUAL', 'BUILDER');

ALTER TABLE "agents"
ADD COLUMN "source" "AgentSource" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "agent_versions"
ADD COLUMN "source" "AgentSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "generated_prompt" TEXT NOT NULL DEFAULT '';

UPDATE "agent_versions"
SET "generated_prompt" = "system_prompt"
WHERE "generated_prompt" = '';
