-- CreateEnum
CREATE TYPE "CandidateOrigin" AS ENUM ('AI', 'HUMAN');

-- CreateEnum
CREATE TYPE "LocalityKind" AS ENUM ('XA', 'PHUONG', 'DAC_KHU', 'TRUONG_HOC', 'CO_QUAN_KHAC');

-- CreateEnum
CREATE TYPE "DepartmentKind" AS ENUM ('LEADERSHIP', 'OFFICE', 'SPECIALIZED', 'CENTER', 'OTHER');

-- CreateEnum
CREATE TYPE "FrameworkKind" AS ENUM ('PLAN', 'SCORE', 'TASK', 'STAT');

-- CreateEnum
CREATE TYPE "IssuingLevel" AS ENUM ('CENTRAL', 'PROVINCE', 'LOCAL');

-- CreateEnum
CREATE TYPE "ValueSource" AS ENUM ('MANUAL', 'COMPUTED', 'CHILDREN');

-- CreateEnum
CREATE TYPE "DirectiveKind" AS ENUM ('KE_HOACH', 'CHUONG_TRINH', 'THONG_BAO_KET_LUAN', 'CONG_VAN', 'QUYET_DINH', 'NGHI_QUYET', 'CHI_THI', 'BAO_CAO', 'KHAC');

