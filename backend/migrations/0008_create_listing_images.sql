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
  CONSTRAINT ck_listing_images_public_id CHECK (
    btrim(cloudinary_public_id) <> ''
    AND cloudinary_public_id = btrim(cloudinary_public_id)
  ),
  CONSTRAINT ck_listing_images_secure_url CHECK (
    secure_url LIKE 'https://%'
  ),
  CONSTRAINT ck_listing_images_format CHECK (
    btrim(format) <> ''
    AND format = lower(btrim(format))
  ),
  CONSTRAINT ck_listing_images_dimensions CHECK (
    width > 0
    AND height > 0
  ),
  CONSTRAINT ck_listing_images_byte_size CHECK (
    byte_size BETWEEN 1 AND 5242880
  ),
  CONSTRAINT ck_listing_images_display_order CHECK (
    display_order BETWEEN 1 AND 8
  ),
  CONSTRAINT ck_listing_images_alt_text CHECK (
    alt_text IS NULL
    OR btrim(alt_text) <> ''
  )
);
