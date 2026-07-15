BEGIN;

CREATE TYPE "FeedbackCategory" AS ENUM (
  'INFRASTRUCTURE',
  'ENVIRONMENT',
  'ADMINISTRATIVE_PROCEDURE',
  'SECURITY_ORDER',
  'SOCIAL_WELFARE',
  'CULTURE_EDUCATION',
  'OTHER'
);

CREATE TYPE "FeedbackPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TYPE "FeedbackStatus" AS ENUM (
  'RECEIVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_CITIZEN',
  'PENDING_REVIEW',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
  'REOPENED'
);

CREATE TYPE "FeedbackMessageVisibility" AS ENUM ('INTERNAL', 'PUBLIC');

ALTER TABLE "SystemSetting"
  ADD COLUMN "feedbackFirstResponseDays" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "feedbackResolutionDays" INTEGER NOT NULL DEFAULT 10;

-- Freeze every citizen-facing field at publication time. This prevents later
-- internal edits (including department renames) from silently changing the
-- already published result.
ALTER TABLE "Target"
  ADD COLUMN "publishedCode" TEXT,
  ADD COLUMN "publishedTitle" TEXT,
  ADD COLUMN "publishedDescription" TEXT,
  ADD COLUMN "publishedUnit" TEXT,
  ADD COLUMN "publishedWeight" DOUBLE PRECISION,
  ADD COLUMN "publishedYear" INTEGER,
  ADD COLUMN "publishedFrequency" "TargetFrequency",
  ADD COLUMN "publishedDueDate" TIMESTAMP(3),
  ADD COLUMN "publishedDepartmentName" TEXT,
  ADD COLUMN "publishedDepartmentColor" TEXT,
  ADD COLUMN "publishedHighlighted" BOOLEAN,
  ADD COLUMN "publishedOrder" INTEGER;

UPDATE "Target" AS t
SET
  "publishedCode" = t."code",
  "publishedTitle" = t."title",
  "publishedDescription" = t."description",
  "publishedUnit" = t."unit",
  "publishedWeight" = t."weight",
  "publishedYear" = t."year",
  "publishedFrequency" = t."frequency",
  "publishedDueDate" = t."dueDate",
  "publishedDepartmentName" = d."name",
  "publishedDepartmentColor" = d."color",
  "publishedHighlighted" = t."isHighlighted",
  "publishedOrder" = t."publicOrder"
FROM "Department" AS d
WHERE t."departmentId" = d."id" AND t."publishedAt" IS NOT NULL;

CREATE TABLE "Feedback" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "lookupSecretHash" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" "FeedbackCategory" NOT NULL,
  "priority" "FeedbackPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "FeedbackStatus" NOT NULL DEFAULT 'RECEIVED',
  "submitterName" TEXT NOT NULL,
  "submitterPhone" TEXT NOT NULL,
  "submitterEmail" TEXT,
  "address" TEXT,
  "preferredContact" TEXT NOT NULL DEFAULT 'PHONE',
  "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
  "departmentId" TEXT,
  "assignedToId" TEXT,
  "dueAt" TIMESTAMP(3),
  "firstResponseDueAt" TIMESTAMP(3),
  "firstResponseAt" TIMESTAMP(3),
  "submittedForReviewAt" TIMESTAMP(3),
  "submittedForReviewBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "resolutionSummary" TEXT,
  "rejectionReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "reopenCount" INTEGER NOT NULL DEFAULT 0,
  "rating" INTEGER,
  "ratingComment" TEXT,
  "ratedAt" TIMESTAMP(3),
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "publicTitle" TEXT,
  "publicSummary" TEXT,
  "publicCategory" "FeedbackCategory",
  "publicDepartmentName" TEXT,
  "publicResolvedAt" TIMESTAMP(3),
  "publicPublishedAt" TIMESTAMP(3),
  "publicPublishedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedbackMessage" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "visibility" "FeedbackMessageVisibility" NOT NULL DEFAULT 'INTERNAL',
  "authorId" TEXT,
  "authorName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedbackEvent" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" "FeedbackStatus",
  "toStatus" "FeedbackStatus",
  "actorId" TEXT,
  "actorName" TEXT NOT NULL,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Feedback_code_key" ON "Feedback"("code");
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");
CREATE INDEX "Feedback_departmentId_status_idx" ON "Feedback"("departmentId", "status");
CREATE INDEX "Feedback_assignedToId_status_idx" ON "Feedback"("assignedToId", "status");
CREATE INDEX "Feedback_dueAt_idx" ON "Feedback"("dueAt");
CREATE INDEX "FeedbackMessage_feedbackId_createdAt_idx" ON "FeedbackMessage"("feedbackId", "createdAt");
CREATE INDEX "FeedbackEvent_feedbackId_createdAt_idx" ON "FeedbackEvent"("feedbackId", "createdAt");

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FeedbackMessage"
  ADD CONSTRAINT "FeedbackMessage_feedbackId_fkey"
  FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedbackEvent"
  ADD CONSTRAINT "FeedbackEvent_feedbackId_fkey"
  FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
