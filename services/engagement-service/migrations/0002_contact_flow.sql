CREATE TABLE listing_inquiries (
  id integer GENERATED ALWAYS AS IDENTITY,
  tenant_id integer NOT NULL,
  landlord_id integer NOT NULL,
  listing_id integer NOT NULL,
  status text NOT NULL DEFAULT 'NEW',
  contact_phone text,
  preferred_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_listing_inquiries PRIMARY KEY (id),
  CONSTRAINT ck_listing_inquiries_status CHECK (status IN ('NEW', 'CONTACTED', 'CLOSED')),
  CONSTRAINT ck_listing_inquiries_contact_phone CHECK (contact_phone IS NULL OR char_length(contact_phone) BETWEEN 7 AND 32)
);

CREATE UNIQUE INDEX uq_listing_inquiries_open_tenant_listing
ON listing_inquiries (tenant_id, listing_id)
WHERE status <> 'CLOSED';

CREATE INDEX idx_listing_inquiries_tenant_updated_at
ON listing_inquiries (tenant_id, updated_at DESC, id DESC);

CREATE INDEX idx_listing_inquiries_landlord_updated_at
ON listing_inquiries (landlord_id, updated_at DESC, id DESC);

CREATE TABLE inquiry_messages (
  id integer GENERATED ALWAYS AS IDENTITY,
  inquiry_id integer NOT NULL REFERENCES listing_inquiries (id) ON DELETE CASCADE,
  sender_id integer NOT NULL,
  sender_role text NOT NULL,
  body text NOT NULL,
  tenant_read_at timestamptz,
  landlord_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_inquiry_messages PRIMARY KEY (id),
  CONSTRAINT ck_inquiry_messages_sender_role CHECK (sender_role IN ('TENANT', 'LANDLORD')),
  CONSTRAINT ck_inquiry_messages_body CHECK (char_length(body) BETWEEN 1 AND 4000)
);

CREATE INDEX idx_inquiry_messages_inquiry_created_at
ON inquiry_messages (inquiry_id, created_at ASC, id ASC);

CREATE TABLE notifications (
  id integer GENERATED ALWAYS AS IDENTITY,
  recipient_id integer NOT NULL,
  event_type text NOT NULL,
  inquiry_id integer REFERENCES listing_inquiries (id) ON DELETE CASCADE,
  resource_path text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_notifications PRIMARY KEY (id),
  CONSTRAINT ck_notifications_event_type CHECK (event_type IN ('INQUIRY_CREATED', 'MESSAGE_CREATED', 'INQUIRY_STATUS_CHANGED')),
  CONSTRAINT ck_notifications_resource_path CHECK (char_length(resource_path) BETWEEN 1 AND 300)
);

CREATE INDEX idx_notifications_recipient_created_at
ON notifications (recipient_id, created_at DESC, id DESC);

CREATE INDEX idx_notifications_recipient_unread
ON notifications (recipient_id, id DESC)
WHERE is_read = false;