-- CreateEnum
CREATE TYPE "EvaluationResult" AS ENUM ('EXCEEDED', 'ACHIEVED', 'PARTIAL', 'NOT_ACHIEVED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('FILE', 'LINK', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "ExplanationStatus" AS ENUM ('OPEN', 'ANSWERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BugReportStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX');

-- AlterEnum
ALTER TYPE "CandidateStatus" ADD VALUE 'SUBMITTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'LEADER';
ALTER TYPE "Role" ADD VALUE 'CLERK';

-- AlterEnum
ALTER TYPE "TargetFrequency" ADD VALUE 'SEMIANNUAL';

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "kind" "DepartmentKind" NOT NULL DEFAULT 'SPECIALIZED',
ADD COLUMN     "responsibilities" TEXT,
ADD COLUMN     "shortName" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "IndicatorCandidate" ADD COLUMN     "autoApproveAt" TIMESTAMP(3),
ADD COLUMN     "autoApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "frameworkId" TEXT,
ADD COLUMN     "issuingLevel" "IssuingLevel",
ADD COLUMN     "origin" "CandidateOrigin" NOT NULL DEFAULT 'AI',
ADD COLUMN     "proposedById" TEXT,
ADD COLUMN     "standardCode" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT,
ADD COLUMN     "targetKind" "FrameworkKind" NOT NULL DEFAULT 'PLAN',
ADD COLUMN     "targetText" TEXT,
ALTER COLUMN "documentId" DROP NOT NULL,
ALTER COLUMN "sourceQuote" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ProgressUpdate" ADD COLUMN     "autoApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dataSource" TEXT,
ADD COLUMN     "explanation" TEXT,
ADD COLUMN     "periodKey" TEXT,
ADD COLUMN     "valueText" TEXT;

-- AlterTable
ALTER TABLE "SystemSetting" ADD COLUMN     "assignmentStallDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "explanationDueDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "maxTransfers" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "proposalAutoApproveDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "reportAutoApproveDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "wallboardRotateSeconds" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "Target" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "bounceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "collectionGuide" TEXT,
ADD COLUMN     "computedAt" TIMESTAMP(3),
ADD COLUMN     "dataSourceAgency" TEXT,
ADD COLUMN     "dataSourceSystem" TEXT,
ADD COLUMN     "dataSourceUrl" TEXT,
ADD COLUMN     "evidenceRequirement" TEXT,
ADD COLUMN     "formula" JSONB,
ADD COLUMN     "frameworkId" TEXT,
ADD COLUMN     "issuingLevel" "IssuingLevel" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "kind" "FrameworkKind" NOT NULL DEFAULT 'PLAN',
ADD COLUMN     "maxScore" DOUBLE PRECISION,
ADD COLUMN     "ordinal" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "reportDueDay" INTEGER,
ADD COLUMN     "scoringRule" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "standardCode" TEXT,
ADD COLUMN     "targetText" TEXT,
ADD COLUMN     "transferCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "valueSource" "ValueSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "position" TEXT;

-- CreateTable
CREATE TABLE "LocalityProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "kind" "LocalityKind" NOT NULL DEFAULT 'PHUONG',
    "name" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "provinceName" TEXT,
    "adminUnitCode" TEXT,
    "agencyCode" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "emailDomain" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1d4ed8',
    "setupCompletedAt" TIMESTAMP(3),
    "appliedTemplates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Framework" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FrameworkKind" NOT NULL DEFAULT 'PLAN',
    "issuingLevel" "IssuingLevel" NOT NULL DEFAULT 'LOCAL',
    "year" INTEGER,
    "legalBasis" TEXT,
    "description" TEXT,
    "maxScore" DOUBLE PRECISION,
    "templateKey" TEXT,
    "sourceDocumentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "showOnWallboard" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Framework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetCoordinator" (
    "targetId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetCoordinator_pkey" PRIMARY KEY ("targetId","departmentId")
);

-- CreateTable
CREATE TABLE "TargetDirective" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" "DirectiveKind" NOT NULL DEFAULT 'KHAC',
    "docNumber" TEXT,
    "title" TEXT NOT NULL,
    "issuedDate" TIMESTAMP(3),
    "issuer" TEXT,
    "note" TEXT,
    "sourceDocumentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetDirective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetEvaluation" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "result" "EvaluationResult" NOT NULL,
    "score" DOUBLE PRECISION,
    "note" TEXT,
    "correctiveAction" TEXT,
    "evaluatedById" TEXT NOT NULL,
    "evaluatedByName" TEXT NOT NULL,
    "evaluatedByRole" "Role" NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TargetEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "progressUpdateId" TEXT,
    "directiveId" TEXT,
    "evaluationId" TEXT,
    "kind" "EvidenceKind" NOT NULL DEFAULT 'FILE',
    "title" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "sha256" TEXT,
    "data" BYTEA,
    "url" TEXT,
    "sourceDocumentId" TEXT,
    "note" TEXT,
    "capturedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkEvent" (
    "id" TEXT NOT NULL,
    "targetId" TEXT,
    "candidateId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "responsibleUserId" TEXT,
    "departmentId" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplanationRequest" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ExplanationStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "responderId" TEXT,
    "responderName" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ExplanationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "columns" JSONB NOT NULL,
    "ownerDepartmentId" TEXT,
    "updateCycle" TEXT,
    "sourceSystem" TEXT,
    "collectionGuide" TEXT,
    "templateKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastDataAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRow" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatasetRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "reporterName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pageTitle" TEXT,
    "screenCode" TEXT,
    "viewport" TEXT,
    "userAgent" TEXT,
    "description" TEXT NOT NULL,
    "screenshot" BYTEA,
    "screenshotMime" TEXT,
    "status" "BugReportStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Framework_code_key" ON "Framework"("code");

-- CreateIndex
CREATE INDEX "Framework_isActive_sortOrder_idx" ON "Framework"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "TargetCoordinator_departmentId_idx" ON "TargetCoordinator"("departmentId");

-- CreateIndex
CREATE INDEX "TargetDirective_targetId_issuedDate_idx" ON "TargetDirective"("targetId", "issuedDate");

-- CreateIndex
CREATE UNIQUE INDEX "TargetEvaluation_targetId_periodKey_key" ON "TargetEvaluation"("targetId", "periodKey");

-- CreateIndex
CREATE INDEX "Evidence_targetId_createdAt_idx" ON "Evidence"("targetId", "createdAt");

-- CreateIndex
CREATE INDEX "Evidence_progressUpdateId_idx" ON "Evidence"("progressUpdateId");

-- CreateIndex
CREATE INDEX "WorkEvent_targetId_createdAt_idx" ON "WorkEvent"("targetId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkEvent_candidateId_createdAt_idx" ON "WorkEvent"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkEvent_responsibleUserId_action_createdAt_idx" ON "WorkEvent"("responsibleUserId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "WorkEvent_departmentId_createdAt_idx" ON "WorkEvent"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkEvent_createdAt_idx" ON "WorkEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ExplanationRequest_targetId_status_idx" ON "ExplanationRequest"("targetId", "status");

-- CreateIndex
CREATE INDEX "ExplanationRequest_status_dueAt_idx" ON "ExplanationRequest"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_code_key" ON "Dataset"("code");

-- CreateIndex
CREATE INDEX "DatasetRow_datasetId_createdAt_idx" ON "DatasetRow"("datasetId", "createdAt");

-- CreateIndex
CREATE INDEX "BugReport_status_createdAt_idx" ON "BugReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IndicatorCandidate_status_autoApproveAt_idx" ON "IndicatorCandidate"("status", "autoApproveAt");

-- CreateIndex
CREATE INDEX "ProgressUpdate_targetId_periodKey_idx" ON "ProgressUpdate"("targetId", "periodKey");

-- CreateIndex
CREATE INDEX "Target_frameworkId_sortOrder_idx" ON "Target"("frameworkId", "sortOrder");

-- CreateIndex
CREATE INDEX "Target_parentId_idx" ON "Target"("parentId");

-- CreateIndex
CREATE INDEX "Target_assigneeId_idx" ON "Target"("assigneeId");

-- AddForeignKey
ALTER TABLE "Target" ADD CONSTRAINT "Target_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Target" ADD CONSTRAINT "Target_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Target"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Target" ADD CONSTRAINT "Target_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorCandidate" ADD CONSTRAINT "IndicatorCandidate_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Framework" ADD CONSTRAINT "Framework_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetCoordinator" ADD CONSTRAINT "TargetCoordinator_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetCoordinator" ADD CONSTRAINT "TargetCoordinator_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetDirective" ADD CONSTRAINT "TargetDirective_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetDirective" ADD CONSTRAINT "TargetDirective_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetEvaluation" ADD CONSTRAINT "TargetEvaluation_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_progressUpdateId_fkey" FOREIGN KEY ("progressUpdateId") REFERENCES "ProgressUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_directiveId_fkey" FOREIGN KEY ("directiveId") REFERENCES "TargetDirective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "TargetEvaluation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEvent" ADD CONSTRAINT "WorkEvent_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEvent" ADD CONSTRAINT "WorkEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "IndicatorCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplanationRequest" ADD CONSTRAINT "ExplanationRequest_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplanationRequest" ADD CONSTRAINT "ExplanationRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_ownerDepartmentId_fkey" FOREIGN KEY ("ownerDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRow" ADD CONSTRAINT "DatasetRow_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── Chuyển dữ liệu bản 1 sang mô hình bộ chỉ tiêu ─────────────
-- Mỗi năm kế hoạch đang có chỉ tiêu được gom vào một bộ "Chỉ tiêu kinh tế – xã hội năm …"
-- (loại kế hoạch – thực hiện, địa phương tự đặt). Mã, phiên bản và lịch sử báo cáo của chỉ tiêu giữ nguyên.
INSERT INTO "Framework" ("id", "code", "name", "kind", "issuingLevel", "year", "description", "sortOrder", "showOnWallboard", "isActive", "version", "createdAt", "updatedAt")
SELECT
  'fw' || substr(md5('ktxh-' || t."year"::text), 1, 23),
  'KTXH-' || t."year"::text,
  'Chỉ tiêu kinh tế – xã hội năm ' || t."year"::text,
  'PLAN',
  'LOCAL',
  t."year",
  'Tạo tự động khi nâng cấp lên IOC bản 2 từ các chỉ tiêu đã có. Có thể đổi tên, cấp giao và căn cứ.',
  100,
  true,
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "year" FROM "Target") AS t
ON CONFLICT ("code") DO NOTHING;

UPDATE "Target" AS target
SET "frameworkId" = framework."id"
FROM "Framework" AS framework
WHERE target."frameworkId" IS NULL
  AND framework."code" = 'KTXH-' || target."year"::text;

-- Thứ tự hiển thị trong bộ theo mã chỉ tiêu như danh mục bản 1.
UPDATE "Target" AS target
SET "sortOrder" = ordered.position
FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "frameworkId" ORDER BY "code")) * 10 AS position
  FROM "Target"
) AS ordered
WHERE target."id" = ordered."id";

-- Chỉ tiêu bản 1 không có người phụ trách; người tạo chỉ tiêu cũ không lưu nên để trống assignedById.
