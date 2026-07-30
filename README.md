# RentMate

RentMate is a map-based room rental platform. The repository currently contains the project skeleton, runtime
foundation, migration runner, and the RM-005 foundational database schema. Product endpoints and application
workflows have not been implemented.

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
create, verify, and clean RM-005 objects. Never point `TEST_DATABASE_URL` at development or production data.

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

RM-005 is an intermediate schema milestone with exactly two RentMate enum types and three product tables. It is not
the complete frozen eight-table schema; the remaining five tables belong to later roadmap tasks.

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

See [backend/migrations/README.md](backend/migrations/README.md) for external manifest ownership, mismatch handling,
partial-failure recovery, migration immutability, and forward-fix policy.

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
