CREATE TABLE contact_blocks (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  blocker_id integer NOT NULL,
  blocked_id integer NOT NULL,
  inquiry_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_contact_blocks_inquiry FOREIGN KEY (inquiry_id)
    REFERENCES listing_inquiries (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_contact_blocks_users CHECK (blocker_id > 0 AND blocked_id > 0 AND blocker_id <> blocked_id)
);

CREATE UNIQUE INDEX uq_contact_blocks_pair
  ON contact_blocks (blocker_id, blocked_id);

CREATE INDEX idx_contact_blocks_blocked_pair
  ON contact_blocks (blocked_id, blocker_id);

CREATE TABLE contact_reports (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inquiry_id integer NOT NULL,
  reporter_id integer NOT NULL,
  message_id integer,
  category varchar(24) NOT NULL,
  details varchar(2000),
  status varchar(16) NOT NULL DEFAULT 'OPEN',
  resolution_note varchar(2000),
  assigned_admin_id integer,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at timestamptz,
  CONSTRAINT fk_contact_reports_inquiry FOREIGN KEY (inquiry_id)
    REFERENCES listing_inquiries (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_contact_reports_message FOREIGN KEY (message_id)
    REFERENCES inquiry_messages (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_contact_reports_reporter CHECK (reporter_id > 0),
  CONSTRAINT ck_contact_reports_message CHECK (message_id IS NULL OR message_id > 0),
  CONSTRAINT ck_contact_reports_category CHECK (category IN (
    'SPAM', 'FRAUD', 'HARASSMENT', 'INAPPROPRIATE', 'OTHER'
  )),
  CONSTRAINT ck_contact_reports_details CHECK (
    details IS NULL OR (details = btrim(details) AND details <> '')
  ),
  CONSTRAINT ck_contact_reports_status CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
  CONSTRAINT ck_contact_reports_resolution CHECK (
    (status IN ('OPEN', 'INVESTIGATING') AND resolution_note IS NULL AND resolved_at IS NULL)
    OR (
      status IN ('RESOLVED', 'DISMISSED')
      AND resolution_note IS NOT NULL AND resolution_note = btrim(resolution_note) AND resolution_note <> ''
      AND assigned_admin_id IS NOT NULL AND assigned_admin_id > 0
      AND resolved_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX uq_contact_reports_active_reporter_inquiry
  ON contact_reports (reporter_id, inquiry_id)
  WHERE status IN ('OPEN', 'INVESTIGATING');

CREATE INDEX idx_contact_reports_status_created
  ON contact_reports (status, created_at DESC, id DESC);

CREATE INDEX idx_contact_reports_inquiry_created
  ON contact_reports (inquiry_id, created_at DESC, id DESC);

CREATE TABLE contact_report_events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id integer NOT NULL,
  actor_id integer NOT NULL,
  actor_role varchar(16) NOT NULL,
  previous_status varchar(16),
  new_status varchar(16) NOT NULL,
  note varchar(2000),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_contact_report_events_report FOREIGN KEY (report_id)
    REFERENCES contact_reports (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_contact_report_events_actor CHECK (actor_id > 0 AND actor_role IN ('TENANT', 'LANDLORD', 'ADMIN')),
  CONSTRAINT ck_contact_report_events_status CHECK (
    (previous_status IS NULL AND actor_role IN ('TENANT', 'LANDLORD') AND new_status = 'OPEN')
    OR (previous_status = 'OPEN' AND actor_role = 'ADMIN' AND new_status IN ('INVESTIGATING', 'DISMISSED'))
    OR (previous_status = 'INVESTIGATING' AND actor_role = 'ADMIN' AND new_status = 'RESOLVED')
  ),
  CONSTRAINT ck_contact_report_events_note CHECK (note IS NULL OR (note = btrim(note) AND note <> ''))
);

CREATE INDEX idx_contact_report_events_report_created
  ON contact_report_events (report_id, created_at ASC, id ASC);
