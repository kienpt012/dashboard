ALTER TABLE "Feedback"
ADD COLUMN "scopeConfirmedAt" TIMESTAMP(3),
ADD COLUMN "consentPolicyVersion" TEXT;

UPDATE "Feedback"
SET "scopeConfirmedAt" = "consentAcceptedAt",
    "consentPolicyVersion" = 'legacy-v1';

ALTER TABLE "Feedback"
ALTER COLUMN "scopeConfirmedAt" SET NOT NULL,
ALTER COLUMN "consentPolicyVersion" SET NOT NULL;
