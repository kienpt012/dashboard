-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('KE_HOACH', 'QUYET_DINH', 'CONG_VAN', 'BAO_CAO', 'NGHI_QUYET', 'PHU_LUC', 'KHAC');

-- CreateEnum
CREATE TYPE "ExtractionJobKind" AS ENUM ('DOCUMENT_PARSE', 'INDICATOR_EXTRACT');

-- CreateEnum
CREATE TYPE "ExtractionJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('RULE_BASED', 'LLM');

-- CreateEnum
CREATE TYPE "CandidateKind" AS ENUM ('NEW_INDICATOR', 'PROGRESS_UPDATE');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');

-- DropIndex
DROP INDEX "Feedback_reopenRequestedAt_idx";

-- AlterTable
ALTER TABLE "PasswordResetChallenge" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Target" ADD COLUMN     "legalBasis" TEXT,
ADD COLUMN     "sourceDocumentId" TEXT;

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "docType" "DocumentType" NOT NULL DEFAULT 'KHAC',
    "docNumber" TEXT,
    "issuedBy" TEXT,
    "issuedDate" TIMESTAMP(3),
    "description" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "processingError" TEXT,
    "pageCount" INTEGER,
    "hasTextLayer" BOOLEAN,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "year" INTEGER,
    "departmentId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "ocrConfidence" DOUBLE PRECISION,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "pageFrom" INTEGER NOT NULL,
    "pageTo" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "ExtractionJobKind" NOT NULL,
    "status" "ExtractionJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" VARCHAR(300),
    "model" TEXT,
    "promptVersion" TEXT,
    "chunksTotal" INTEGER,
    "chunksDone" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndicatorCandidate" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkId" TEXT,
    "pageNumber" INTEGER,
    "kind" "CandidateKind" NOT NULL DEFAULT 'NEW_INDICATOR',
    "status" "CandidateStatus" NOT NULL DEFAULT 'PROPOSED',
    "extractionMethod" "ExtractionMethod" NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "unit" TEXT,
    "targetValue" DOUBLE PRECISION,
    "actualValue" DOUBLE PRECISION,
    "targetYear" INTEGER,
    "direction" "TargetDirection",
    "frequency" "TargetFrequency",
    "deadline" TIMESTAMP(3),
    "responsibleDepartmentName" TEXT,
    "responsibleDepartmentId" TEXT,
    "coordinatingDepartments" TEXT,
    "legalBasis" TEXT,
    "formula" TEXT,
    "sourceQuote" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "fieldConfidence" JSONB,
    "warnings" JSONB,
    "isDuplicateSuspect" BOOLEAN NOT NULL DEFAULT false,
    "matchedTargetId" TEXT,
    "humanEdited" BOOLEAN NOT NULL DEFAULT false,
    "editedFields" JSONB,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdTargetId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicatorCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_code_key" ON "SourceDocument"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_sha256_key" ON "SourceDocument"("sha256");

-- CreateIndex
CREATE INDEX "SourceDocument_status_createdAt_idx" ON "SourceDocument"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SourceDocument_departmentId_createdAt_idx" ON "SourceDocument"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "SourceDocument_createdAt_id_idx" ON "SourceDocument"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_key" ON "DocumentChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "ExtractionJob_status_availableAt_idx" ON "ExtractionJob"("status", "availableAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_documentId_kind_createdAt_idx" ON "ExtractionJob"("documentId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorCandidate_createdTargetId_key" ON "IndicatorCandidate"("createdTargetId");

-- CreateIndex
CREATE INDEX "IndicatorCandidate_status_createdAt_idx" ON "IndicatorCandidate"("status", "createdAt");

-- CreateIndex
CREATE INDEX "IndicatorCandidate_documentId_status_idx" ON "IndicatorCandidate"("documentId", "status");

-- AddForeignKey
ALTER TABLE "Target" ADD CONSTRAINT "Target_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionJob" ADD CONSTRAINT "ExtractionJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorCandidate" ADD CONSTRAINT "IndicatorCandidate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorCandidate" ADD CONSTRAINT "IndicatorCandidate_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorCandidate" ADD CONSTRAINT "IndicatorCandidate_responsibleDepartmentId_fkey" FOREIGN KEY ("responsibleDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorCandidate" ADD CONSTRAINT "IndicatorCandidate_matchedTargetId_fkey" FOREIGN KEY ("matchedTargetId") REFERENCES "Target"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorCandidate" ADD CONSTRAINT "IndicatorCandidate_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorCandidate" ADD CONSTRAINT "IndicatorCandidate_createdTargetId_fkey" FOREIGN KEY ("createdTargetId") REFERENCES "Target"("id") ON DELETE SET NULL ON UPDATE CASCADE;
