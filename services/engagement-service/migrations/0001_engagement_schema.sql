CREATE TABLE favorites (
  tenant_id integer NOT NULL,
  listing_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_favorites PRIMARY KEY (tenant_id, listing_id)
);

CREATE INDEX idx_favorites_tenant_created_at
ON favorites (tenant_id, created_at DESC, listing_id DESC);
