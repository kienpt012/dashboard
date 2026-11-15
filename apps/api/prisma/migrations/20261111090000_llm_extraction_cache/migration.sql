-- Kết quả Qwen của từng đoạn, khoá theo nội dung gửi đi: "Đọc lại" chỉ gọi Qwen cho đoạn đã thay đổi.
CREATE TABLE "LlmExtractionCache" (
    "key" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmExtractionCache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "LlmExtractionCache_createdAt_idx" ON "LlmExtractionCache"("createdAt");
CREATE INDEX "LlmExtractionCache_documentId_idx" ON "LlmExtractionCache"("documentId");

ALTER TABLE "LlmExtractionCache" ADD CONSTRAINT "LlmExtractionCache_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
