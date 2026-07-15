UPDATE "User"
SET
  "email" = regexp_replace("email", '@tan' || 'hung\.gov\.vn$', '@laithieu.gov.vn', 'i'),
  "updatedAt" = CURRENT_TIMESTAMP,
  "version" = "version" + 1
WHERE "email" ~* ('@tan' || 'hung\.gov\.vn$');
