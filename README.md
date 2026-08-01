# RentMate

RentMate is a map-based room rental platform. The repository currently contains the project skeleton, runtime
foundation, migration runner, the complete Phase 1 database schema, and the RM-008 controlled database bootstrap,
verification, and admin-provisioning commands. RM-009 adds production configuration validation and shared PostgreSQL
access foundations. Product endpoints, authentication endpoints, and application workflows have not been implemented.

## Prerequisites

- Node.js 22.15.1, pinned in `.nvmrc`
- npm 10.9.2
- Docker Desktop with Docker Compose

## Setup

Run all commands from the repository root unless a command explicitly changes directory. npm is the package manager for
the root tooling, frontend, and backend. The PowerShell examples use `npm.cmd` so they also work when local execution
policy blocks the `npm.ps1` shim; in other shells, use the equivalent `npm` command.

1. Select the pinned Node.js version:

   ```powershell
   nvm install 22.15.1

   nvm use 22.15.1
   ```

2. Install the root tooling and both applications from their lockfiles:

   ```powershell
   npm.cmd ci
   npm.cmd --prefix frontend ci
   npm.cmd --prefix backend ci
   ```

3. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Start PostgreSQL from the repository root:

   ```powershell
   docker compose up -d postgres
   ```

5. Run both applications from the repository root:

   ```powershell
   npm.cmd run dev
   ```

   To run the applications in separate terminals instead:

   ```powershell
   npm.cmd --prefix backend run dev
   npm.cmd --prefix frontend run dev
   ```

Open http://localhost:3000. The page calls the backend health endpoint and reports the API and database status.

## Tests

Run the deterministic backend and frontend test suites from the repository root:

```powershell
npm.cmd run test
```

Run either suite separately:

```powershell
npm.cmd run test:backend
npm.cmd run test:frontend
```

Backend database connectivity tests require a separate disposable database whose name starts with `rentmate_test`.
Create it once in the local PostgreSQL container:

```powershell
docker compose exec -T postgres createdb -U rentmate rentmate_test
```

Set `TEST_DATABASE_URL` to that database, either in the repository-root `.env` copied from `.env.example` or in the
current shell, then run:

```powershell
$env:TEST_DATABASE_URL = "postgresql://rentmate:rentmate_dev_password@localhost:5432/rentmate_test"
npm.cmd --prefix backend run test:database
```

The database test command rejects missing configuration, the development database name, and names outside the
`rentmate_test*` namespace. The suite includes both a read-only connectivity check and isolated migration tests that
create, verify, and clean known RentMate test objects. Never point `TEST_DATABASE_URL` at development or production
data.

## Database migrations

Migration files live in `backend/migrations` and use the fixed `0001_descriptive_name.sql` convention. RM-005
currently provides:

- `0001_create_enum_types.sql`: `user_role` and `listing_status`.
- `0002_create_users.sql`: the foundational `users` table.
- `0003_create_property_types.sql`: the `property_types` catalog.
- `0004_create_amenities.sql`: the `amenities` catalog.
- `0005_seed_property_types.sql`: `ROOM`, `STUDIO`, `APARTMENT`, `HOUSE`, and `DORMITORY`.
- `0006_seed_amenities.sql`: `AIR_CONDITIONING`, `WIFI`, `FURNISHED`, `PRIVATE_BATHROOM`, `KITCHEN`, `REFRIGERATOR`,
  `WASHING_MACHINE`, `PARKING`, `ELEVATOR`, `SECURITY`, `BALCONY`, and `PET_FRIENDLY`.

The two seed migrations are repeat-safe: they reconcile the frozen label for an existing code without replacing its
identity or changing `is_active`. A retired lookup row with `is_active = false` therefore remains retired when seeds
run again.

RM-006 adds:

- `0007_create_listings.sql`: progressive listing drafts and scalar completeness outside `DRAFT`.
- `0008_create_listing_images.sql`: Cloudinary metadata with unique slots `1` through `8`; listing/order uniqueness
  is deferrable and initially immediate.
- `0009_create_listing_amenities.sql`: the listing-to-amenity junction.

Deleting a listing cascades its image metadata and amenity relationships. Deleting referenced users, property types,
and amenities remains restricted where specified.

RM-007 completes the frozen eight-table product schema:

- `0010_create_favorites.sql`: composite `(tenant_id, listing_id)` favorites with delete cascades from either parent.
  Favorite rows are not removed merely because a listing status changes or a referenced account becomes inactive.
- `0011_create_moderation_history.sql`: append-only moderation facts for `PENDING -> APPROVED`,
  `PENDING -> REJECTED`, `APPROVED -> HIDDEN`, and `HIDDEN -> APPROVED`. Rejection and hiding require a nonblank
  reason; referenced listings and administrators are delete- and key-update-restricted.
