DO $$
BEGIN
  IF to_regclass('users') IS NULL OR to_regclass('landlord_verifications') IS NULL THEN
    RAISE EXCEPTION 'Identity migration 0003 requires schema version 0002';
  END IF;
END
$$;

ALTER TABLE users
  ADD COLUMN display_name varchar(120),
  ADD CONSTRAINT ck_users_display_name CHECK (
    display_name IS NULL
    OR (
      display_name = btrim(display_name)
      AND display_name <> ''
    )
  );
