# RentMate

RentMate is a map-based room rental platform. This repository currently contains the initial project skeleton only; no product features, database tables, or application workflows have been implemented.

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
