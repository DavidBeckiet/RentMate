# RentMate local demo runbook

This runbook provides one repeatable local Roommate V1/V2/V3 demo. It is for local Docker PostgreSQL only; it must not
be used against staging or production.

## 1. Prerequisites

- Node.js 22.15.x and npm 10.9.x.
- Docker Desktop with Docker Compose.
- Dependencies installed with the repository lockfiles:

```powershell
npm.cmd ci
npm.cmd --prefix frontend ci
npm.cmd --prefix services/identity-service ci
npm.cmd --prefix services/listing-service ci
npm.cmd --prefix services/engagement-service ci
```

Copy `.env.example` to `.env` if it does not already exist. Set the normal local values needed by Docker Compose, but do
not commit `.env`. The Compose file itself selects the three local `rentmate_*` service databases. Copy the
service-specific Identity, Listing, and Engagement database settings from `.env.microservices.example` only when using
the all-local-node route.

`NEXT_PUBLIC_API_BASE_URL` must be exactly `http://localhost:4001`. Port 4000 is the compatibility backend service,
not the browser API for the microservice/Roommate demo.

## 2. Gemini is optional

The core Roommate demo does not require Gemini. Keep the AI flags disabled unless an approved rollout is being tested:

```dotenv
ROOMMATE_AI_PROVIDER=DISABLED
ROOMMATE_AI_ENABLED=false
ROOMMATE_AI_PARSER_ENABLED=false
ROOMMATE_AI_RECOMMENDATION_ENABLED=false
ROOMMATE_AI_EXPLANATION_ENABLED=false
ROOMMATE_AI_SAFETY_MODE=OFF
GEMINI_API_KEY=
```

When an approved local Gemini test is required, put the server-only key in `GEMINI_API_KEY` in `.env`, set only the
approved flags/models, rebuild the Engagement container, and never create a `NEXT_PUBLIC_GEMINI_API_KEY` variable.
The seeded safety-warning example has deterministic persisted metadata and works without a live provider.

To display that persisted warning in the tenant conversation (rather than only inspect it through the admin data), the
approved tenant-warning gate must also be explicitly configured before rebuilding Engagement:

```dotenv
ROOMMATE_AI_PROVIDER=GEMINI
ROOMMATE_AI_ENABLED=true
ROOMMATE_AI_SAFETY_MODE=TENANT
ROOMMATE_AI_SAFETY_MODEL=gemini-2.5-flash
ROOMMATE_AI_ROLLOUT_PERCENTAGE=100
```

This is a deliberate V3 rollout choice. `OFF` and `SHADOW` do not show tenant warnings, even when a completed seeded
analysis exists. The demo seed never calls Gemini; the key/model are required only because the existing runtime gate
validates enabled Gemini safety configuration.

## 3. Start the local service stack

From the repository root, run the Compose stack that owns the Gateway on port 4001:

```powershell
docker compose -f docker-compose.microservices.yml up -d --build
docker compose -f docker-compose.microservices.yml ps
```

Do not run `npm.cmd run dev:microservices` while that Gateway is running. The script now refuses that hybrid state so a
new frontend cannot silently attach to an old or unknown port-4001 stack. To use the all-local-node route instead, first
stop Compose with `docker compose -f docker-compose.microservices.yml down`, verify port 4001 is free, and then run
`npm.cmd run dev:microservices`.

For the documented Compose demo route, start only the frontend in a separate terminal:

```powershell
npm.cmd --prefix frontend run dev
```

## 4. Apply the current Engagement migration

The existing `0020_roommate_ai_safety_analyses.sql` migration is required for the seeded V3 safety projection. Use the
repository migration runner in `existing` mode with the real external deployment-version record. For the local demo
database that is at version 19, first preview and then apply version 20. Confirm the target is local
`rentmate_engagement` before running the non-preview command. Do not use `clean` mode on a populated local demo DB.

## 5. Seed or reset only development demo data

Run the repeat-safe development seed:

```powershell
npm.cmd run seed:dev
```

The seed is guarded by `NODE_ENV=development` and a local PostgreSQL host. It replaces only records owned by the named
demo accounts and their related demo listings/Roommate records; it does not reset the database.

All demo users use the password printed by the seed command. The key accounts are:

| Purpose | Email |
| --- | --- |
| Admin review | `demo.admin@rentmate.local` |
| Linked/Open discovery owner | `demo.tenant@rentmate.local` |
| Unlinked/Open discovery owner and pending interest sender | `demo.tenant2@rentmate.local` |
| Connected conversation sender | `demo.tenant3@rentmate.local` |
| Connected conversation recipient/reporter | `demo.tenant4@rentmate.local` |

## 6. Health checks and controlled demo flow

```powershell
Invoke-WebRequest http://localhost:4001/api/health | Select-Object -ExpandProperty Content
Invoke-WebRequest http://localhost:3000 | Select-Object -ExpandProperty StatusCode
```

1. Sign in as `demo.tenant2@rentmate.local`; open Roommate discovery and inspect the linked OPEN request owned by
   `demo.tenant@rentmate.local`. The V2 compatibility view has several aligned dimensions and one discussion point;
   it deliberately has no numeric score.
2. Switch to `demo.tenant@rentmate.local` to inspect the unlinked OPEN fallback request owned by
   `demo.tenant2@rentmate.local` and the incoming pending interest.
3. With the optional `TENANT` safety gate configured, sign in as `demo.tenant4@rentmate.local`, open the current
   connection, and inspect the benign Vietnamese chat plus the deterministic OTP/credential safety warning. The warning
   is recipient-only; `demo.tenant3@rentmate.local` does not see it on their own message.
4. Sign in as `demo.admin@rentmate.local`, open Roommate reports, and inspect the report linked to that exact message.
   The deterministic V2 report-risk information remains separate from the V3 AI safety summary.

## 7. Shutdown and repeat

Stop the frontend with `Ctrl+C`. For Compose services use:

```powershell
docker compose -f docker-compose.microservices.yml down
```

Do not use `down -v` for an ordinary reset. To restore the deterministic demo data, start the local stack again and run
`npm.cmd run seed:dev`; it is the supported repeat/reset operation.
