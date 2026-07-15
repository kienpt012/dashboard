-- Existing date-only deadlines were stored at UTC midnight, which made them
-- overdue at the beginning of the Vietnam calendar day. Preserve the same
-- calendar date and move the instant to 23:59:59.999 Asia/Ho_Chi_Minh.
UPDATE "Target"
SET "dueDate" = date_trunc('day', "dueDate") + interval '16 hours 59 minutes 59.999 seconds';
