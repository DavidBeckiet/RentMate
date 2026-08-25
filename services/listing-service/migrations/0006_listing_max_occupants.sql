ALTER TABLE listings
  ADD COLUMN max_occupants smallint;

ALTER TABLE listings
  ADD CONSTRAINT ck_listings_max_occupants
  CHECK (max_occupants IS NULL OR max_occupants BETWEEN 1 AND 20);
