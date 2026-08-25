ALTER TABLE landlord_lead_reminders
  ADD COLUMN due_notification_sent_at timestamptz;

ALTER TABLE notifications
  DROP CONSTRAINT ck_notifications_event_type;

ALTER TABLE notifications
  ADD CONSTRAINT ck_notifications_event_type CHECK (
    event_type IN ('INQUIRY_CREATED', 'MESSAGE_CREATED', 'INQUIRY_STATUS_CHANGED', 'LEAD_REMINDER_DUE')
  );

CREATE INDEX idx_landlord_lead_reminders_due_notification
  ON landlord_lead_reminders (remind_at ASC, inquiry_id ASC)
  WHERE due_notification_sent_at IS NULL;
