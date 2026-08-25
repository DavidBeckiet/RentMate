CREATE TYPE listing_business_status AS ENUM (
  'AVAILABLE',
  'PAUSED',
  'RENTED',
  'UNKNOWN'
);

ALTER TABLE listings
  ADD COLUMN business_status listing_business_status NOT NULL DEFAULT 'UNKNOWN';

CREATE INDEX idx_listings_business_status_updated_at
  ON listings (business_status, updated_at DESC, id DESC);

CREATE INDEX idx_listings_public_business_status
  ON listings (business_status, monthly_rent, id)
  WHERE status = 'APPROVED' AND business_status IN ('AVAILABLE', 'UNKNOWN');
