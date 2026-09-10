# RentMate deployment guide

> This document covers the retained compatibility-backend production path. For the current microservices graduation
> demo topology (Gateway `:4001` plus Identity, Listing, Engagement, Verification Delivery, and PostgreSQL), use
> [LOCAL_DEMO_RUNBOOK.md](LOCAL_DEMO_RUNBOOK.md). Do not use this guide to start the local demo.

This guide describes a platform-neutral production release. It does not select a hosting vendor, domain, database,
provider account, or backup operator. A successful configuration rehearsal is not evidence that production is
deployed.

## Production topology

```text
Browser
  -> HTTPS Next.js frontend
       -> HTTPS Express API
            -> PostgreSQL
       -> OpenStreetMap tiles and Cloudinary delivery URLs

Express API
  -> Cloudinary management API
  -> Nominatim forward-geocoding API
```

The frontend and API must be same-site. Supported shapes are one HTTPS host with reverse-proxied API traffic, or
separate frontend/API subdomains under the same registrable parent. Do not deploy them on unrelated sites without a
separate architecture review. Same-site does not require same-origin: different subdomains or ports are different
origins, so the backend still needs the exact frontend origin.

The `rentmate_session` cookie is host-only because `Domain` is omitted. It is `HttpOnly`, `Secure`, `SameSite=Lax`,
and `Path=/`. Browser API requests use `credentials: "include"`; frontend JavaScript never reads a JWT and there is no
Bearer-token browser workflow. Express allows credentialed CORS only for the exact `FRONTEND_ORIGIN`, never `*`, and
requires that exact `Origin` on `POST`, `PUT`, `PATCH`, and `DELETE` requests.

## Environment matrix

Populate deployment configuration through the platform configuration/secret store. `.env.production.example` is a
safe inventory, not a file to populate and commit.

