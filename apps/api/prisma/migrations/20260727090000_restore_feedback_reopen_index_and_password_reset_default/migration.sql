-- Restore two pre-existing database guarantees that were removed by the
-- document AI foundation migration even though they are unrelated to AI.

CREATE INDEX IF NOT EXISTS "Feedback_reopenRequestedAt_idx"
  ON "Feedback"("reopenRequestedAt");

ALTER TABLE "PasswordResetChallenge"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
