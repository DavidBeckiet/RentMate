CREATE TABLE saved_searches (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id integer NOT NULL,
  name varchar(120),
  is_active boolean NOT NULL DEFAULT true,
  q varchar(160),
  area_name varchar(120),
  min_monthly_rent numeric(12, 0),
  max_monthly_rent numeric(12, 0),
  min_room_area_sqm numeric(8, 2),
  max_room_area_sqm numeric(8, 2),
  property_type_code varchar(32),
  amenity_codes text[] NOT NULL DEFAULT '{}',
  mode varchar(16) NOT NULL,
  north double precision,
  south double precision,
  east double precision,
  west double precision,
  center_lat double precision,
  center_lng double precision,
  radius_km numeric(7, 3),
  sort varchar(16) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_searches_tenant_positive CHECK (tenant_id > 0),
  CONSTRAINT saved_searches_name_normalized CHECK (name IS NULL OR (name = btrim(name) AND name <> '')),
  CONSTRAINT saved_searches_q_normalized CHECK (q IS NULL OR (q = btrim(q) AND q <> '')),
  CONSTRAINT saved_searches_area_name_normalized CHECK (area_name IS NULL OR (area_name = btrim(area_name) AND area_name <> '')),
  CONSTRAINT saved_searches_rent_range CHECK (
    (min_monthly_rent IS NULL OR min_monthly_rent BETWEEN 1 AND 999999999999)
    AND (max_monthly_rent IS NULL OR max_monthly_rent BETWEEN 1 AND 999999999999)
    AND (min_monthly_rent IS NULL OR max_monthly_rent IS NULL OR min_monthly_rent <= max_monthly_rent)
  ),
  CONSTRAINT saved_searches_area_range CHECK (
    (min_room_area_sqm IS NULL OR min_room_area_sqm > 0)
    AND (max_room_area_sqm IS NULL OR max_room_area_sqm > 0)
    AND (min_room_area_sqm IS NULL OR max_room_area_sqm IS NULL OR min_room_area_sqm <= max_room_area_sqm)
  ),
  CONSTRAINT saved_searches_property_type_code CHECK (
    property_type_code IS NULL OR property_type_code ~ '^[A-Z][A-Z0-9_]*$'
  ),
  CONSTRAINT saved_searches_amenity_codes CHECK (
    array_position(amenity_codes, NULL) IS NULL
  ),
  CONSTRAINT saved_searches_mode_fields CHECK (
    (
      mode = 'ordinary'
      AND north IS NULL AND south IS NULL AND east IS NULL AND west IS NULL
      AND center_lat IS NULL AND center_lng IS NULL AND radius_km IS NULL
      AND sort IN ('newest', 'rent_asc', 'rent_desc')
    ) OR (
      mode = 'bounds'
      AND north IS NOT NULL AND south IS NOT NULL AND east IS NOT NULL AND west IS NOT NULL
      AND north BETWEEN -90 AND 90 AND south BETWEEN -90 AND 90 AND south < north
      AND east BETWEEN -180 AND 180 AND west BETWEEN -180 AND 180 AND west < east
      AND center_lat IS NULL AND center_lng IS NULL AND radius_km IS NULL
      AND sort IN ('newest', 'rent_asc', 'rent_desc')
    ) OR (
      mode = 'radius'
      AND north IS NULL AND south IS NULL AND east IS NULL AND west IS NULL
      AND center_lat IS NOT NULL AND center_lng IS NOT NULL AND radius_km IS NOT NULL
      AND center_lat BETWEEN -90 AND 90 AND center_lng BETWEEN -180 AND 180
      AND radius_km > 0 AND radius_km <= 50
      AND sort = 'distance_asc'
    )
  )
);

CREATE INDEX saved_searches_tenant_updated_idx
  ON saved_searches (tenant_id, updated_at DESC, id DESC);
