CREATE TABLE tenant_listing_notes (
  tenant_id integer NOT NULL,
  listing_id integer NOT NULL,
  note varchar(2000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_tenant_listing_notes PRIMARY KEY (tenant_id, listing_id),
  CONSTRAINT ck_tenant_listing_notes_tenant CHECK (tenant_id > 0),
  CONSTRAINT ck_tenant_listing_notes_listing CHECK (listing_id > 0),
  CONSTRAINT ck_tenant_listing_notes_note CHECK (
    note = btrim(note) AND char_length(note) BETWEEN 1 AND 2000
  )
);

CREATE INDEX idx_tenant_listing_notes_tenant_updated
  ON tenant_listing_notes (tenant_id, updated_at DESC, listing_id DESC);
