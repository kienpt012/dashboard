ALTER TYPE "ImportBatchStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "ImportBatchStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REVIEWED';
ALTER TYPE "ImportBatchStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_APPROVED';
ALTER TYPE "ImportBatchStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ImportBatchStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "ImportBatch" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "ProgressUpdate" ADD COLUMN "importBatchId" TEXT;

CREATE INDEX "ProgressUpdate_importBatchId_reviewStatus_idx"
  ON "ProgressUpdate"("importBatchId", "reviewStatus");

ALTER TABLE "ProgressUpdate"
  ADD CONSTRAINT "ProgressUpdate_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
