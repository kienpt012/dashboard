-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('PROPOSED', 'EXECUTED', 'CANCELLED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "ExtractionJob" ADD COLUMN     "note" TEXT;

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "status" "AgentActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "resultSummary" TEXT,
    "result" JSONB,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentAction_userId_status_createdAt_idx" ON "AgentAction"("userId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
