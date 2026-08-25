ALTER TABLE listings
  ADD COLUMN availability_confirmed_at timestamptz,
  ADD COLUMN availability_reminder_sent_at timestamptz,
  ADD COLUMN availability_reminder_notified_at timestamptz,
  ADD COLUMN availability_auto_paused_at timestamptz;

UPDATE listings
SET availability_confirmed_at = updated_at
WHERE status = 'APPROVED'
  AND business_status IN ('AVAILABLE', 'UNKNOWN')
  AND availability_confirmed_at IS NULL;

ALTER TABLE listings
  ADD CONSTRAINT ck_listings_availability_notification_state
  CHECK (
    availability_reminder_notified_at IS NULL
    OR availability_reminder_sent_at IS NOT NULL
  );

CREATE INDEX idx_listings_availability_reminder_due
  ON listings (availability_confirmed_at ASC, id ASC)
  WHERE status = 'APPROVED'
    AND business_status IN ('AVAILABLE', 'UNKNOWN')
    AND availability_reminder_sent_at IS NULL;

CREATE INDEX idx_listings_availability_auto_pause_due
  ON listings (availability_reminder_sent_at ASC, id ASC)
  WHERE status = 'APPROVED'
    AND business_status IN ('AVAILABLE', 'UNKNOWN')
    AND availability_reminder_sent_at IS NOT NULL
    AND availability_auto_paused_at IS NULL;
