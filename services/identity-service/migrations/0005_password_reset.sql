CREATE TABLE password_reset_tokens (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL,
  token_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_reset_tokens_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ck_password_reset_tokens_hash CHECK (
    token_hash = btrim(token_hash) AND token_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_password_reset_tokens_expiry CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX uq_password_reset_tokens_hash
  ON password_reset_tokens (token_hash);

CREATE UNIQUE INDEX uq_password_reset_tokens_active_user
  ON password_reset_tokens (user_id)
  WHERE consumed_at IS NULL;

CREATE INDEX idx_password_reset_tokens_expiry
  ON password_reset_tokens (expires_at)
  WHERE consumed_at IS NULL;
