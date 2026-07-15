-- Quản trị viên có phạm vi toàn hệ thống và không thuộc một phòng ban vận hành.
-- Thu hồi phiên cũ vì phạm vi tài khoản đã thay đổi.
UPDATE "User"
SET
  "departmentId" = NULL,
  "tokenVersion" = "tokenVersion" + 1,
  "version" = "version" + 1,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'ADMIN' AND "departmentId" IS NOT NULL;
