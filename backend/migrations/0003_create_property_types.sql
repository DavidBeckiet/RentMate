CREATE TABLE property_types (
  id smallint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code varchar(32) NOT NULL,
  label varchar(80) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT pk_property_types PRIMARY KEY (id),
  CONSTRAINT uq_property_types_code UNIQUE (code),
  CONSTRAINT uq_property_types_label UNIQUE (label),
  CONSTRAINT ck_property_types_code CHECK (
    code ~ '^[A-Z][A-Z0-9_]*$'
  ),
  CONSTRAINT ck_property_types_label CHECK (
    btrim(label) <> ''
    AND label = btrim(label)
  )
);
