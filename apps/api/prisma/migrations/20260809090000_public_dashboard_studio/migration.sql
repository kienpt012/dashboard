-- Public Dashboard Studio: bản nháp, lịch sử công bố bất biến và bản chụp văn bản công khai.
CREATE TABLE "PublicDashboard" (
    "id" TEXT NOT NULL DEFAULT 'public-home',
    "draftName" TEXT NOT NULL DEFAULT 'Trang thông tin công khai',
    "draftTemplateKey" TEXT NOT NULL DEFAULT 'transparency',
    "draftConfig" JSONB NOT NULL DEFAULT '{}',
    "draftVersion" INTEGER NOT NULL DEFAULT 1,
    "publishedRevision" INTEGER,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicDashboard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicDashboardRevision" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "changeNote" TEXT,
    "publishedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicDashboardRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentPublication" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "publishedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DocumentPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicDashboardRevision_dashboardId_revision_key"
    ON "PublicDashboardRevision"("dashboardId", "revision");
CREATE INDEX "PublicDashboardRevision_dashboardId_publishedAt_idx"
    ON "PublicDashboardRevision"("dashboardId", "publishedAt" DESC);

CREATE UNIQUE INDEX "DocumentPublication_publicCode_key"
    ON "DocumentPublication"("publicCode");
CREATE INDEX "DocumentPublication_sourceDocumentId_publishedAt_idx"
    ON "DocumentPublication"("sourceDocumentId", "publishedAt" DESC);
CREATE INDEX "DocumentPublication_revokedAt_publishedAt_idx"
    ON "DocumentPublication"("revokedAt", "publishedAt" DESC);

-- PostgreSQL partial unique index: giữ lịch sử snapshot nhưng chỉ một bản active.
CREATE UNIQUE INDEX "DocumentPublication_one_active_per_source"
    ON "DocumentPublication"("sourceDocumentId")
    WHERE "revokedAt" IS NULL;

ALTER TABLE "PublicDashboardRevision"
    ADD CONSTRAINT "PublicDashboardRevision_dashboardId_fkey"
    FOREIGN KEY ("dashboardId") REFERENCES "PublicDashboard"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentPublication"
    ADD CONSTRAINT "DocumentPublication_sourceDocumentId_fkey"
    FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
