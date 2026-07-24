CREATE TABLE "PasswordResetChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "otpHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "verifiedAt" TIMESTAMP(3),
  "resetTokenHash" TEXT,
  "resetTokenExpiresAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordResetChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordResetChallenge_attempts_check"
    CHECK ("attempts" >= 0 AND "attempts" <= "maxAttempts"),
  CONSTRAINT "PasswordResetChallenge_maxAttempts_check"
    CHECK ("maxAttempts" BETWEEN 1 AND 10)
);

CREATE UNIQUE INDEX "PasswordResetChallenge_resetTokenHash_key"
  ON "PasswordResetChallenge"("resetTokenHash");

CREATE INDEX "PasswordResetChallenge_userId_createdAt_idx"
  ON "PasswordResetChallenge"("userId", "createdAt");

CREATE INDEX "PasswordResetChallenge_expiresAt_idx"
  ON "PasswordResetChallenge"("expiresAt");

ALTER TABLE "PasswordResetChallenge"
  ADD CONSTRAINT "PasswordResetChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
