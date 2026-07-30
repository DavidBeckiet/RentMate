CREATE TABLE moderation_history (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  listing_id integer NOT NULL,
  admin_id integer NOT NULL,
  previous_status listing_status NOT NULL,
  new_status listing_status NOT NULL,
  reason varchar(1000),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_moderation_history PRIMARY KEY (id),
  CONSTRAINT fk_moderation_history_listing FOREIGN KEY (listing_id)
    REFERENCES listings (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT fk_moderation_history_admin FOREIGN KEY (admin_id)
    REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT ck_moderation_history_status_changed CHECK (
    previous_status <> new_status
  ),
  CONSTRAINT ck_moderation_history_transition CHECK (
    (
      previous_status = 'PENDING'
      AND new_status IN ('APPROVED', 'REJECTED')
    )
    OR (
      previous_status = 'APPROVED'
      AND new_status = 'HIDDEN'
    )
    OR (
      previous_status = 'HIDDEN'
      AND new_status = 'APPROVED'
    )
  ),
  CONSTRAINT ck_moderation_history_reason_nonblank CHECK (
    reason IS NULL
    OR btrim(reason) <> ''
  ),
  CONSTRAINT ck_moderation_history_reason_required CHECK (
    new_status NOT IN ('REJECTED', 'HIDDEN')
    OR (
      reason IS NOT NULL
      AND btrim(reason) <> ''
    )
  )
);