| Variable | Component | Required | Classification | Validation or purpose | Owner |
|---|---|---:|---|---|---|
| `NODE_ENV` | Backend | Yes | Public config | Exactly `production` | Release operator |
| `PORT` | Backend | Yes | Public config | Integer 1–65535 | Platform operator |
| `FRONTEND_ORIGIN` | Backend | Yes | Public config | Exact HTTPS origin; no path/query/hash/credentials/wildcard | Release operator |
| `LOG_LEVEL` | Backend | Yes | Public config | `debug`, `info`, `warn`, or `error` | Operations owner |
| `DB_HOST` | Backend | Yes | Sensitive config | Hostname/IP only; no URL or credentials | Database owner |
| `DB_PORT` | Backend | Yes | Public config | Integer 1–65535 | Database owner |
| `DB_NAME` | Backend | Yes | Sensitive config | Production database name | Database owner |
| `DB_USER` | Backend | Yes | Sensitive config | Least-privilege application user | Database owner |
| `DB_PASSWORD` | Backend | Yes | Secret | Nonblank, non-placeholder, not development default | Database owner |
| `DB_POOL_MAX` | Backend | Yes | Public config | Integer 1–100 | Database owner |
| `DB_CONNECTION_TIMEOUT_MS` | Backend | Yes | Public config | Integer 1–60000 | Database owner |
| `DB_IDLE_TIMEOUT_MS` | Backend | Yes | Public config | Integer 1000–600000 | Database owner |
| `JWT_SECRET` | Backend | Yes | Secret | High entropy; non-placeholder; not development default | Security owner |
| `JWT_EXPIRES_IN_SECONDS` | Backend | Yes | Public policy | Exactly `7200` | Security owner |
| `BCRYPT_COST` | Backend | Yes | Public policy | Integer 4–31; production default `12` | Security owner |
| `COOKIE_SECURE` | Backend | Yes | Public policy | Exactly `true` | Security owner |
| `CLOUDINARY_CLOUD_NAME` | Backend | Yes | Sensitive config | Nonblank/non-placeholder | Provider owner |
| `CLOUDINARY_API_KEY` | Backend | Yes | Secret | Nonblank/non-placeholder | Provider owner |
| `CLOUDINARY_API_SECRET` | Backend | Yes | Secret | Nonblank/non-placeholder | Provider owner |
| `NOMINATIM_BASE_URL` | Backend | Yes | Public config | Absolute HTTPS base URL without credentials/query/hash | Provider owner |
| `NOMINATIM_USER_AGENT` | Backend | Yes | Public identity | Identifies RentMate and operator contact | Provider owner |
| `MAX_IMAGES_PER_LISTING` | Backend | Yes | Frozen policy | Exactly `8` | Release operator |
| `MAX_IMAGE_BYTES` | Backend | Yes | Frozen policy | Exactly `5242880` | Release operator |
| `DEPLOYMENT_REGION` | Backend | Yes | Frozen policy | Exactly `HO_CHI_MINH_CITY_VN` | Release operator |
| `MAX_SEARCH_RADIUS_KM` | Backend | Yes | Frozen policy | Exactly `50` | Release operator |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend build/smoke | Yes | Public config | Exact non-local HTTPS API origin; baked at build time | Release operator |
| `RENTMATE_ADMIN_EMAIL` | Provisioning | When provisioning | Sensitive input | Valid controlled admin email | Security owner |
| `RENTMATE_ADMIN_PASSWORD` | Provisioning | When provisioning | Secret | 8+ characters, at most 72 UTF-8 bytes | Security owner |
| `RENTMATE_ADMIN_PHONE_E164` | Provisioning | No | Sensitive input | Blank or E.164 phone | Security owner |
| `RENTMATE_SMOKE_TENANT_EMAIL` | Smoke | Yes | Sensitive input | Dedicated active tenant email | Smoke owner |
| `RENTMATE_SMOKE_TENANT_PASSWORD` | Smoke | Yes | Secret | Dedicated tenant password | Smoke owner |
| `RENTMATE_SMOKE_LANDLORD_EMAIL` | Smoke | Yes | Sensitive input | Dedicated active landlord email | Smoke owner |
| `RENTMATE_SMOKE_LANDLORD_PASSWORD` | Smoke | Yes | Secret | Dedicated landlord password | Smoke owner |
| `RENTMATE_SMOKE_ADMIN_EMAIL` | Smoke | Yes | Sensitive input | Dedicated active admin email | Smoke owner |
| `RENTMATE_SMOKE_ADMIN_PASSWORD` | Smoke | Yes | Secret | Dedicated admin password | Smoke owner |
| `RENTMATE_SMOKE_PUBLIC_LISTING_ID` | Smoke | Yes | Sensitive input | Positive ID of a known currently public listing | Smoke owner |
| `RENTMATE_PROVIDER_CHECK_ADDRESS` | Provider check | Yes | Public input | One 1–500 character HCMC address | Provider owner |

`TEST_DATABASE_URL` is test-only and must not be present in production runtime configuration.

## Install, validate, build, and start

Use the pinned Node.js/npm versions and immutable lockfiles:

```powershell
npm.cmd ci
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
```

Validate production configuration without connecting to PostgreSQL or providers:

```powershell
npm.cmd run deploy:validate
```

This checks configuration only. It does not prove DNS, TLS, database, provider, or application availability.

