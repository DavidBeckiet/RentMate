# RentMate migration policy

This directory contains ordered RentMate SQL migrations. RM-004 established the runner and policy; RM-005 adds the
first product-schema migrations.

## RM-005 inventory

The current migration inventory is:

1. `0001_create_enum_types.sql` creates `user_role` with `TENANT`, `LANDLORD`, and `ADMIN`, and `listing_status` with
   `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `HIDDEN`, and `INACTIVE`.
2. `0002_create_users.sql` creates the foundational `users` table.
3. `0003_create_property_types.sql` creates the `property_types` catalog.
4. `0004_create_amenities.sql` creates the `amenities` catalog.
5. `0005_seed_property_types.sql` seeds `ROOM` (`Room`), `STUDIO` (`Studio`), `APARTMENT` (`Apartment`), `HOUSE`
   (`House`), and `DORMITORY` (`Dormitory`).
6. `0006_seed_amenities.sql` seeds `AIR_CONDITIONING` (`Air conditioning`), `WIFI` (`Wi-Fi`), `FURNISHED`
   (`Furnished`), `PRIVATE_BATHROOM` (`Private bathroom`), `KITCHEN` (`Kitchen`), `REFRIGERATOR` (`Refrigerator`),
   `WASHING_MACHINE` (`Washing machine`), `PARKING` (`Parking`), `ELEVATOR` (`Elevator`), `SECURITY` (`Security`),
   `BALCONY` (`Balcony`), and `PET_FRIENDLY` (`Pet-friendly`).

Both catalog seeds use the code as their conflict key and update only the frozen label. Repeating the seed files does
not create duplicate rows or replace identities, and it deliberately preserves an existing `is_active = false`
retirement state.

RM-005 currently creates exactly two RentMate enum types and three product tables. This is not the complete frozen
eight-table schema: the remaining product tables are owned by later roadmap tasks.

## RM-006 inventory

RM-006 adds exactly:

7. `0007_create_listings.sql` creates `listings`. Drafts may be incomplete, while
   `ck_listings_non_draft_complete` requires every frozen scalar field outside `DRAFT`.
8. `0008_create_listing_images.sql` creates `listing_images`. Display slots are limited to `1` through `8`, and
   unique `(listing_id, display_order)` is `DEFERRABLE INITIALLY IMMEDIATE`.
9. `0009_create_listing_amenities.sql` creates the two-column `listing_amenities` junction.

Listing deletion cascades database image metadata and listing-amenity relationships. The user and property-type
parents of a listing remain delete-restricted, and referenced amenities remain delete-restricted. RM-006 adds no
explicit application index; those indexes belong to RM-007. `favorites` and `moderation_history` are not implemented.

The current schema has exactly two RentMate enum types and six of the final eight product tables. Existing migration
files are immutable, and normal backend startup does not discover or execute migrations.

## File convention and discovery

- Migration filenames use exactly four numeric version digits, a lowercase snake-case description, and `.sql`, for
  example `0001_create_foundation.sql`.
- Versions start at `0001`. Malformed SQL filenames, including uppercase `.SQL`, and duplicate numeric versions stop
  discovery.
- Discovery is non-recursive. Directories and regular files without the `.sql` extension, including this README, are
  ignored.
- Files are sorted by parsed numeric version and then by filename; filesystem enumeration order is never execution
  order.
- Gaps are permitted so later migrations can be inserted only at versions newer than every shared migration. An
  existing-deployment record must reference an exact version present in the repository.

## Deployment modes

The operator must choose one mode explicitly.

### Clean database

`npm.cmd run migrate:clean -- --plan-only` previews every repository migration in order without connecting to
PostgreSQL. Remove `--plan-only` to execute the plan. Clean mode selects every migration exactly once for that command
invocation and never infers prior state from the database.

### Existing deployment

The release system owns an external JSON manifest:

```json
{
  "appliedVersion": 1
}
```

The value must be a positive integer and an exact repository migration version. It must not be negative, newer than
the repository, missing from the repository, or silently assumed to be zero.

Preview with:

```powershell
npm.cmd run migrate:existing -- --manifest .\deployment-version.json --plan-only
```

Remove `--plan-only` to execute only migrations whose versions are strictly newer than `appliedVersion`. An empty
plan succeeds when the manifest already references the latest repository migration.

The runner never creates, queries, or updates a database migration bookkeeping table. The deployment operator updates
the external manifest only after every selected migration succeeds and post-migration verification passes.

## Transactions, failures, and recovery

- Planning, filename validation, duplicate detection, and manifest validation finish before a database pool is
  created.
- Each selected file checks out one `pg` client, begins one transaction, executes the complete SQL file as one unit,
  commits, and releases the client.
- A failure before commit triggers rollback of the current file, releases the client, and stops the sequence.
- Earlier committed files remain committed. Later files do not execute.
- Failure output identifies the failed migration and last successful migration without logging credentials, complete
  database URLs, SQL contents, or raw provider/runtime errors.
- A schema precondition failure is a migration failure. A manifest/repository mismatch stops before SQL executes.
- There are no automatic down migrations or destructive rollback scripts. Production recovery requires investigation,
  then either an environment restore or a new forward migration.
- Shared or applied migrations are immutable. Never edit one to repair an environment; add a later forward migration.
- Normal backend startup never discovers or executes migrations. Migration execution is an explicit deployment
  command.

## Tests

Run pure discovery, planning, CLI, and execution tests:

```powershell
npm.cmd run test:migrations
```

Run the focused RM-006 inventory and PostgreSQL schema checks:

```powershell
npm.cmd run test:rm006

$env:TEST_DATABASE_URL = "postgresql://rentmate:rentmate_dev_password@localhost:5432/rentmate_test"
npm.cmd run test:rm006:database
```

Database integration tests require an explicit `TEST_DATABASE_URL` targeting `rentmate_test` or
`rentmate_test_*`:

```powershell
$env:TEST_DATABASE_URL = "postgresql://rentmate:rentmate_dev_password@localhost:5432/rentmate_test"
npm.cmd run test:migrations:database
```

The safety guard rejects missing or unsafe targets before connecting. Integration fixtures use only the explicitly
owned `rm004_*`, `rm005_*`, and `rm006_*` test objects plus the known RentMate tables and enum types. They clean only
those objects and never create, drop, truncate, or mutate the development database.

To execute all nine migrations, explicitly point the migration command at a clean isolated database:

```powershell
$env:NODE_ENV = "test"
$env:DB_HOST = "localhost"
$env:DB_PORT = "5432"
$env:DB_NAME = "rentmate_test"
$env:DB_USER = "rentmate"
$env:DB_PASSWORD = "rentmate_dev_password"
npm.cmd run migrate:clean
```

Never use the clean command against development or production data.
