CREATE TABLE listing_reviews (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inquiry_id integer NOT NULL,
  listing_id integer NOT NULL,
  tenant_id integer NOT NULL,
  overall_rating smallint NOT NULL,
  accuracy_rating smallint NOT NULL,
  responsiveness_rating smallint NOT NULL,
  comment varchar(2000) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  moderation_note varchar(1000),
  reviewed_by_admin_id integer,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at timestamptz,
  CONSTRAINT fk_listing_reviews_inquiry FOREIGN KEY (inquiry_id)
    REFERENCES listing_inquiries (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_listing_reviews_inquiry UNIQUE (inquiry_id),
  CONSTRAINT ck_listing_reviews_ids CHECK (listing_id > 0 AND tenant_id > 0),
  CONSTRAINT ck_listing_reviews_ratings CHECK (
    overall_rating BETWEEN 1 AND 5
    AND accuracy_rating BETWEEN 1 AND 5
    AND responsiveness_rating BETWEEN 1 AND 5
  ),
  CONSTRAINT ck_listing_reviews_comment CHECK (
    comment = btrim(comment) AND char_length(comment) BETWEEN 20 AND 2000
  ),
  CONSTRAINT ck_listing_reviews_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT ck_listing_reviews_moderation CHECK (
    (
      status = 'PENDING'
      AND moderation_note IS NULL
      AND reviewed_by_admin_id IS NULL
      AND reviewed_at IS NULL
    )
    OR (
      status IN ('APPROVED', 'REJECTED')
      AND moderation_note IS NOT NULL
      AND moderation_note = btrim(moderation_note)
      AND moderation_note <> ''
      AND reviewed_by_admin_id IS NOT NULL
      AND reviewed_by_admin_id > 0
      AND reviewed_at IS NOT NULL
    )
  )
);

CREATE INDEX idx_listing_reviews_public_listing
  ON listing_reviews (listing_id, created_at DESC, id DESC)
  WHERE status = 'APPROVED';

CREATE INDEX idx_listing_reviews_tenant_created
  ON listing_reviews (tenant_id, created_at DESC, id DESC);

CREATE INDEX idx_listing_reviews_status_created
  ON listing_reviews (status, created_at ASC, id ASC);
