ALTER TABLE saved_searches
  ADD COLUMN min_occupants smallint;

ALTER TABLE saved_searches
  ADD CONSTRAINT saved_searches_min_occupants
  CHECK (min_occupants IS NULL OR min_occupants BETWEEN 1 AND 20);
