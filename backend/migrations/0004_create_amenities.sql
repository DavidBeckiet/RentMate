CREATE TABLE amenities (
  id smallint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code varchar(40) NOT NULL,
  label varchar(80) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT pk_amenities PRIMARY KEY (id),
  CONSTRAINT uq_amenities_code UNIQUE (code),
  CONSTRAINT uq_amenities_label UNIQUE (label),
  CONSTRAINT ck_amenities_code CHECK (
    code ~ '^[A-Z][A-Z0-9_]*$'
  ),
  CONSTRAINT ck_amenities_label CHECK (
    btrim(label) <> ''
    AND label = btrim(label)
  )
);
