# RentMate

RentMate is a responsive, map-based room-rental and roommate platform for Ho Chi Minh City. The current local/demo
architecture uses a Next.js App Router frontend, API Gateway, Identity, Listing, Engagement, Verification Delivery,
and PostgreSQL. The retained `backend/` tree is historical reference code and is not part of the active runtime. See
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
npm.cmd --prefix services/identity-service ci
npm.cmd --prefix services/listing-service ci
npm.cmd --prefix services/engagement-service ci
Copy-Item .env.example .env
docker compose -f docker-compose.microservices.yml up -d --build
npm.cmd run seed:dev
npm.cmd --prefix frontend run dev
```

The frontend is available at `http://localhost:3000`. Browser API traffic goes through the Gateway at
`http://localhost:4001`.

The Compose stack already owns port `4001`, so do not run `npm.cmd run dev` at the same time. To use the all-local-node
route instead, stop the Compose stack first and then run:

```powershell
npm.cmd run dev:microservices
```

See [LOCAL_DEMO_RUNBOOK.md](docs/deployment/LOCAL_DEMO_RUNBOOK.md) for the reproducible demo setup, accounts, health
checks, optional AI positioning, and safe shutdown procedure.

## Local observability and operational checks

The microservice Compose stack includes OpenTelemetry Collector, Jaeger, Prometheus, and Grafana. Services emit
distributed traces and bounded-cardinality HTTP metrics; JSON request logs include the propagated request ID and trace
context without cookies, tokens, message bodies, or query strings.

- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`
- Jaeger: `http://localhost:16686`

Generate representative traffic and run the operational checks from the repository root:

```powershell
npm.cmd run loadtest:public
npm.cmd run backup:local
npm.cmd run restore:rehearsal
```

The authenticated read load test requires process-local tenant credentials and never creates product records:

```powershell
$env:RENTMATE_TENANT_EMAIL = "<dedicated-test-tenant>"
$env:RENTMATE_TENANT_PASSWORD = "<dedicated-test-password>"
npm.cmd run loadtest:authenticated
```

See [ENTERPRISE_FOUNDATION.md](docs/operations/ENTERPRISE_FOUNDATION.md) for topology and verification,
[SLO_AND_ALERTING.md](docs/operations/SLO_AND_ALERTING.md) for service objectives, and
[DISASTER_RECOVERY_RUNBOOK.md](docs/operations/DISASTER_RECOVERY_RUNBOOK.md) before handling backup artifacts.

## Session and API usage

Product endpoints use `/api/v1`; health remains `GET /api/health`. Browser requests use
`credentials: "include"`. Authentication is the two-hour host-only HttpOnly `rentmate_session` cookie—frontend
JavaScript never reads/stores the JWT and does not use a Bearer token. Unsafe methods require the exact configured
`Origin`. Public, tenant, landlord, and admin routes retain the roles/privacy documented in
[API_SPECIFICATION.md](docs/api/API_SPECIFICATION.md).

## Tests and quality

```powershell
npm.cmd run test:active
npm.cmd run typecheck:frontend
npm.cmd run lint:frontend
npm.cmd run format:check
```

`test:active` verifies the current frontend, Gateway, Identity, Listing, Engagement, verification-delivery adapter, and
enterprise operational helpers. Historical `RM-*` application-isolation suites remain available through their focused
scripts but are not part of the active post-MVP release gate.

Historical compatibility-backend database suites remain available for archival verification only. They require a
disposable `rentmate_test*` database through process-local `TEST_DATABASE_URL`:

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

The microservices CI workflow also creates an isolated PostgreSQL volume, applies every active clean migration, starts
Identity, Listing, Engagement, and Gateway with Compose health gates, and runs `npm run verify:active-stack`. Failure
captures bounded service logs; cleanup always removes the disposable stack and its volumes.

The same gate uploads a write-once active release manifest containing the exact source revision, immutable IDs and
verified OCI labels for all five built images, plus SHA-256 evidence for lockfiles, container inputs, and all service
migrations. Operational review is documented in [RELEASE_EVIDENCE.md](docs/operations/RELEASE_EVIDENCE.md).

## Database release commands

Each active microservice keeps its own ordered migrations. Startup does not run migrations automatically.

```powershell
npm.cmd run migrate:clean:plan
npm.cmd run migrate:clean
```

For an existing deployment, provide one operator-owned version record for every service database:

```powershell
$env:IDENTITY_MIGRATION_MANIFEST = ".\identity-version.json"
$env:LISTING_MIGRATION_MANIFEST = ".\listing-version.json"
$env:ENGAGEMENT_MIGRATION_MANIFEST = ".\engagement-version.json"
npm.cmd run migrate:existing:plan
npm.cmd run migrate:existing
```

The orchestrator stops on the first failed service and never updates external version records. Provision the initial
admin directly in the active Identity database with protected environment values (never command-line arguments):

```powershell
$env:RENTMATE_ADMIN_EMAIL = "admin@rentmate.example"
$env:RENTMATE_ADMIN_PASSWORD = "<secret-from-approved-store>"
$env:RENTMATE_ADMIN_PHONE_E164 = "+84901234567" # optional
npm.cmd run admin:provision
```

Provisioning is transactional and idempotent for an existing active admin. It safely rejects an email already owned
by another role or an inactive admin. `legacy:admin:provision` remains only for the retained compatibility backend.

## Build and start

Local development/test retains the localhost API fallback. A production build must explicitly provide a safe HTTPS API
origin; it fails for a missing, HTTP, credentialed, wildcard, path-bearing, or local value:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "https://api.rentmate.example"
npm.cmd run build
npm.cmd --prefix frontend run start
```

`NEXT_PUBLIC_API_BASE_URL` is public and baked into the frontend artifact. Rebuild the frontend when it changes.

## Production readiness commands

Start from [.env.microservices.production.example](.env.microservices.production.example), replacing placeholders only
through protected deployment configuration:

```powershell
# Offline configuration validation; does not prove deployment/connectivity
npm.cmd run deploy:validate

# Explicit non-destructive HTTPS smoke through the active Gateway
npm.cmd run smoke:production
```

Validation rejects local/non-HTTPS origins, insecure cookies, placeholders, short/shared secrets, mismatched image and
release tags, invalid source revisions, local release labels, and partial Google OAuth configuration without making
external requests. Smoke checks the frontend marker, Gateway
health, request-ID propagation, public collection envelope, and credentialed CORS. With the six dedicated smoke
credentials configured, it also logs in as tenant, landlord, and admin; validates each role's protected collection;
checks the secure host-only session-cookie contract; and logs out each isolated session. It performs no product writes.
Production configuration sets `RENTMATE_SMOKE_REQUIRE_AUTHENTICATED=true`, so missing role credentials fail closed. Set
`RENTMATE_SMOKE_PUBLIC_LISTING_ID` to include one public-detail read. Local smoke requires the explicit
`RENTMATE_SMOKE_ALLOW_LOCAL=true` opt-in.

The existing [DEPLOYMENT.md](docs/deployment/DEPLOYMENT.md) and
[RELEASE_CHECKLIST.md](docs/deployment/RELEASE_CHECKLIST.md) describe the retained compatibility-backend production
path. Their commands are historical and use the `legacy:` namespace where still exposed. They are not active
microservice deployment instructions.
