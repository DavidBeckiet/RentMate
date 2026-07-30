INSERT INTO property_types (code, label)
VALUES
  ('ROOM', 'Room'),
  ('STUDIO', 'Studio'),
  ('APARTMENT', 'Apartment'),
  ('HOUSE', 'House'),
  ('DORMITORY', 'Dormitory')
ON CONFLICT (code) DO UPDATE
SET label = EXCLUDED.label;
