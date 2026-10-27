-- CreateTable
CREATE TABLE "DeskProfile" (
    "userId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeskProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DeskSpace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "position" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeskSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeskWidgetState" (
    "userId" TEXT NOT NULL,
    "widgetId" VARCHAR(64) NOT NULL,
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeskWidgetState_pkey" PRIMARY KEY ("userId","widgetId")
);

-- CreateTable
CREATE TABLE "DeskAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "name" VARCHAR(120) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "thumb" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeskAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeskSpace_userId_position_idx" ON "DeskSpace"("userId", "position");

-- CreateIndex
CREATE INDEX "DeskAsset_ownerId_createdAt_idx" ON "DeskAsset"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "DeskAsset_isShared_idx" ON "DeskAsset"("isShared");

-- AddForeignKey
ALTER TABLE "DeskProfile" ADD CONSTRAINT "DeskProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskSpace" ADD CONSTRAINT "DeskSpace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "DeskProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskWidgetState" ADD CONSTRAINT "DeskWidgetState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskAsset" ADD CONSTRAINT "DeskAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
