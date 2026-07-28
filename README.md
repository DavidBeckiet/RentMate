# RentMate

RentMate is a map-based room rental platform. This repository currently contains the initial project skeleton only; no product features, database tables, or application workflows have been implemented.

## Prerequisites

- Node.js 22 or later
- Docker Desktop with Docker Compose

## Setup

1. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Start PostgreSQL from the repository root:

   ```powershell
   docker compose up -d postgres
   ```

3. Install and run the backend in one terminal:

   ```powershell
   Set-Location backend
   npm install
   npm run dev
   ```

4. Install and run the frontend in another terminal:

   ```powershell
   Set-Location frontend
   npm install
   npm run dev
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

# Type-check the backend
Set-Location backend
npm run typecheck

# Lint the frontend
Set-Location frontend
npm run lint
```
