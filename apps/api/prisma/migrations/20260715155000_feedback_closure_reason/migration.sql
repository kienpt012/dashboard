CREATE TYPE "FeedbackClosureReason" AS ENUM ('RESOLVED', 'NO_CITIZEN_RESPONSE', 'OUT_OF_SCOPE');

ALTER TABLE "Feedback" ADD COLUMN "closureReason" "FeedbackClosureReason";

UPDATE "Feedback"
SET "closureReason" = CASE
  WHEN "status" = 'REJECTED' THEN 'OUT_OF_SCOPE'::"FeedbackClosureReason"
  WHEN "status" IN ('RESOLVED', 'CLOSED') THEN 'RESOLVED'::"FeedbackClosureReason"
  ELSE NULL
END;
