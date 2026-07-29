-- Cho phép người dùng dừng job trích xuất AI đang chờ hoặc đang xử lý.
ALTER TYPE "ExtractionJobStatus" ADD VALUE 'CANCELLED' BEFORE 'FAILED';

ALTER TABLE "ExtractionJob"
ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);
