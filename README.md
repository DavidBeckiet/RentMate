# RentMate

RentMate is a responsive, map-based room-rental and roommate platform for Ho Chi Minh City. The current local/demo
architecture uses a Next.js App Router frontend, API Gateway, Identity, Listing, Engagement, Verification Delivery,
PostgreSQL, and the retained Express/TypeScript compatibility backend. See
[MICROSERVICES_MIGRATION.md](docs/architecture/MICROSERVICES_MIGRATION.md).

Public users can search/filter approved listings in list/map/radius views and open privacy-safe detail. Tenants can
register, authenticate, view landlord contact on currently public detail, and manage favorites. Landlords can manage
profile, drafts, location, images, submission, and lifecycle. Admins can read moderation queues/history, perform the
four frozen moderation actions, and activate/deactivate tenant or landlord accounts.

## Prerequisites and setup

- Node.js 22.15.1 (`.nvmrc`)
- npm 10.9.2
- Docker Desktop with Docker Compose

Run from the repository root:

```powershell
npm.cmd ci
npm.cmd --prefix frontend ci
npm.cmd --prefix backend ci
npm.cmd --prefix services/identity-service ci
npm.cmd --prefix services/listing-service ci
npm.cmd --prefix services/engagement-service ci
Copy-Item .env.example .env
docker compose -f docker-compose.microservices.yml up -d --build
npm.cmd run seed:dev
npm.cmd --prefix frontend run dev
```

The frontend is available at `http://localhost:3000`. Browser API traffic goes through the Gateway at
`http://localhost:4001`; port `4000` is the retained compatibility backend and is not the browser API.

The Compose stack already owns port `4001`, so do not run `npm.cmd run dev` at the same time. To use the all-local-node
route instead, stop the Compose stack first and then run:

```powershell
npm.cmd run dev:microservices
```

See [LOCAL_DEMO_RUNBOOK.md](docs/deployment/LOCAL_DEMO_RUNBOOK.md) for the reproducible demo setup, accounts, health
checks, optional AI positioning, and safe shutdown procedure.

## Session and API usage

Product endpoints use `/api/v1`; health remains `GET /api/health`. Browser requests use
`credentials: "include"`. Authentication is the two-hour host-only HttpOnly `rentmate_session` cookie—frontend
JavaScript never reads/stores the JWT and does not use a Bearer token. Unsafe methods require the exact configured
`Origin`. Public, tenant, landlord, and admin routes retain the roles/privacy documented in
[API_SPECIFICATION.md](docs/api/API_SPECIFICATION.md).

## Tests and quality

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
```

Database suites require a disposable `rentmate_test*` database through process-local `TEST_DATABASE_URL`; they reject
the development database and never fall back to it:

```powershell
$env:TEST_DATABASE_URL = "<postgresql-url-for-rentmate_test*>"
npm.cmd --prefix backend run test:database
```

Focused release verification:

```powershell
npm.cmd --prefix services/identity-service test
npm.cmd --prefix services/listing-service test
npm.cmd --prefix services/engagement-service test
npm.cmd --prefix services/api-gateway test
npm.cmd --prefix services/verification-delivery-adapter test
npm.cmd run test:e2e:final
```

`test:e2e:final` is the current-architecture Playwright acceptance suite. It uses frontend port `3000`, Gateway port
`4001`, current services, and PostgreSQL. The legacy RM-054 fixture remains historical and is excluded from release
acceptance. Normal unit tests and builds do not call live Cloudinary, Nominatim, Gemini, or production smoke targets.

## Database release commands

The retained compatibility backend uses immutable ordered migrations. Startup does not run them, and no migration
bookkeeping table exists. Current microservices keep their own ordered migrations under each service package.

```powershell
# Empty target: preview, then bootstrap migrations/seeds/admin and verify
npm.cmd run migrate:clean -- --plan-only
npm.cmd run db:bootstrap
npm.cmd run db:verify

# Existing target: external current-version manifest, plan first, then apply and verify
npm.cmd run migrate:existing -- --manifest <external-version-record.json> --plan-only
npm.cmd run migrate:existing -- --manifest <external-version-record.json>
npm.cmd run db:verify

# Controlled repeat-safe admin provisioning
npm.cmd run admin:provision
```

`RENTMATE_ADMIN_EMAIL` and `RENTMATE_ADMIN_PASSWORD` are protected inputs;
`RENTMATE_ADMIN_PHONE_E164` is optional. There is no public admin registration.

## Build and start

Local development/test retains the localhost API fallback. A production build must explicitly provide a safe HTTPS API
origin; it fails for a missing, HTTP, credentialed, wildcard, path-bearing, or local value:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "https://api.rentmate.example"
npm.cmd run build
npm.cmd --prefix backend run start
npm.cmd --prefix frontend run start
```

`NEXT_PUBLIC_API_BASE_URL` is public and baked into the frontend artifact. Rebuild the frontend when it changes.

## Production readiness commands

Start from [.env.production.example](.env.production.example), replacing placeholders only through protected deployment
configuration:

```powershell
# Offline configuration validation; does not prove deployment/connectivity
npm.cmd run deploy:validate

# Explicit live, non-mutating provider checks
npm.cmd run providers:check

# Explicit non-destructive HTTPS production smoke
npm.cmd run smoke:production
```

The provider command performs Cloudinary ping and one bounded Nominatim forward-geocode. Smoke checks frontend, health,
public privacy, role reads, secure cookie/CORS, login, and logout without mutating product data.

The existing [DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md) and
[RELEASE_CHECKLIST.md](docs/deployment/RELEASE_CHECKLIST.md) describe the retained compatibility-backend production
path. They are not the local graduation-demo startup instructions; use the local demo runbook for that purpose.
