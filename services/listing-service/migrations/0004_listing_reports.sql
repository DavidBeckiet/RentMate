CREATE TABLE listing_reports (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id integer NOT NULL,
  reporter_id integer NOT NULL,
  category varchar(32) NOT NULL,
  details varchar(2000),
  status varchar(16) NOT NULL DEFAULT 'OPEN',
  resolution_note varchar(2000),
  assigned_admin_id integer,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at timestamptz,
  CONSTRAINT fk_listing_reports_listing FOREIGN KEY (listing_id)
    REFERENCES listings (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_listing_reports_reporter CHECK (reporter_id > 0),
  CONSTRAINT ck_listing_reports_category CHECK (category IN (
    'PRICE_INCORRECT', 'LOCATION_INCORRECT', 'IMAGE_INCORRECT',
    'ALREADY_RENTED', 'FRAUD', 'INAPPROPRIATE'
  )),
  CONSTRAINT ck_listing_reports_details CHECK (
    details IS NULL OR (details = btrim(details) AND details <> '')
  ),
  CONSTRAINT ck_listing_reports_status CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
  CONSTRAINT ck_listing_reports_resolution CHECK (
    (status IN ('OPEN', 'INVESTIGATING') AND resolution_note IS NULL AND resolved_at IS NULL)
    OR (
      status IN ('RESOLVED', 'DISMISSED')
      AND resolution_note IS NOT NULL AND resolution_note = btrim(resolution_note) AND resolution_note <> ''
      AND assigned_admin_id IS NOT NULL AND assigned_admin_id > 0
      AND resolved_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX uq_listing_reports_active_reporter_listing
  ON listing_reports (reporter_id, listing_id)
  WHERE status IN ('OPEN', 'INVESTIGATING');

CREATE INDEX idx_listing_reports_status_created
  ON listing_reports (status, created_at DESC, id DESC);

CREATE INDEX idx_listing_reports_listing_created
  ON listing_reports (listing_id, created_at DESC, id DESC);

CREATE TABLE listing_report_events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id integer NOT NULL,
  actor_id integer NOT NULL,
  actor_role varchar(16) NOT NULL,
  previous_status varchar(16),
  new_status varchar(16) NOT NULL,
  note varchar(2000),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_listing_report_events_report FOREIGN KEY (report_id)
    REFERENCES listing_reports (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_listing_report_events_actor CHECK (actor_id > 0 AND actor_role IN ('TENANT', 'ADMIN')),
  CONSTRAINT ck_listing_report_events_status CHECK (
    (previous_status IS NULL AND actor_role = 'TENANT' AND new_status = 'OPEN')
    OR (previous_status = 'OPEN' AND actor_role = 'ADMIN' AND new_status IN ('INVESTIGATING', 'DISMISSED'))
    OR (previous_status = 'INVESTIGATING' AND actor_role = 'ADMIN' AND new_status = 'RESOLVED')
  ),
  CONSTRAINT ck_listing_report_events_note CHECK (note IS NULL OR (note = btrim(note) AND note <> ''))
);

CREATE INDEX idx_listing_report_events_report_created
  ON listing_report_events (report_id, created_at ASC, id ASC);
