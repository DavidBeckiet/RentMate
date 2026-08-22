CREATE TYPE user_role AS ENUM (
  'TENANT',
  'LANDLORD',
  'ADMIN'
);

CREATE TABLE users (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  role user_role NOT NULL,
  email varchar(320) NOT NULL,
  phone_e164 varchar(16),
  password_hash varchar(100) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_users PRIMARY KEY (id),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT ck_users_email_normalized CHECK (
    btrim(email) <> ''
    AND email = lower(btrim(email))
  ),
  CONSTRAINT ck_users_phone_e164 CHECK (
    phone_e164 IS NULL
    OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  ),
  CONSTRAINT ck_users_landlord_phone CHECK (
    role <> 'LANDLORD'
    OR phone_e164 IS NOT NULL
  )
);
