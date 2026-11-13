ALTER TABLE "SystemSetting" ADD COLUMN "crossDepartmentView" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProgressUpdate"
  ADD COLUMN "revisionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "revisionRequestedBy" TEXT,
  ADD COLUMN "revisionReason" TEXT,
  ADD COLUMN "revisionResolvedAt" TIMESTAMP(3);
