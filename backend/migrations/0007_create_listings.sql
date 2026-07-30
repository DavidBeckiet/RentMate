CREATE TABLE listings (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  landlord_id integer NOT NULL,
  property_type_id smallint,
  status listing_status NOT NULL DEFAULT 'DRAFT',
  title varchar(160),
  description text,
  monthly_rent numeric(12, 0),
  room_area_sqm numeric(8, 2),
  address_text varchar(500),
  area_name varchar(120),
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_listings PRIMARY KEY (id),
  CONSTRAINT fk_listings_landlord FOREIGN KEY (landlord_id)
    REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT fk_listings_property_type FOREIGN KEY (property_type_id)
    REFERENCES property_types (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT ck_listings_title CHECK (
    title IS NULL
    OR (
      btrim(title) <> ''
      AND title = btrim(title)
    )
  ),
  CONSTRAINT ck_listings_description CHECK (
    description IS NULL
    OR (
      btrim(description) <> ''
      AND char_length(description) <= 5000
    )
  ),
  CONSTRAINT ck_listings_monthly_rent CHECK (
    monthly_rent IS NULL
    OR monthly_rent > 0
  ),
  CONSTRAINT ck_listings_room_area CHECK (
    room_area_sqm IS NULL
    OR room_area_sqm > 0
  ),
  CONSTRAINT ck_listings_address_text CHECK (
    address_text IS NULL
    OR (
      btrim(address_text) <> ''
      AND address_text = btrim(address_text)
    )
  ),
  CONSTRAINT ck_listings_area_name CHECK (
    area_name IS NULL
    OR (
      btrim(area_name) <> ''
      AND area_name = btrim(area_name)
    )
  ),
  CONSTRAINT ck_listings_latitude CHECK (
    latitude IS NULL
    OR latitude BETWEEN -90 AND 90
  ),
  CONSTRAINT ck_listings_longitude CHECK (
    longitude IS NULL
    OR longitude BETWEEN -180 AND 180
  ),
  CONSTRAINT ck_listings_coordinate_pair CHECK (
    (latitude IS NULL) = (longitude IS NULL)
  ),
  CONSTRAINT ck_listings_non_draft_complete CHECK (
    status = 'DRAFT'
    OR (
      property_type_id IS NOT NULL
      AND title IS NOT NULL
      AND description IS NOT NULL
      AND monthly_rent IS NOT NULL
      AND room_area_sqm IS NOT NULL
      AND address_text IS NOT NULL
      AND area_name IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    )
  )
);