`NEXT_PUBLIC_API_BASE_URL` must be supplied when the frontend is built:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "https://api.rentmate.example"
npm.cmd run build
```

The value is public and baked into the Next.js artifact. Changing the API origin requires a frontend rebuild; changing
only the runtime environment after build does not rewrite the artifact.

Start the built deployment units under the platform process manager:

```powershell
npm.cmd --prefix backend run start
npm.cmd --prefix frontend run start
```

The MVP rate-limit stores are in-memory and process-local. Run exactly one backend process in production unless a
future architecture change introduces a shared limiter. Do not add Redis as an RM-055 workaround.

## API usage guidance

- Product routes use `/api/v1`; health is `GET /api/health`.
- Public search/detail require no session. Tenant, landlord, and admin endpoints enforce their documented roles.
- Browser requests use `credentials: "include"`; the host-only HttpOnly cookie carries the session.
- JavaScript must not read/store a JWT or construct a Bearer token.
- Unsafe methods send the exact configured frontend `Origin` and are rejected without it.
- Exact addresses/coordinates are owner/admin fields. Anonymous public detail remains privacy-safe; landlord contact is
  available only to an active tenant on a currently public detail.

## Migration release policy

Application startup never runs migrations. One named release operator owns migration execution. Applied migration
files are immutable, and the current deployed version lives in an external release record—not a ninth schema table.
Always create and record a verified backup before applying migration SQL.

### Fresh database

Verify that the target database is new and empty, then preview the repository plan:

```powershell
npm.cmd run migrate:clean -- --plan-only
```

Bootstrap the clean database using protected database/admin environment values:

```powershell
npm.cmd run db:bootstrap
npm.cmd run db:verify
```

`db:bootstrap` applies migrations `0001`–`0012`, reconciles the five property types and twelve amenities, verifies the
exact two-enum/eight-table schema, and provisions the controlled admin. There is no separate reseed command.

If admin provisioning must be repeated independently:

```powershell
npm.cmd run admin:provision
```

The same active admin is a no-op; an inactive admin or a tenant/landlord email is a safe failure. There is no public
admin registration. Never log or place `RENTMATE_ADMIN_PASSWORD` on a command line.

### Existing database

Record the currently applied migration version in an operator-owned JSON manifest outside the product schema. Preview:

```powershell
npm.cmd run migrate:existing -- --manifest <external-version-record.json> --plan-only
```

After backup approval, apply only newer migrations:

```powershell
npm.cmd run migrate:existing -- --manifest <external-version-record.json>
npm.cmd run db:verify
```

Advance the external version record only after migration and schema verification succeed. A manifest/schema
precondition mismatch stops the release; it is not permission to rerun old migrations or edit an applied SQL file.

## Backup and restore

Before migration, verify the source database identity and create a PostgreSQL custom-format backup outside the
repository. Supply the password through a protected `PGPASSFILE` or platform secret, never a command argument:

```powershell
pg_dump --host <db-host> --port <db-port> --username <backup-user> --dbname <source-db> `
  --format=custom --file <encrypted-external-path/release.backup>
```

Record the backup identifier, source database identity, nonzero size, encrypted storage location/reference, retention
policy, and restore owner in the release checklist.

Restore rehearsal and recovery always target a new empty replacement database, never the source:

```powershell
pg_restore --host <db-host> --port <db-port> --username <restore-user> --dbname <new-empty-db> `
  --exit-on-error --single-transaction --no-owner --no-acl <release.backup>
npm.cmd run db:verify
```

Run representative read/smoke checks against the replacement. Do not switch production traffic until schema and reads
pass and the rollback owner approves the deliberate connection change.

## Providers and smoke

Provider connectivity is an explicit network action, never startup/build/test behavior:

```powershell
npm.cmd run providers:check
```

Cloudinary uses authenticated non-mutating `api.ping()`. Nominatim performs exactly one bounded forward-geocode with
the configured identifying User-Agent, five-candidate cap, timeout, and no automatic retry. Output contains only
PASS/FAIL and candidate count, not credentials or raw provider payload.

After an actual HTTPS deployment exists, run the non-destructive production smoke:

```powershell
npm.cmd run smoke:production
```

It checks the frontend marker, health, public search/detail privacy, tenant favorites read, landlord listing read, admin
queue read, production cookie attributes, credentialed CORS, and logout. It performs no registration, listing/favorite/
moderation/activation/image mutation, and never decodes or prints the cookie.

## Rollback

- Before any schema change, stop rollout when validation, backup, provider, or plan checks fail.
- If the deployed schema remains application-compatible, roll back only to the recorded previous application artifact.
- If database restore is required, restore the pre-release backup into a new replacement database, run `db:verify` and
  representative reads, then deliberately switch the application connection after approval.
- Never edit an applied migration, blindly down-migrate, drop the production schema, or restore over the source DB.

Use [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) as the release evidence and sign-off record.
