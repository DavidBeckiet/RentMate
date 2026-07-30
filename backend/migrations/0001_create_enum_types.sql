CREATE TYPE user_role AS ENUM (
  'TENANT',
  'LANDLORD',
  'ADMIN'
);

CREATE TYPE listing_status AS ENUM (
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'HIDDEN',
  'INACTIVE'
);