- `0012_create_explicit_indexes.sql`: exactly the ten approved non-constraint B-tree indexes:
  `idx_listings_status_updated_at`, `idx_listings_landlord_updated_at`,
  `idx_listings_approved_monthly_rent`, `idx_listings_approved_property_type`,
  `idx_listings_approved_room_area`, `idx_listings_approved_latitude`,
  `idx_listings_approved_longitude`, `idx_listing_amenities_amenity_listing`,
  `idx_favorites_tenant_created_at`, and `idx_moderation_history_listing_created_at`.

The five `idx_listings_approved_*` indexes use only `WHERE status = 'APPROVED'`; active-landlord visibility remains an
application query rule. RM-007 adds no unique application index, covering `INCLUDE` index, text-search index, trigram,
geospatial extension/index, active-user index, or duplicate index for a primary-key/unique-constraint prefix.

The final Phase 1 inventory is exactly two RentMate enum types, eight frozen product tables, 52 named constraints, ten
approved explicit non-constraint indexes, five property types, and twelve amenities, with no migration bookkeeping
table.

RM-008 does not add or modify a schema migration: the migration inventory ends at immutable migration `0012`.
Authentication and authorization endpoints remain unimplemented.

Preview a clean-database plan:

```powershell
npm.cmd run migrate:clean -- --plan-only
```

Existing deployments require an external JSON version record and select only newer repository migrations:

```powershell
npm.cmd run migrate:existing -- --manifest .\deployment-version.json --plan-only
```

Remove `--plan-only` to execute the validated plan. The runner uses one transaction per migration file, stops after
the first failure, and never creates a database bookkeeping table. Normal backend startup does not run migrations.

Run migration unit and isolated PostgreSQL integration tests with:

```powershell
npm.cmd run test:migrations

$env:TEST_DATABASE_URL = "postgresql://rentmate:rentmate_dev_password@localhost:5432/rentmate_test"
npm.cmd run test:migrations:database
```

Run the focused RM-006 checks with:

```powershell
npm.cmd run test:rm006

$env:TEST_DATABASE_URL = "postgresql://rentmate:rentmate_dev_password@localhost:5432/rentmate_test"
npm.cmd run test:rm006:database
```

Run the focused RM-007 inventory and schema checks with:

```powershell
npm.cmd run test:rm007

$env:TEST_DATABASE_URL = "postgresql://rentmate:rentmate_dev_password@localhost:5432/rentmate_test"
npm.cmd run test:rm007:database
```

Run the focused RM-008 provisioning, final-inventory, isolation, and clean-bootstrap checks with:

```powershell
npm.cmd run test:rm008

$env:TEST_DATABASE_URL = "<postgresql-url-for-rentmate_test>"
npm.cmd run test:rm008:database
```

To apply all twelve migrations to an explicitly selected clean isolated database:

```powershell
$env:NODE_ENV = "test"
$env:DB_HOST = "localhost"
$env:DB_PORT = "5432"
$env:DB_NAME = "rentmate_test"
$env:DB_USER = "rentmate"
$env:DB_PASSWORD = "rentmate_dev_password"
npm.cmd run migrate:clean
```

Use this only when `rentmate_test` is clean. Never point a clean migration command at development or production data.

See [backend/migrations/README.md](backend/migrations/README.md) for external manifest ownership, mismatch handling,
partial-failure recovery, migration immutability, and forward-fix policy.

## Phase 1 database bootstrap and admin provisioning

`db:bootstrap` is an explicit, one-time command for an empty PostgreSQL database only. It validates that the public
schema is empty, applies migrations `0001` through `0012` using the existing clean migration runner, verifies the
complete frozen inventory, provisions one admin, and verifies the inventory again. It never drops, truncates, resets,
or silently repairs a database.

Provide database configuration and admin secrets through an uncommitted local `.env` or a protected deployment
environment, never through command-line password arguments:

```powershell
$env:DB_HOST = "<database-host>"
$env:DB_PORT = "<database-port>"
$env:DB_NAME = "<empty-database-name>"
$env:DB_USER = "<database-user>"
$env:DB_PASSWORD = "<database-password>"
$env:RENTMATE_ADMIN_EMAIL = "<admin-email>"
$env:RENTMATE_ADMIN_PASSWORD = "<admin-password-from-secret-store>"
$env:RENTMATE_ADMIN_PHONE_E164 = "<optional-e164-phone>"
$env:BCRYPT_COST = "12"
npm.cmd run db:bootstrap
```

`RENTMATE_ADMIN_EMAIL` and `RENTMATE_ADMIN_PASSWORD` are required.
`RENTMATE_ADMIN_PHONE_E164` is optional and blank means no phone. The email is trimmed, lowercased, and validated.
The password is preserved exactly, must contain at least eight characters and at most 72 UTF-8 bytes, and is stored
only as a bcrypt hash. `BCRYPT_COST` defaults to `12`.

The standalone controlled commands are:

```powershell
npm.cmd run admin:provision
npm.cmd run db:verify
```

