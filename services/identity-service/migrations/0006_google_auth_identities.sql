CREATE TABLE user_auth_identities (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id integer NOT NULL,
  provider varchar(32) NOT NULL,
  provider_subject varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_user_auth_identities PRIMARY KEY (id),
  CONSTRAINT fk_user_auth_identities_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ck_user_auth_identities_provider CHECK (provider = 'GOOGLE'),
  CONSTRAINT ck_user_auth_identities_subject CHECK (
    provider_subject = btrim(provider_subject) AND provider_subject <> ''
  ),
  CONSTRAINT uq_user_auth_identities_provider_subject UNIQUE (provider, provider_subject),
  CONSTRAINT uq_user_auth_identities_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX idx_user_auth_identities_user
  ON user_auth_identities (user_id);
