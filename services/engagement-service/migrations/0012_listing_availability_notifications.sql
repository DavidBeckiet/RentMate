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
      'LISTING_HIDDEN',
      'SAVED_SEARCH_MATCHED',
      'LISTING_AVAILABILITY_REMINDER'
    )
  );
