-- Mã chỉ tiêu là định danh nghiệp vụ do hệ thống cấp và phải duy nhất toàn cục.
-- Trước khi đổi khóa, xử lý an toàn dữ liệu cũ có thể trùng giữa các phòng ban.
DO $$
DECLARE
  duplicate_target RECORD;
  code_prefix TEXT;
  next_sequence BIGINT;
  candidate_code TEXT;
  fallback_sequence INTEGER;
BEGIN
  FOR duplicate_target IN
    SELECT "id", "code", "publishedCode"
    FROM (
      SELECT
        "id",
        "code",
        "publishedCode",
        ROW_NUMBER() OVER (
          PARTITION BY "code"
          ORDER BY "createdAt", "id"
        ) AS duplicate_rank
      FROM "Target"
    ) ranked_targets
    WHERE duplicate_rank > 1
    ORDER BY "code", "id"
  LOOP
    IF duplicate_target."code" ~ '[0-9]+$' THEN
      code_prefix := REGEXP_REPLACE(duplicate_target."code", '[0-9]+$', '');

      SELECT COALESCE(MAX(
        CASE
          WHEN SUBSTRING("code" FROM CHAR_LENGTH(code_prefix) + 1) ~ '^[0-9]+$'
            THEN SUBSTRING("code" FROM CHAR_LENGTH(code_prefix) + 1)::BIGINT
          ELSE NULL
        END
      ), 0) + 1
      INTO next_sequence
      FROM "Target"
      WHERE LEFT("code", CHAR_LENGTH(code_prefix)) = code_prefix;

      LOOP
        candidate_code := code_prefix
          || LPAD(next_sequence::TEXT, GREATEST(3, CHAR_LENGTH(next_sequence::TEXT)), '0');
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM "Target" WHERE "code" = candidate_code
        );
        next_sequence := next_sequence + 1;
      END LOOP;
    ELSE
      fallback_sequence := 0;
      LOOP
        candidate_code := duplicate_target."code"
          || '-MIG-'
          || duplicate_target."id"
          || CASE WHEN fallback_sequence = 0 THEN '' ELSE '-' || fallback_sequence::TEXT END;
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM "Target" WHERE "code" = candidate_code
        );
        fallback_sequence := fallback_sequence + 1;
      END LOOP;
    END IF;

    UPDATE "Target"
    SET
      "code" = candidate_code,
      "publishedCode" = CASE
        WHEN "publishedCode" = duplicate_target."code" THEN candidate_code
        ELSE "publishedCode"
      END
    WHERE "id" = duplicate_target."id";
  END LOOP;
END $$;

DROP INDEX IF EXISTS "Target_year_departmentId_code_key";

CREATE UNIQUE INDEX "Target_code_key" ON "Target"("code");
