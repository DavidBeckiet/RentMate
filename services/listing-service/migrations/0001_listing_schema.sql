CREATE TYPE listing_status AS ENUM (
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'HIDDEN',
  'INACTIVE'
);

CREATE TABLE property_types (
  id smallint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code varchar(32) NOT NULL,
  label varchar(80) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT pk_property_types PRIMARY KEY (id),
  CONSTRAINT uq_property_types_code UNIQUE (code),
  CONSTRAINT uq_property_types_label UNIQUE (label),
  CONSTRAINT ck_property_types_code CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT ck_property_types_label CHECK (btrim(label) <> '' AND label = btrim(label))
);

CREATE TABLE amenities (
  id smallint GENERATED ALWAYS AS IDENTITY NOT NULL,
  code varchar(40) NOT NULL,
  label varchar(80) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT pk_amenities PRIMARY KEY (id),
  CONSTRAINT uq_amenities_code UNIQUE (code),
  CONSTRAINT uq_amenities_label UNIQUE (label),
  CONSTRAINT ck_amenities_code CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT ck_amenities_label CHECK (btrim(label) <> '' AND label = btrim(label))
);

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
  CONSTRAINT fk_listings_property_type FOREIGN KEY (property_type_id)
    REFERENCES property_types (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT ck_listings_title CHECK (title IS NULL OR (btrim(title) <> '' AND title = btrim(title))),
  CONSTRAINT ck_listings_description CHECK (description IS NULL OR (btrim(description) <> '' AND char_length(description) <= 5000)),
  CONSTRAINT ck_listings_monthly_rent CHECK (monthly_rent IS NULL OR monthly_rent > 0),
  CONSTRAINT ck_listings_room_area CHECK (room_area_sqm IS NULL OR room_area_sqm > 0),
  CONSTRAINT ck_listings_address_text CHECK (address_text IS NULL OR (btrim(address_text) <> '' AND address_text = btrim(address_text))),
  CONSTRAINT ck_listings_area_name CHECK (area_name IS NULL OR (btrim(area_name) <> '' AND area_name = btrim(area_name))),
  CONSTRAINT ck_listings_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT ck_listings_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT ck_listings_coordinate_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
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

CREATE TABLE listing_images (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  listing_id integer NOT NULL,
  cloudinary_public_id varchar(255) NOT NULL,
  secure_url varchar(2048) NOT NULL,
  format varchar(16) NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  byte_size integer NOT NULL,
  display_order smallint NOT NULL,
  alt_text varchar(255),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_listing_images PRIMARY KEY (id),
  CONSTRAINT fk_listing_images_listing FOREIGN KEY (listing_id)
    REFERENCES listings (id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT,
  CONSTRAINT uq_listing_images_cloudinary_public_id UNIQUE (cloudinary_public_id),
  CONSTRAINT uq_listing_images_listing_display_order UNIQUE (listing_id, display_order)
    DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT ck_listing_images_public_id CHECK (btrim(cloudinary_public_id) <> '' AND cloudinary_public_id = btrim(cloudinary_public_id)),
  CONSTRAINT ck_listing_images_secure_url CHECK (secure_url LIKE 'https://%'),
  CONSTRAINT ck_listing_images_format CHECK (btrim(format) <> '' AND format = lower(btrim(format))),
  CONSTRAINT ck_listing_images_dimensions CHECK (width > 0 AND height > 0),
  CONSTRAINT ck_listing_images_byte_size CHECK (byte_size BETWEEN 1 AND 5242880),
  CONSTRAINT ck_listing_images_display_order CHECK (display_order BETWEEN 1 AND 8),
  CONSTRAINT ck_listing_images_alt_text CHECK (alt_text IS NULL OR btrim(alt_text) <> '')
);

CREATE TABLE listing_amenities (
  listing_id integer NOT NULL,
  amenity_id smallint NOT NULL,
  CONSTRAINT pk_listing_amenities PRIMARY KEY (listing_id, amenity_id),
  CONSTRAINT fk_listing_amenities_listing FOREIGN KEY (listing_id)
    REFERENCES listings (id)
    ON DELETE CASCADE
    ON UPDATE RESTRICT,
  CONSTRAINT fk_listing_amenities_amenity FOREIGN KEY (amenity_id)
    REFERENCES amenities (id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
);

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
  CONSTRAINT ck_moderation_history_status_changed CHECK (previous_status <> new_status),
  CONSTRAINT ck_moderation_history_transition CHECK (
    (previous_status = 'PENDING' AND new_status IN ('APPROVED', 'REJECTED'))
    OR (previous_status = 'APPROVED' AND new_status = 'HIDDEN')
    OR (previous_status = 'HIDDEN' AND new_status = 'APPROVED')
  ),
  CONSTRAINT ck_moderation_history_reason_nonblank CHECK (reason IS NULL OR btrim(reason) <> ''),
  CONSTRAINT ck_moderation_history_reason_required CHECK (
    new_status NOT IN ('REJECTED', 'HIDDEN')
    OR (reason IS NOT NULL AND btrim(reason) <> '')
  )
);
