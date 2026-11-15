-- Quy trình xử lý văn bản bản 2 (Docling + VietOCR): cấu trúc tài liệu (B6), chia đoạn theo mục (B7), cờ kiểm tra
-- (B10), so trùng bằng bge-m3 + pgvector (B11–B14), gộp vào chỉ tiêu có sẵn (B15), số liệu chất lượng (B17).

-- Thêm giá trị enum trong transaction được từ PostgreSQL 12, miễn là không dùng nó trong cùng transaction.
ALTER TYPE "ExtractionMethod" ADD VALUE IF NOT EXISTS 'FORM_TEMPLATE';

ALTER TABLE "SourceDocument" ADD COLUMN "parserVersion" TEXT;

ALTER TABLE "DocumentPage" ADD COLUMN "kind" TEXT,
ADD COLUMN "elements" JSONB;

ALTER TABLE "DocumentChunk" ADD COLUMN "headingPath" JSONB,
ADD COLUMN "elementIds" JSONB,
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'section',
ADD COLUMN "leadSentence" TEXT,
ADD COLUMN "hasDigits" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "ocrFlagged" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ExtractionJob" ADD COLUMN "pagesTotal" INTEGER,
ADD COLUMN "pagesDone" INTEGER,
ADD COLUMN "stats" JSONB;

ALTER TABLE "IndicatorCandidate" ADD COLUMN "sourceElementIds" JSONB,
ADD COLUMN "headingPath" JSONB,
ADD COLUMN "validationFlags" JSONB,
ADD COLUMN "ocrFlags" JSONB,
ADD COLUMN "ocrReadings" JSONB,
ADD COLUMN "matchClass" TEXT,
ADD COLUMN "matchScore" DOUBLE PRECISION,
ADD COLUMN "similarTargets" JSONB,
ADD COLUMN "suggestedCode" TEXT,
ADD COLUMN "suggestedCodeScore" DOUBLE PRECISION,
ADD COLUMN "mergedTargetId" TEXT;

ALTER TABLE "IndicatorCandidate" ADD CONSTRAINT "IndicatorCandidate_mergedTargetId_fkey" FOREIGN KEY ("mergedTargetId") REFERENCES "Target"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "IndicatorEmbedding" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dims" INTEGER NOT NULL,
    "vector" DOUBLE PRECISION[],
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicatorEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IndicatorEmbedding_kind_refKey_model_key" ON "IndicatorEmbedding"("kind", "refKey", "model");
CREATE INDEX "IndicatorEmbedding_kind_model_idx" ON "IndicatorEmbedding"("kind", "model");

-- B13: pgvector + chỉ mục HNSW (vector_cosine_ops) cho vector 1.024 chiều của bge-m3. Postgres chưa có gói pgvector
-- (image postgres:17-alpine cũ) thì bỏ qua, không làm hỏng lần deploy: API tự tính cosine trong bộ nhớ.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
    -- Một chỉ mục riêng cho mỗi loại: HNSW lọc sau khi quét, nên trộn chỉ tiêu và danh mục trong một chỉ mục sẽ
    -- bỏ sót kết quả khi lọc theo loại.
    EXECUTE 'CREATE INDEX IF NOT EXISTS "IndicatorEmbedding_target_hnsw_idx" ON "IndicatorEmbedding" '
      || 'USING hnsw ((("vector")::vector(1024)) vector_cosine_ops) WHERE "dims" = 1024 AND "kind" = ''TARGET''';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "IndicatorEmbedding_catalog_hnsw_idx" ON "IndicatorEmbedding" '
      || 'USING hnsw ((("vector")::vector(1024)) vector_cosine_ops) WHERE "dims" = 1024 AND "kind" = ''CATALOG''';
  ELSE
    RAISE NOTICE 'pgvector chưa được cài: bỏ qua chỉ mục HNSW, API so trùng bằng cosine trong bộ nhớ.';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Không đủ quyền tạo extension vector: bỏ qua chỉ mục HNSW.';
END $$;
