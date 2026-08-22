CREATE INDEX idx_listings_status_updated_at
ON listings (status, updated_at DESC, id DESC);

CREATE INDEX idx_listings_landlord_updated_at
ON listings (landlord_id, updated_at DESC, id DESC);

CREATE INDEX idx_listings_approved_monthly_rent
ON listings (monthly_rent, id)
WHERE status = 'APPROVED';

CREATE INDEX idx_listings_approved_property_type
ON listings (property_type_id, id)
WHERE status = 'APPROVED';

CREATE INDEX idx_listings_approved_room_area
ON listings (room_area_sqm, id)
WHERE status = 'APPROVED';

CREATE INDEX idx_listings_approved_latitude
ON listings (latitude, id)
WHERE status = 'APPROVED';

CREATE INDEX idx_listings_approved_longitude
ON listings (longitude, id)
WHERE status = 'APPROVED';

CREATE INDEX idx_listing_amenities_amenity_listing
ON listing_amenities (amenity_id, listing_id);

CREATE INDEX idx_moderation_history_listing_created_at
ON moderation_history (listing_id, created_at DESC, id DESC);
