ALTER TABLE "Feedback"
  ADD COLUMN "reopenRequestedAt" TIMESTAMP(3),
  ADD COLUMN "reopenRequestReason" TEXT,
  ADD COLUMN "reopenRequestCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reopenRequestDecision" TEXT,
  ADD COLUMN "reopenRequestDecisionNote" TEXT,
  ADD COLUMN "reopenRequestReviewedAt" TIMESTAMP(3),
  ADD COLUMN "reopenRequestReviewedBy" TEXT;

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_reopenRequestCount_check" CHECK ("reopenRequestCount" >= 0),
  ADD CONSTRAINT "Feedback_reopenRequestDecision_check"
    CHECK ("reopenRequestDecision" IS NULL OR "reopenRequestDecision" IN ('APPROVED', 'REJECTED'));

CREATE INDEX "Feedback_reopenRequestedAt_idx" ON "Feedback"("reopenRequestedAt");
