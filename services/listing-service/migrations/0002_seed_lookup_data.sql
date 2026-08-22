INSERT INTO property_types (code, label)
VALUES
  ('ROOM', 'Room'),
  ('STUDIO', 'Studio'),
  ('APARTMENT', 'Apartment'),
  ('HOUSE', 'House'),
  ('DORMITORY', 'Dormitory')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label;

INSERT INTO amenities (code, label)
VALUES
  ('AIR_CONDITIONING', 'Air conditioning'),
  ('WIFI', 'Wi-Fi'),
  ('FURNISHED', 'Furnished'),
  ('PRIVATE_BATHROOM', 'Private bathroom'),
  ('KITCHEN', 'Kitchen'),
  ('REFRIGERATOR', 'Refrigerator'),
  ('WASHING_MACHINE', 'Washing machine'),
  ('PARKING', 'Parking'),
  ('ELEVATOR', 'Elevator'),
  ('SECURITY', 'Security'),
  ('BALCONY', 'Balcony'),
  ('PET_FRIENDLY', 'Pet-friendly')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label;
