ALTER TABLE "Target" ADD COLUMN "publishedDocRef" TEXT,
  ADD COLUMN "publishedOrdinal" TEXT,
  ADD COLUMN "publishedIssuingLevel" "IssuingLevel";

-- Bản đã công bố trước migration để trống tham chiếu; lần công bố tiếp theo
-- chụp văn bản cùng số liệu, không lấy thông tin nội bộ chưa được duyệt.
