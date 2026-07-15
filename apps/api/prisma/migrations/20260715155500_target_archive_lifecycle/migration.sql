ALTER TABLE "Target"
  ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedBy" TEXT,
  ADD COLUMN "archiveReason" TEXT;

CREATE INDEX "Target_isArchived_year_idx"
  ON "Target"("isArchived", "year");
