CREATE TABLE favorites (
  tenant_id integer NOT NULL,
  listing_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_favorites PRIMARY KEY (tenant_id, listing_id),
  CONSTRAINT fk_favorites_tenant FOREIGN KEY (tenant_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT,
  CONSTRAINT fk_favorites_listing FOREIGN KEY (listing_id)
    REFERENCES listings (id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT
);
