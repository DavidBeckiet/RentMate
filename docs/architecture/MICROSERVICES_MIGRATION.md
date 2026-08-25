# RentMate microservices migration

## Current milestone

The project now has a runnable migration foundation and the first real service extraction:

- `services/api-gateway` is an independent Node.js process.
- The gateway proxies all existing `/api/*` routes to the backend monolith by default.
- Identity, Listing, and Engagement service boundaries have independent health endpoints and process entrypoints.
- Identity Service now runs the existing `auth` and `users` routes and their repositories/services in its own process.
- `npm run dev:microservices` routes `/api/v1/auth/*`, `/api/v1/users/*`, and `/api/v1/admin/users/*` to Identity Service.
- Listing Service now runs the existing listing, search, moderation, image, and geocoding routes in its own process.
- Engagement Service now runs the existing favorites routes in its own process.
- Listing public search and Engagement favorites can now resolve active landlord visibility through Identity instead of
  joining the Identity `users` table directly.
- Engagement favorites can resolve public listing summaries through Listing's internal catalog contract instead of
  joining Listing tables directly.
- Listing Admin reads and public detail/contact lookups can now resolve landlord profiles through Identity in one batch
  contract per read operation.
- `npm run dev:microservices` routes the corresponding listing and favorites route families to those services.
- Individual route families can be moved by setting `IDENTITY_SERVICE_URL`, `LISTING_SERVICE_URL`, or
  `ENGAGEMENT_SERVICE_URL` without changing the frontend contract.
- `npm run dev:microservices` starts the frontend through the gateway on port `4001`.

Identity, Listing, and Engagement now support isolated PostgreSQL databases with explicit migration/backfill commands.
The legacy backend implementation remains available as a rollback path so the cutover preserves data, JWT claims,
cookies, authorization, listing lifecycle, and rollback behavior.

## Identity database extraction

Identity now supports service-specific database variables such as `IDENTITY_DB_NAME`. When those variables are absent,
the service continues to use the compatibility database. When they are present, run the Identity migration first:

```powershell
$env:IDENTITY_DB_NAME = "rentmate_identity"
npm.cmd --prefix services/identity-service run migrate -- clean
npm.cmd --prefix services/identity-service run start
```

Identity migration mode is mandatory. `clean` selects the complete ordered inventory for an empty Identity database.
For an existing Identity database, use an operator-owned external version record and preview the selection before
execution:

```powershell
npm.cmd --prefix services/identity-service run migrate -- existing --manifest .\identity-version.json --plan-only
npm.cmd --prefix services/identity-service run migrate -- existing --manifest .\identity-version.json
```

The runner does not create a migration bookkeeping table and does not update the manifest. Advance the external record
only after the selected migrations and schema checks succeed. Migration `0001` creates the `user_role` enum and `users`
table; later forward migrations extend the service-owned schema without altering, dropping, or recreating the existing
`rentmate` database. Data copy and cutover remain separate operations.

Backfill existing users while preserving IDs with:

```powershell
$env:IDENTITY_DB_NAME = "rentmate_identity"
npm.cmd --prefix services/identity-service run backfill -- --apply
```

Without `--apply`, the command only reports the source/target and row count. The source `rentmate` database is read-only
for this operation; the target transaction rolls back as one unit on failure.

## Listing database extraction

Listing Service now has its own schema and backfill commands. The isolated schema owns listing status, lookup data,
listings, images, listing amenities, and moderation history. It deliberately has no foreign key to Identity users;
landlord and admin authorization/profile checks use the internal Identity contract.

```powershell
$env:LISTING_DB_NAME = "rentmate_listing"
npm.cmd --prefix services/listing-service run migrate -- clean --plan-only
npm.cmd --prefix services/listing-service run migrate -- clean
npm.cmd --prefix services/listing-service run backfill
npm.cmd --prefix services/listing-service run backfill -- --apply
```

For an existing Listing database, use an operator-owned version record and select only newer migrations:

