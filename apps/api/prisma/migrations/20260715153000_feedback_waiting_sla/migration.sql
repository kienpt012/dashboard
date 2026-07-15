ALTER TABLE "SystemSetting"
ADD COLUMN "feedbackCitizenResponseDays" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "Feedback"
ADD COLUMN "waitingCitizenAt" TIMESTAMP(3),
ADD COLUMN "citizenResponseDueAt" TIMESTAMP(3);

CREATE INDEX "Feedback_citizenResponseDueAt_idx" ON "Feedback"("citizenResponseDueAt");

ALTER TABLE "SystemSetting"
ADD CONSTRAINT "SystemSetting_feedbackCitizenResponseDays_check"
CHECK ("feedbackCitizenResponseDays" BETWEEN 1 AND 60);
