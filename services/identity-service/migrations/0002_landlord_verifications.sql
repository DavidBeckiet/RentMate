CREATE TABLE landlord_verifications (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  landlord_id integer NOT NULL,
  display_name varchar(120) NOT NULL,
  request_note varchar(1000),
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  decision_note varchar(1000),
  reviewed_by_admin_id integer,
  submitted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_landlord_verifications_landlord FOREIGN KEY (landlord_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_landlord_verifications_admin FOREIGN KEY (reviewed_by_admin_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_landlord_verifications_display_name CHECK (
    display_name = btrim(display_name) AND display_name <> ''
  ),
  CONSTRAINT ck_landlord_verifications_request_note CHECK (
    request_note IS NULL OR (request_note = btrim(request_note) AND request_note <> '')
  ),
  CONSTRAINT ck_landlord_verifications_status CHECK (
    status IN ('PENDING', 'APPROVED', 'REJECTED')
  ),
  CONSTRAINT ck_landlord_verifications_decision CHECK (
    (
      status = 'PENDING'
      AND decision_note IS NULL
      AND reviewed_by_admin_id IS NULL
      AND reviewed_at IS NULL
    )
    OR (
      status IN ('APPROVED', 'REJECTED')
      AND decision_note IS NOT NULL
      AND decision_note = btrim(decision_note)
      AND decision_note <> ''
      AND reviewed_by_admin_id IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX uq_landlord_verifications_pending_landlord
  ON landlord_verifications (landlord_id)
  WHERE status = 'PENDING';

CREATE UNIQUE INDEX uq_landlord_verifications_approved_landlord
  ON landlord_verifications (landlord_id)
  WHERE status = 'APPROVED';

CREATE INDEX idx_landlord_verifications_landlord_submitted
  ON landlord_verifications (landlord_id, submitted_at DESC, id DESC);

CREATE INDEX idx_landlord_verifications_status_submitted
  ON landlord_verifications (status, submitted_at ASC, id ASC);
