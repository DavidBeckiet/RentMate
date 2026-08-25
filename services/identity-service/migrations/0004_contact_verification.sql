ALTER TABLE users
  ADD COLUMN email_verified_at timestamptz,
  ADD COLUMN phone_verified_at timestamptz;

CREATE TABLE contact_verification_challenges (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL,
  channel varchar(8) NOT NULL,
  destination varchar(320) NOT NULL,
  secret_hash varchar(128) NOT NULL,
  attempt_count smallint NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_contact_verification_challenges_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ck_contact_verification_challenges_channel CHECK (
    channel IN ('EMAIL', 'PHONE')
  ),
  CONSTRAINT ck_contact_verification_challenges_destination CHECK (
    destination = btrim(destination) AND destination <> ''
  ),
  CONSTRAINT ck_contact_verification_challenges_secret_hash CHECK (
    secret_hash = btrim(secret_hash) AND secret_hash <> ''
  ),
  CONSTRAINT ck_contact_verification_challenges_attempts CHECK (
    attempt_count BETWEEN 0 AND 5
  )
);

CREATE INDEX idx_contact_verification_challenges_lookup
  ON contact_verification_challenges (user_id, channel, created_at DESC, id DESC);

CREATE INDEX idx_contact_verification_challenges_expiry
  ON contact_verification_challenges (expires_at)
  WHERE consumed_at IS NULL;
