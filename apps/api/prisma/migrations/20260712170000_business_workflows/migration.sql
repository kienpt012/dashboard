BEGIN;

CREATE TYPE "TargetDirection" AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER');
CREATE TYPE "ProgressReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ImportBatchStatus" AS ENUM ('PREVIEWED', 'APPLIED', 'FAILED');

ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

ALTER TABLE "Target"
  ADD COLUMN "direction" "TargetDirection" NOT NULL DEFAULT 'HIGHER_IS_BETTER',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicOrder" INTEGER,
  ADD COLUMN "lastReportedAt" TIMESTAMP(3),
  ADD COLUMN "publishedValue" DOUBLE PRECISION,
  ADD COLUMN "publishedTargetValue" DOUBLE PRECISION,
  ADD COLUMN "publishedDirection" "TargetDirection",
  ADD COLUMN "publishedStatus" "TargetStatus",
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "publishedBy" TEXT;

ALTER TABLE "ProgressUpdate"
  ADD COLUMN "reviewStatus" "ProgressReviewStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "baseVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNote" TEXT;

ALTER TABLE "ImportBatch"
  ADD COLUMN "changes" JSONB,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "status" "ImportBatchStatus" NOT NULL DEFAULT 'PREVIEWED',
  ADD COLUMN "appliedAt" TIMESTAMP(3);

CREATE TABLE "SystemSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "defaultYear" INTEGER NOT NULL DEFAULT 2026,
  "warningDays" INTEGER NOT NULL DEFAULT 14,
  "riskThreshold" DOUBLE PRECISION NOT NULL DEFAULT 70,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorUsername" TEXT NOT NULL,
  "actorRole" "Role" NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "departmentId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportBatch_departmentId_createdAt_idx" ON "ImportBatch"("departmentId", "createdAt");
CREATE INDEX "AuditLog_departmentId_createdAt_idx" ON "AuditLog"("departmentId", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "ProgressUpdate_reviewStatus_targetId_idx" ON "ProgressUpdate"("reviewStatus", "targetId");
CREATE UNIQUE INDEX "ProgressUpdate_one_pending_per_user_target"
  ON "ProgressUpdate"("targetId", "userId")
  WHERE "reviewStatus" = 'PENDING';

ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SystemSetting" ("id", "defaultYear", "warningDays", "riskThreshold", "updatedAt")
VALUES ('default', 2026, 14, 70, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "ImportBatch"
SET "status" = 'APPLIED', "appliedAt" = "createdAt";

UPDATE "ProgressUpdate"
SET "reviewedAt" = "createdAt", "reviewedBy" = "userId"
WHERE "reviewStatus" = 'APPROVED' AND "reviewedAt" IS NULL;

UPDATE "Target" t
SET "lastReportedAt" = COALESCE(
  (SELECT MAX(p."createdAt") FROM "ProgressUpdate" p WHERE p."targetId" = t."id"),
  CASE WHEN t."currentValue" <> 0 THEN t."updatedAt" END
);

UPDATE "Target" SET
  "isPublic" = true,
  "isHighlighted" = true,
  "publishedValue" = "currentValue",
  "publishedTargetValue" = "targetValue",
  "publishedDirection" = "direction",
  "publishedStatus" = "status",
  "publishedAt" = COALESCE("lastReportedAt", "updatedAt"),
  "publishedBy" = 'migration',
  "publicOrder" = CASE "code"
  WHEN 'CT-2026-001' THEN 1
  WHEN 'CT-2026-002' THEN 2
  WHEN 'CT-2026-003' THEN 3
  WHEN 'CT-2026-004' THEN 4
  WHEN 'CT-2026-006' THEN 5
  WHEN 'CT-2026-009' THEN 6
  ELSE NULL END
WHERE "code" IN ('CT-2026-001','CT-2026-002','CT-2026-003','CT-2026-004','CT-2026-006','CT-2026-009');

UPDATE "Target" SET "direction" = 'LOWER_IS_BETTER' WHERE "code" = 'CT-2026-007';

COMMIT;