```powershell
npm.cmd --prefix services/listing-service run migrate -- existing --manifest .\listing-version.json --plan-only
npm.cmd --prefix services/listing-service run migrate -- existing --manifest .\listing-version.json
```

The backfill copies IDs and timestamps in one target transaction. Without `--apply`, it only reports source counts. The
legacy `rentmate` database is not modified, and Listing Service continues to use the compatibility database whenever
`LISTING_DB_*` variables are absent.

## Engagement database extraction

Engagement Service owns the `favorites` table in its isolated database. It deliberately has no foreign keys to Identity or
Listing; tenant authorization is checked through Identity and visible listing summaries are resolved through Listing.

```powershell
$env:ENGAGEMENT_DB_NAME = "rentmate_engagement"
npm.cmd --prefix services/engagement-service run migrate -- clean --plan-only
npm.cmd --prefix services/engagement-service run migrate -- clean
npm.cmd --prefix services/engagement-service run backfill
npm.cmd --prefix services/engagement-service run backfill -- --apply
```

For an existing Engagement database, use an operator-owned version record and select only newer migrations:

```powershell
npm.cmd --prefix services/engagement-service run migrate -- existing --manifest .\engagement-version.json --plan-only
npm.cmd --prefix services/engagement-service run migrate -- existing --manifest .\engagement-version.json
```

The favorite backfill preserves tenant/listing IDs and timestamps in one transaction. Without `--apply`, it only reports
the source count. `ENGAGEMENT_DB_*` can remain unset to use the compatibility database during rollback.

Favorite creation across the two databases uses a compensating Saga: Engagement inserts the idempotent provisional row,
asks Listing to authorize current public visibility, and removes the row when authorization fails or the newly inserted
operation encounters a Listing error. Reads always re-project through Listing, so a status race cannot expose a hidden
listing. This is intentionally eventual consistency; PostgreSQL 2PC is not used across service-owned databases.

## Target boundaries

```text
Browser
  |
API Gateway :4001
  |-- Identity Service       auth, users, session boundary
  |-- Listing Service        listings, search, moderation, providers
  `-- Engagement Service     favorites

Legacy backend :4000 remains the compatibility upstream during migration.
```

## Local/staging container topology

`docker-compose.microservices.yml` defines PostgreSQL plus the compatibility Backend, Identity, Listing, Engagement, and
Gateway containers. It is a
staging/bootstrap topology, not a production secret store. Supply required secrets through the environment, validate the
expanded configuration, then run each service migration as a release step before starting application traffic:

```powershell
docker compose -f docker-compose.microservices.yml config --quiet
docker compose -f docker-compose.microservices.yml up -d postgres
docker compose -f docker-compose.microservices.yml run --rm backend node dist/db/bootstrap/cli.js
docker compose -f docker-compose.microservices.yml run --rm --no-deps identity npm --prefix services/identity-service run migrate -- clean
docker compose -f docker-compose.microservices.yml run --rm --no-deps listing npm --prefix services/listing-service run migrate -- clean
docker compose -f docker-compose.microservices.yml run --rm --no-deps engagement npm --prefix services/engagement-service run migrate -- clean
docker compose -f docker-compose.microservices.yml up -d --build identity listing engagement gateway
```

The compatibility Backend is included so the gateway has a safe rollback upstream for routes that have not yet moved
to a service. Its database is the fixed `rentmate` database; the three isolated service databases are separate owners.

Run the documented backfill commands before switching traffic when migrating an existing deployment. The compose file
does not run migrations at application startup and does not embed production secrets.

## Safe extraction order

1. Specify V2 database ownership and internal contracts for one boundary.
2. Move the boundary's repository and transaction ownership to its service database.
3. Add gateway contract tests and route the family through the new service.
4. Run the existing API regression suite through the gateway.
5. Remove the corresponding monolith module only after the cutover is verified.

No shared database or cross-service foreign key is introduced by this foundation. The isolated Identity, Listing, and
Engagement schemas are independently migrated and backfilled; the compatibility backend remains available only as a
rollback path when a service-specific database URL is not configured. The existing MVP API, cookie, privacy, listing
lifecycle, and security contracts remain unchanged across the gateway cutover.

The current MVP contract contains no `inquiries` or `viewings` modules/endpoints. Those are intentionally not routed to
Engagement until a separate product/API contract is approved.

## Staging rollout verification

The local staging topology was verified after the service runtime extraction:

```powershell
docker compose -f docker-compose.microservices.yml config --quiet
docker compose -f docker-compose.microservices.yml build identity listing engagement gateway
docker compose -f docker-compose.microservices.yml up -d --force-recreate identity listing engagement gateway
```

For a clean service database, apply each service migration once before starting application traffic. Do not rerun an
already-applied migration against a shared database:

```powershell
docker compose -f docker-compose.microservices.yml run --rm --no-deps identity npm --prefix services/identity-service run migrate -- clean
docker compose -f docker-compose.microservices.yml run --rm --no-deps listing npm --prefix services/listing-service run migrate -- clean
docker compose -f docker-compose.microservices.yml run --rm --no-deps engagement npm --prefix services/engagement-service run migrate -- clean
```

Then inspect the backfill plan and apply it only after the source/target counts have been reviewed:

```powershell
docker compose -f docker-compose.microservices.yml run --rm --no-deps identity npm --prefix services/identity-service run backfill
docker compose -f docker-compose.microservices.yml run --rm --no-deps listing npm --prefix services/listing-service run backfill
docker compose -f docker-compose.microservices.yml run --rm --no-deps engagement npm --prefix services/engagement-service run backfill

