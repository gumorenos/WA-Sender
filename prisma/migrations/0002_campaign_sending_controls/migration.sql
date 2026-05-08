CREATE TYPE "ConsentStatus" AS ENUM ('UNKNOWN', 'EXPLICITLY_GRANTED', 'EXPLICITLY_DENIED', 'NOT_REQUIRED_FOR_MOCK');

ALTER TABLE "campaign_messages"
ADD COLUMN "consent_status" "ConsentStatus" NOT NULL DEFAULT 'UNKNOWN';

UPDATE "campaign_messages"
SET "consent_status" = CASE
  WHEN "opt_in_status" = 'CONFIRMED' THEN 'EXPLICITLY_GRANTED'::"ConsentStatus"
  WHEN "opt_in_status" = 'DENIED' THEN 'EXPLICITLY_DENIED'::"ConsentStatus"
  WHEN "opt_in_status" = 'NOT_REQUIRED_FOR_MOCK' THEN 'NOT_REQUIRED_FOR_MOCK'::"ConsentStatus"
  ELSE 'UNKNOWN'::"ConsentStatus"
END;

CREATE INDEX "campaign_messages_campaign_id_consent_status_idx" ON "campaign_messages"("campaign_id", "consent_status");
