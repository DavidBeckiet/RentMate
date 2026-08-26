CREATE TABLE support_requests (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester_id integer NOT NULL,
  requester_role varchar(16) NOT NULL,
  category varchar(24) NOT NULL,
  subject varchar(160) NOT NULL,
  message varchar(4000) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'OPEN',
  resolution_note varchar(2000),
  assigned_admin_id integer,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at timestamptz,
  CONSTRAINT ck_support_requests_requester CHECK (requester_id > 0 AND requester_role IN ('TENANT', 'LANDLORD', 'ADMIN')),
  CONSTRAINT ck_support_requests_category CHECK (category IN ('ACCOUNT', 'LISTING', 'SAFETY', 'TECHNICAL', 'OTHER')),
  CONSTRAINT ck_support_requests_subject CHECK (subject = btrim(subject) AND subject <> ''),
  CONSTRAINT ck_support_requests_message CHECK (message = btrim(message) AND message <> ''),
  CONSTRAINT ck_support_requests_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  CONSTRAINT ck_support_requests_resolution CHECK (
    (status IN ('OPEN', 'IN_PROGRESS') AND resolution_note IS NULL AND assigned_admin_id IS NULL AND resolved_at IS NULL)
    OR (
      status = 'RESOLVED'
      AND resolution_note IS NOT NULL AND resolution_note = btrim(resolution_note) AND resolution_note <> ''
      AND assigned_admin_id IS NOT NULL AND assigned_admin_id > 0
      AND resolved_at IS NOT NULL
    )
  )
);

CREATE INDEX idx_support_requests_status_created
  ON support_requests (status, created_at DESC, id DESC);

CREATE INDEX idx_support_requests_requester_created
  ON support_requests (requester_id, created_at DESC, id DESC);
