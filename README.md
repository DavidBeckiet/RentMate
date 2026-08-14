# RentMate

RentMate is a responsive, map-based monthly room-rental MVP for Ho Chi Minh City. It ships as a Next.js App Router
frontend, one Express/TypeScript modular monolith, and PostgreSQL accessed through parameterized `pg` queries. The four
backend business modules are `auth`, `users`, `listings`, and `favorites`; Cloudinary and Nominatim remain backend
integration clients.

Public users can search/filter approved listings in list/map/radius views and open privacy-safe detail. Tenants can
register, authenticate, view landlord contact on currently public detail, and manage favorites. Landlords can manage
profile, drafts, location, images, submission, and lifecycle. Admins can read moderation queues/history, perform the
four frozen moderation actions, and activate/deactivate tenant or landlord accounts.

## Prerequisites and setup

- Node.js 22.15.1 (`.nvmrc`)
- npm 10.9.2
- Docker Desktop with Docker Compose for local PostgreSQL

Run from the repository root:

```powershell
npm.cmd ci
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
Copy-Item .env.example .env
docker compose up -d postgres
npm.cmd run dev
```

The frontend is available at `http://localhost:3000` and the local API at `http://localhost:4000`.

## Session and API usage

All 31 product endpoints use `/api/v1`; health remains `GET /api/health`. Browser requests use
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
npm.cmd run test:rm053
npm.cmd run test:rm053:database
npm.cmd run test:rm054
npm.cmd run test:rm054:e2e
npm.cmd run test:rm055
```

RM-054 Playwright uses its dedicated disposable test database and local provider mocks. Normal unit tests and builds do
not call live Cloudinary, Nominatim, or production smoke targets.

## Database release commands

Migrations are immutable ordered SQL files `0001`–`0012`. Startup does not run them, and no migration bookkeeping table
exists.

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

Production topology, complete environment ownership, migration/backup/restore/rollback instructions, and operational
limits are in [DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md). Record each real release in
[RELEASE_CHECKLIST.md](docs/deployment/RELEASE_CHECKLIST.md). The MVP uses process-local in-memory rate limits, so the
documented production shape runs one backend process unless a future architecture change adds shared state.
