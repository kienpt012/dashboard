-- Lịch làm việc theo tuần của lãnh đạo UBND (G-40).
CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "title" TEXT,
    "note" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "fileName" TEXT,
    "fileMime" TEXT,
    "fileSize" INTEGER,
    "fileData" BYTEA,
    "createdById" TEXT,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkScheduleEntry" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "session" TEXT NOT NULL,
    "startTime" TEXT,
    "content" TEXT NOT NULL,
    "leader" TEXT NOT NULL,
    "location" TEXT,
    "participants" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkScheduleEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkSchedule_weekStart_key" ON "WorkSchedule"("weekStart");

CREATE INDEX "WorkScheduleEntry_scheduleId_date_sortOrder_idx" ON "WorkScheduleEntry"("scheduleId", "date", "sortOrder");

ALTER TABLE "WorkScheduleEntry" ADD CONSTRAINT "WorkScheduleEntry_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WorkSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
