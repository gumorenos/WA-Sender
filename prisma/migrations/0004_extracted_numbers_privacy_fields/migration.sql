ALTER TABLE "extracted_numbers"
ADD COLUMN "is_saved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "last_seen_or_updated_at" TIMESTAMP(3),
ADD COLUMN "consent_status" "ConsentStatus" NOT NULL DEFAULT 'UNKNOWN';
