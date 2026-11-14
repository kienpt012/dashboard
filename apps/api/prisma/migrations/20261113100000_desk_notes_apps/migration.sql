CREATE TABLE "DeskNote" (
  "id" TEXT NOT NULL PRIMARY KEY, "authorId" TEXT NOT NULL, "content" VARCHAR(500) NOT NULL,
  "color" TEXT NOT NULL DEFAULT 'yellow', "dueAt" TIMESTAMP(3), "targetId" TEXT, "documentId" TEXT,
  "recalledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeskNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "DeskNote_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE SET NULL,
  CONSTRAINT "DeskNote_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL
);
CREATE TABLE "DeskNoteRecipient" (
  "noteId" TEXT NOT NULL, "userId" TEXT NOT NULL, "seenAt" TIMESTAMP(3), "doneAt" TIMESTAMP(3), "hiddenAt" TIMESTAMP(3),
  "x" DOUBLE PRECISION NOT NULL DEFAULT 0, "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY ("noteId", "userId"),
  CONSTRAINT "DeskNoteRecipient_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "DeskNote"("id") ON DELETE CASCADE,
  CONSTRAINT "DeskNoteRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE TABLE "DeskNoteReply" (
  "id" TEXT NOT NULL PRIMARY KEY, "noteId" TEXT NOT NULL, "authorId" TEXT NOT NULL,
  "content" VARCHAR(300) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeskNoteReply_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "DeskNote"("id") ON DELETE CASCADE,
  CONSTRAINT "DeskNoteReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE TABLE "WorkApp" (
  "id" TEXT NOT NULL PRIMARY KEY, "name" VARCHAR(80) NOT NULL, "url" VARCHAR(2048) NOT NULL,
  "icon" VARCHAR(40) NOT NULL DEFAULT 'AppstoreOutlined', "color" TEXT NOT NULL DEFAULT '#1677ff',
  "group" VARCHAR(80) NOT NULL DEFAULT 'Công vụ', "description" VARCHAR(200) NOT NULL DEFAULT '',
  "roles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[], "departmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "badgeUrl" VARCHAR(2048), "badgePath" VARCHAR(200),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DeskNote_authorId_createdAt_idx" ON "DeskNote"("authorId", "createdAt");
CREATE INDEX "DeskNote_targetId_idx" ON "DeskNote"("targetId");
CREATE INDEX "DeskNoteRecipient_userId_hiddenAt_idx" ON "DeskNoteRecipient"("userId", "hiddenAt");
CREATE INDEX "DeskNoteReply_noteId_createdAt_idx" ON "DeskNoteReply"("noteId", "createdAt");
CREATE INDEX "WorkApp_isActive_sortOrder_idx" ON "WorkApp"("isActive", "sortOrder");
