ALTER TABLE "Feedback" ADD COLUMN "clientSubmissionId" TEXT;
CREATE UNIQUE INDEX "Feedback_clientSubmissionId_key" ON "Feedback"("clientSubmissionId");
