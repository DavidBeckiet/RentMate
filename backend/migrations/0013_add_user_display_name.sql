DO $$
BEGIN
  IF to_regclass('users') IS NULL
    OR to_regclass('idx_moderation_history_listing_created_at') IS NULL THEN
    RAISE EXCEPTION 'Compatibility migration 0013 requires schema version 0012';
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
