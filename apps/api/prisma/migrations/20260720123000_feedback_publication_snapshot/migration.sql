ALTER TABLE "Feedback"
  ADD COLUMN "publicSnapshotVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "publicResolutionSummary" TEXT;

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_publicSnapshotVersion_check"
  CHECK ("publicSnapshotVersion" >= 0);
