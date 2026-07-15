CREATE UNIQUE INDEX "Target_year_departmentId_code_key"
  ON "Target"("year", "departmentId", "code");

DROP INDEX IF EXISTS "Target_code_key";
