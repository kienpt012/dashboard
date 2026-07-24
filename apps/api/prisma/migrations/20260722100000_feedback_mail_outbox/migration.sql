CREATE TYPE "MailOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DEAD_LETTER');

CREATE TABLE "MailOutbox" (
  "feedbackEventId" TEXT NOT NULL,
  "status" "MailOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "sentAt" TIMESTAMP(3),
  "lastError" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MailOutbox_pkey" PRIMARY KEY ("feedbackEventId")
);

CREATE INDEX "MailOutbox_status_availableAt_idx"
  ON "MailOutbox"("status", "availableAt");

CREATE INDEX "MailOutbox_status_lockedAt_idx"
  ON "MailOutbox"("status", "lockedAt");

ALTER TABLE "MailOutbox"
  ADD CONSTRAINT "MailOutbox_feedbackEventId_fkey"
  FOREIGN KEY ("feedbackEventId") REFERENCES "FeedbackEvent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Only future events are enqueued. Historical events are intentionally not
-- backfilled so deploying this migration cannot send stale citizen emails.
CREATE FUNCTION enqueue_feedback_progress_mail()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "MailOutbox" (
    "feedbackEventId",
    "status",
    "payload",
    "attempts",
    "availableAt",
    "createdAt",
    "updatedAt"
  )
  SELECT
    NEW."id",
    'PENDING'::"MailOutboxStatus",
    jsonb_strip_nulls(jsonb_build_object(
      'to', lower(btrim(feedback."submitterEmail")),
      'code', feedback."code",
      'status', COALESCE(NEW."toStatus"::text, NEW."fromStatus"::text, feedback."status"::text),
      'action', NEW."action",
      'departmentName', department."name",
      -- The API places only its already-redacted public excerpt here. Never
      -- copy the raw event note or the full feedback body into the outbox.
      'publicNote', NEW."metadata" ->> 'emailPublicNote'
    )),
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "Feedback" AS feedback
  LEFT JOIN "Department" AS department ON department."id" = feedback."departmentId"
  WHERE feedback."id" = NEW."feedbackId"
    AND feedback."preferredContact" = 'EMAIL'
    AND NULLIF(btrim(feedback."submitterEmail"), '') IS NOT NULL
    AND NEW."action" IN (
      'CREATED',
      'FEEDBACK_ASSIGNED',
      'FEEDBACK_STARTED',
      'INFORMATION_REQUESTED',
      'PUBLIC_MESSAGE_ADDED',
      'FEEDBACK_SUBMITTED_FOR_REVIEW',
      'RESOLUTION_APPROVED',
      'RESOLUTION_RETURNED',
      'FEEDBACK_CLOSED',
      'FEEDBACK_CLOSED_NO_RESPONSE',
      'FEEDBACK_REJECTED',
      'FEEDBACK_REOPENED',
      'CITIZEN_REOPEN_REQUEST_APPROVED',
      'CITIZEN_REOPEN_REQUEST_REJECTED'
    )
  ON CONFLICT ("feedbackEventId") DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "FeedbackEvent_enqueue_progress_mail"
AFTER INSERT ON "FeedbackEvent"
FOR EACH ROW
EXECUTE FUNCTION enqueue_feedback_progress_mail();
