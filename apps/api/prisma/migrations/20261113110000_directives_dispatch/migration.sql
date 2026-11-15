CREATE TYPE "DispatchMode" AS ENUM ('LEADER', 'OFFICE');
ALTER TABLE "SystemSetting" ADD COLUMN "dispatchMode" "DispatchMode" NOT NULL DEFAULT 'LEADER';
ALTER TABLE "Framework"
  ADD COLUMN "directiveKind" "DirectiveKind",
  ADD COLUMN "docNumber" TEXT,
  ADD COLUMN "issuedDate" TIMESTAMP(3),
  ADD COLUMN "issuer" TEXT,
  ADD COLUMN "signer" TEXT;
ALTER TABLE "Target"
  ADD COLUMN "relatedTargetId" TEXT,
  ADD COLUMN "dispatchedById" TEXT,
  ADD COLUMN "dispatchedByName" TEXT,
  ADD COLUMN "dispatchedAt" TIMESTAMP(3);
ALTER TABLE "Target" ADD CONSTRAINT "Target_relatedTargetId_fkey"
  FOREIGN KEY ("relatedTargetId") REFERENCES "Target"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Target_relatedTargetId_idx" ON "Target"("relatedTargetId");
CREATE INDEX "Framework_kind_issuedDate_idx" ON "Framework"("kind", "issuedDate");
