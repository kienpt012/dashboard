-- Định vị nguồn: bố cục chữ từng trang, vị trí chỉ tiêu trong văn bản nguồn, tải văn bản không chạy AI.
ALTER TABLE "SourceDocument" ADD COLUMN "autoExtract" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DocumentPage" ADD COLUMN "layout" JSONB;

CREATE TABLE "SourceAnchor" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "box" JSONB,
    "matchBox" JSONB,
    "quote" TEXT,
    "score" DOUBLE PRECISION,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "queryKey" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceAnchor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceAnchor_targetId_key" ON "SourceAnchor"("targetId");
CREATE INDEX "SourceAnchor_documentId_idx" ON "SourceAnchor"("documentId");

ALTER TABLE "SourceAnchor" ADD CONSTRAINT "SourceAnchor_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceAnchor" ADD CONSTRAINT "SourceAnchor_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
