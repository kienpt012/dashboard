CREATE TABLE "FeedbackAttachment" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeedbackAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeedbackAttachment_size_check" CHECK ("size" > 0 AND "size" <= 10485760),
  CONSTRAINT "FeedbackAttachment_mimeType_check"
    CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  CONSTRAINT "FeedbackAttachment_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "FeedbackAttachment_feedbackId_sha256_key"
  ON "FeedbackAttachment"("feedbackId", "sha256");

CREATE INDEX "FeedbackAttachment_feedbackId_createdAt_idx"
  ON "FeedbackAttachment"("feedbackId", "createdAt");

ALTER TABLE "FeedbackAttachment"
  ADD CONSTRAINT "FeedbackAttachment_feedbackId_fkey"
  FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