docker compose -f docker-compose.microservices.yml run --rm --no-deps identity npm --prefix services/identity-service run backfill -- --apply
docker compose -f docker-compose.microservices.yml run --rm --no-deps listing npm --prefix services/listing-service run backfill -- --apply
docker compose -f docker-compose.microservices.yml run --rm --no-deps engagement npm --prefix services/engagement-service run backfill -- --apply
```

The completed local verification confirmed healthy Postgres, Backend compatibility, Identity, Listing, Engagement, and
Gateway containers; Gateway health returned `200`, public lookup/listing routes returned `200`, and unauthenticated
favorites returned `401`. Production cutover still requires a real target environment, backup reference, secret owner,
DNS/TLS owner, and an approved rollback owner.

## Completion status

The current implementation is operationally cut over for all four existing MVP business modules:

- Gateway routing, timeout handling, internal-token forwarding, healthchecks, and rollback upstream: complete.
- Identity, Listing, and Engagement isolated database schemas, migrations, and backfill tooling: complete.
- Identity account/profile, Listing public-catalog, and Engagement favorite consistency contracts: complete.
- Docker Compose topology, production backend image, CI typecheck/build validation, and local smoke deployment: complete.

The business domains are now service-owned: Identity auth/users, Listing lifecycle/search/moderation/images/geocoding,
and Engagement favorites live under `services/*/src/modules`, with controllers, services, repositories, validations,
and domain-specific support grouped inside each module. Service entrypoints no longer import
`backend/src/modules`. Shared runtime infrastructure now lives under `services/shared/src/runtime`; each service
installs and starts from its own package without importing `backend` at runtime. The backend remains available only as
a separately built compatibility/rollback upstream with its own legacy runtime copy.

## Internal Identity contract

Identity exposes `GET /internal/v1/accounts/:userId` for service-to-service account verification, `GET
/internal/v1/landlords/active-ids` for public visibility filtering, and `GET /internal/v1/profiles?ids=...` for batch
landlord profile reads. Listing exposes `GET /internal/v1/listings/public-summaries?ids=...` for Engagement favorite
projection. Gateway adds `x-rentmate-internal-token` to requests sent to services; the token is never accepted from or
exposed to the browser. Listing and Engagement require these contracts at startup and fail fast when their service URLs
are absent. Public search and favorites preserve
limit-plus-one pagination and return no rows when Identity or Listing reports no visible records.
