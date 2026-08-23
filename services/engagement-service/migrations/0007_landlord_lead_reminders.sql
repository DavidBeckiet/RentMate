CREATE TABLE landlord_lead_reminders (
  inquiry_id integer NOT NULL,
  landlord_id integer NOT NULL,
  remind_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_landlord_lead_reminders PRIMARY KEY (inquiry_id),
  CONSTRAINT fk_landlord_lead_reminders_inquiry FOREIGN KEY (inquiry_id)
    REFERENCES listing_inquiries (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ck_landlord_lead_reminders_landlord CHECK (landlord_id > 0)
);

CREATE INDEX idx_landlord_lead_reminders_landlord_remind_at
  ON landlord_lead_reminders (landlord_id, remind_at ASC, inquiry_id ASC);
