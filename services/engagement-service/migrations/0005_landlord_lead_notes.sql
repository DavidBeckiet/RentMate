CREATE TABLE landlord_lead_notes (
  inquiry_id integer NOT NULL,
  landlord_id integer NOT NULL,
  note varchar(2000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_landlord_lead_notes PRIMARY KEY (inquiry_id),
  CONSTRAINT fk_landlord_lead_notes_inquiry FOREIGN KEY (inquiry_id)
    REFERENCES listing_inquiries (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ck_landlord_lead_notes_landlord CHECK (landlord_id > 0),
  CONSTRAINT ck_landlord_lead_notes_note CHECK (
    note = btrim(note) AND char_length(note) BETWEEN 1 AND 2000
  )
);

CREATE INDEX idx_landlord_lead_notes_landlord_updated
  ON landlord_lead_notes (landlord_id, updated_at DESC, inquiry_id DESC);
