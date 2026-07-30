# RentMate migration policy

This directory contains ordered RentMate SQL migrations. RM-004 establishes the runner and policy only, so it
intentionally contains no SQL migration. RM-005 will add the first product-schema migration.

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

Database integration tests require an explicit `TEST_DATABASE_URL` targeting `rentmate_test` or
`rentmate_test_*`:

```powershell
$env:TEST_DATABASE_URL = "postgresql://rentmate:rentmate_dev_password@localhost:5432/rentmate_test"
npm.cmd run test:migrations:database
```

The safety guard rejects missing or unsafe targets before connecting. Integration fixtures use only `rm004_*`
test tables, clean only those objects, and never create, drop, truncate, or mutate the development database.
