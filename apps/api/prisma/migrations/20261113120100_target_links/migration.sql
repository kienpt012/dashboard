ALTER TABLE "Target" ADD COLUMN "linkGroupId" TEXT;
CREATE INDEX "Target_linkGroupId_idx" ON "Target"("linkGroupId");

ALTER TABLE "ProgressUpdate" ADD COLUMN "mirroredFromId" TEXT;
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_mirroredFromId_fkey"
  FOREIGN KEY ("mirroredFromId") REFERENCES "ProgressUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ProgressUpdate_targetId_mirroredFromId_key" ON "ProgressUpdate"("targetId", "mirroredFromId");

CREATE TABLE "TargetLinkDismissal" (
  "pairKey" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "otherTargetId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TargetLinkDismissal_pkey" PRIMARY KEY ("pairKey")
);
