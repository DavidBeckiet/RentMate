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
