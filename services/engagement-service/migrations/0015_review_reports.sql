CREATE TABLE review_reports (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  review_id integer NOT NULL,
  reporter_id integer NOT NULL,
  category varchar(24) NOT NULL,
  details varchar(2000),
  status varchar(16) NOT NULL DEFAULT 'OPEN',
  resolution_note varchar(2000),
  assigned_admin_id integer,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at timestamptz,
  CONSTRAINT fk_review_reports_review FOREIGN KEY (review_id)
    REFERENCES listing_reviews (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_review_reports_reporter CHECK (reporter_id > 0),
  CONSTRAINT ck_review_reports_category CHECK (category IN (
    'INACCURATE', 'OFFENSIVE', 'HARASSMENT', 'SPAM', 'OTHER'
  )),
  CONSTRAINT ck_review_reports_details CHECK (
    details IS NULL OR (details = btrim(details) AND details <> '')
  ),
  CONSTRAINT ck_review_reports_status CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
  CONSTRAINT ck_review_reports_resolution CHECK (
    (status IN ('OPEN', 'INVESTIGATING') AND resolution_note IS NULL AND resolved_at IS NULL)
    OR (
      status IN ('RESOLVED', 'DISMISSED')
      AND resolution_note IS NOT NULL AND resolution_note = btrim(resolution_note) AND resolution_note <> ''
      AND assigned_admin_id IS NOT NULL AND assigned_admin_id > 0
      AND resolved_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX uq_review_reports_active_reporter_review
  ON review_reports (reporter_id, review_id)
  WHERE status IN ('OPEN', 'INVESTIGATING');

CREATE INDEX idx_review_reports_status_created
  ON review_reports (status, created_at DESC, id DESC);

CREATE INDEX idx_review_reports_review_created
  ON review_reports (review_id, created_at DESC, id DESC);

CREATE TABLE review_report_events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id integer NOT NULL,
  actor_id integer NOT NULL,
  actor_role varchar(16) NOT NULL,
  previous_status varchar(16),
  new_status varchar(16) NOT NULL,
  note varchar(2000),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_review_report_events_report FOREIGN KEY (report_id)
    REFERENCES review_reports (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_review_report_events_actor CHECK (actor_id > 0 AND actor_role IN ('TENANT', 'LANDLORD', 'ADMIN')),
  CONSTRAINT ck_review_report_events_status CHECK (
    (previous_status IS NULL AND actor_role IN ('TENANT', 'LANDLORD') AND new_status = 'OPEN')
    OR (previous_status = 'OPEN' AND actor_role = 'ADMIN' AND new_status IN ('INVESTIGATING', 'DISMISSED'))
    OR (previous_status = 'INVESTIGATING' AND actor_role = 'ADMIN' AND new_status = 'RESOLVED')
  ),
  CONSTRAINT ck_review_report_events_note CHECK (note IS NULL OR (note = btrim(note) AND note <> ''))
);

CREATE INDEX idx_review_report_events_report_created
  ON review_report_events (report_id, created_at ASC, id ASC);
