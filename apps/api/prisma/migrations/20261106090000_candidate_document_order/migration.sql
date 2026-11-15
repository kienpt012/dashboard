-- Thứ tự đọc và đề mục nhóm của chỉ tiêu ứng viên, để màn hình duyệt hiện đúng thứ tự và nhóm như văn bản.
ALTER TABLE "IndicatorCandidate" ADD COLUMN "groupName" TEXT;
ALTER TABLE "IndicatorCandidate" ADD COLUMN "documentOrder" INTEGER;

CREATE INDEX "IndicatorCandidate_documentId_documentOrder_idx" ON "IndicatorCandidate"("documentId", "documentOrder");
