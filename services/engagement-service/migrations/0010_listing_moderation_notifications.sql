ALTER TABLE notifications
  ADD COLUMN listing_id integer;

ALTER TABLE notifications
  ADD COLUMN dedupe_key text;

ALTER TABLE notifications
  DROP CONSTRAINT ck_notifications_event_type;

ALTER TABLE notifications
  ADD CONSTRAINT ck_notifications_event_type CHECK (
    event_type IN (
      'INQUIRY_CREATED',
      'MESSAGE_CREATED',
      'INQUIRY_STATUS_CHANGED',
      'LEAD_REMINDER_DUE',
      'LISTING_APPROVED',
      'LISTING_REJECTED',
      'LISTING_HIDDEN'
    )
  );

ALTER TABLE notifications
  ADD CONSTRAINT ck_notifications_resource_reference CHECK (
    (inquiry_id IS NOT NULL AND listing_id IS NULL)
    OR (inquiry_id IS NULL AND listing_id IS NOT NULL)
  );

ALTER TABLE notifications
  ADD CONSTRAINT ck_notifications_listing_id CHECK (listing_id IS NULL OR listing_id > 0);

ALTER TABLE notifications
  ADD CONSTRAINT ck_notifications_dedupe_key CHECK (
    dedupe_key IS NULL OR char_length(dedupe_key) BETWEEN 1 AND 200
  );

CREATE UNIQUE INDEX uq_notifications_dedupe_key
  ON notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