First-time provisioning creates one active `ADMIN`. Re-running it for the same active admin is a no-op: it does not
rotate the password, update the phone, or change timestamps. An inactive admin causes a failure and is not reactivated.
An existing tenant or landlord causes a conflict and is never promoted. The command reports only a sanitized outcome
and user ID; plaintext passwords, hashes, database URLs, and credentials are never printed.

Admin creation has no public HTTP route and none is registered by RM-008. Bootstrap, verification, provisioning, and
migrations are explicit operator commands and never run during normal backend or frontend startup.

Existing deployments must not use `db:bootstrap`. Their separate workflow is:

1. Select migrations newer than the externally recorded version and run `migrate:existing`.
2. Run `db:verify`.
3. Run `admin:provision` only when a controlled admin must be created.
4. Advance the external deployment record only after verification succeeds.

The commands never create a migration-history table or edit the external deployment manifest. RM-009 retains those
boundaries and does not change their provisioning semantics.

## Backend configuration and PostgreSQL access

The backend parses and validates its typed configuration once at startup, before it creates the runtime pool or opens
the HTTP listener. In production, every required setting must be explicit and valid; a missing, blank, malformed,
placeholder, or prohibited local-development value causes a sanitized startup failure. Secret values belong only in
an uncommitted local `.env` or protected deployment environment and are never included in configuration errors.

`FRONTEND_ORIGIN` is one exact origin, not a wildcard or URL path. Production requires HTTPS. Production also requires
the PostgreSQL settings, `JWT_SECRET`, `COOKIE_SECURE=true`, Cloudinary credentials, an HTTPS Nominatim base URL and
application-identifying user agent, the frozen image limits, deployment region, 50 km search radius, and an allowed
log level. RM-009 validates these future integration settings but does not instantiate authentication, cookies, CORS,
Cloudinary, or Nominatim behavior.

PostgreSQL pools have explicit maximum size, connection timeout, idle timeout, and application name. Every normal
pool connection starts with the PostgreSQL session timezone set to UTC. Normal backend runtime reuses one lazily
created pool, while migrations and RM-008 operator commands own and close independent pools.

Use the normal pool executor for a single non-transactional statement. Every multi-write workflow must use the shared
transaction helper, which checks out one client and uses it for `BEGIN`, all callback queries, and `COMMIT` or
`ROLLBACK`, then releases it. The callback receives only a parameterized SQL executor and cannot release the client or
use the global pool accidentally.

Shared repository primitives require query objects with both `text` and `values`, including `values: []` for a query
without parameters. PostgreSQL `numeric` values are mapped explicitly at repository boundaries: `monthly_rent`
becomes a checked safe JavaScript integer, and `room_area_sqm` is deliberately converted from PostgreSQL numeric text
without silent rounding. A `timestamptz` becomes a validated, cloned application `Date` that preserves the exact
instant. API DTO serialization remains a later explicit mapping concern.

RM-009 adds no endpoint, business repository, migration, or schema object. Run its focused checks with:

```powershell
npm.cmd run test:rm009

$env:TEST_DATABASE_URL = "<postgresql-url-for-rentmate_test>"
npm.cmd run test:rm009:database
```

## Shared HTTP errors and request validation

RM-010 provides the shared HTTP contract used by later versioned handlers without adding a product or authentication
endpoint. Known application error codes derive their HTTP status from one frozen mapping. General errors use the
sanitized `{ "error": { "code", "message", "requestId" } }` envelope, while validation errors may add ordered safe
details. Malformed JSON returns `400`, oversized JSON returns `413`, and unexpected failures return a generic `500`
without exposing parser content, thrown values, stacks, SQL, credentials, cookies, JWTs, passwords, or hashes. The
health endpoint remains the separate unwrapped exception documented below.

Shared response helpers emit the exact object, paginated, and bodyless `204` shapes. Pure request helpers reject
unknown body fields and query parameters, distinguish repeated or structured query values, strictly parse path IDs
and pagination, and validate the frozen primitive ranges and text limits. They do not define endpoint schemas,
automatically map DTOs, or implement CORS/Origin, cookies, rate limiting, or authentication middleware.

Run the focused RM-010 suite with:

```powershell
npm.cmd run test:rm010
```

## Health endpoint

`GET http://localhost:4000/api/health`

When PostgreSQL is available, the endpoint returns:

```json
{
  "status": "ok",
  "database": "connected"
}
```

When PostgreSQL cannot be reached, it returns HTTP `503` with `database: "unavailable"`.

## Useful commands

```powershell
# Stop PostgreSQL
docker compose down

# Build both applications
npm.cmd run build

# Type-check both applications without emitting files
npm.cmd run typecheck

# Lint both applications
npm.cmd run lint

# Format repository source and tooling files
npm.cmd run format

# Verify formatting without modifying files
npm.cmd run format:check
```

Each aggregate command also has `:frontend` and `:backend` variants, such as `npm.cmd run build:frontend` and
`npm.cmd run lint:backend`. From either package directory, the corresponding `npm.cmd run build`,
`npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run format`, and `npm.cmd run format:check` commands are also
available.
