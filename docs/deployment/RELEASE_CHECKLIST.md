# RentMate production release checklist

Leave unknown production values blank. A checked repository rehearsal is not a production sign-off.

## Release record

- Git commit SHA: ______________________________
- Release/tag: ______________________________
- Current migration version: ______________________________
- Target migration version: ______________________________
- Backup ID/location reference: ______________________________
- Frontend URL: ______________________________
- API URL: ______________________________
- Deployment time (UTC): ______________________________
- Operator: ______________________________
- Rollback owner: ______________________________
- Previous artifact/version: ______________________________
- Provider-check result/reference: ______________________________
- Smoke result/reference: ______________________________

## Pre-deploy

- [ ] RM-053/RM-054/release regression evidence is green for this commit.
- [ ] Target platform, same-site topology, domain, DNS, and TLS ownership are recorded.
- [ ] Frontend/API URLs are HTTPS and the frontend/API relationship is same-site.
- [ ] Database, provider, smoke-actor, backup, and rollback owners are available.
- [ ] No production secret is stored in Git, command history, build logs, or frontend-public variables.

## Production configuration validation

- [ ] Backend variables match `.env.production.example`; no placeholder/default development secret remains.
- [ ] `FRONTEND_ORIGIN` is the exact HTTPS frontend origin.
- [ ] `NEXT_PUBLIC_API_BASE_URL` is the exact non-local HTTPS API origin selected before frontend build.
- [ ] `COOKIE_SECURE=true`; JWT/image/search policy constants retain frozen values.
- [ ] `npm.cmd run deploy:validate` passes; evidence reference: ______________________________

## Backup

- [ ] Source database identity was verified before backup.
- [ ] Custom-format `pg_dump` completed with protected password handling.
- [ ] Backup exists outside the repository, has nonzero size, and is encrypted/protected.
- [ ] Backup ID/location, retention policy, restore owner, and restore access were recorded.
- [ ] Restore rehearsal result/reference: ______________________________

## Migration plan

- [ ] One migration operator is named; application startup will not run migrations.
- [ ] External current-version record is available and matches observed schema preconditions.
- [ ] Clean or existing mode was selected deliberately.
- [ ] `--plan-only` output was reviewed; selected versions: ______________________________
- [ ] Applied/shared migration files remain unchanged.

## Migration execution

- [ ] Approved migration command completed successfully.
- [ ] No concurrent migration owner or application startup executed migration SQL.
- [ ] External version record was not advanced before verification.

## Schema verification

- [ ] `npm.cmd run db:verify` passes with two enums, eight product tables, expected constraints/indexes, and seeds.
- [ ] External deployment record advanced only after successful verification.
- [ ] Verification evidence/reference: ______________________________

## Admin

- [ ] Controlled admin identity/owner is approved.
- [ ] `admin:provision` or clean bootstrap produced the expected created/no-op result.
- [ ] No public admin registration or password logging occurred.

## Providers

- [ ] Cloudinary non-mutating ping passes.
- [ ] One bounded Nominatim forward-geocode passes with identifying User-Agent.
- [ ] No provider secret/raw payload appears in evidence.
- [ ] Provider result/reference: ______________________________

## Build

- [ ] Missing/unsafe production API base is rejected.
- [ ] Frontend rebuilt with the approved `NEXT_PUBLIC_API_BASE_URL`.
- [ ] Backend/frontend production build, tests, typecheck, lint, and format check pass.
- [ ] Artifact identifiers/checksums: ______________________________

## Rollout

- [ ] Previous artifact/version is still available.
- [ ] Backend runs as one process for process-local MVP rate limits.
- [ ] Backend and frontend artifacts are started under the platform process manager.
- [ ] DNS/TLS and exact CORS origin resolve to the intended artifacts.

## Health

- [ ] Frontend root returns `200` and the RentMate marker.
- [ ] `GET /api/health` returns only the safe connected contract.
- [ ] Logs contain no credentials, cookies, JWTs, SQL, or stack traces exposed to clients.

## Smoke

- [ ] Known listing is currently `APPROVED` and its landlord active.
- [ ] Public collection/detail pass anonymous privacy projection checks.
- [ ] Tenant login, favorites read, and logout pass.
- [ ] Landlord login, owned listing read, and logout pass.
- [ ] Admin login, moderation queue read, and logout pass.
- [ ] Cookie is host-only, `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`.
- [ ] Credentialed CORS uses the exact frontend origin.
- [ ] No product data was mutated by smoke.

## Post-deploy

- [ ] Representative logs, database connections, provider status, and error rate were reviewed.
- [ ] Backup and release evidence are retained under the named owners.
- [ ] Smoke result/reference and deployment time are recorded in the release record.

## Rollback decision

- [ ] Continue release.
- [ ] Roll back application artifact only; schema is compatible.
- [ ] Restore backup into a new replacement DB, verify, then deliberately switch connection.
- Decision/reason: ______________________________

Never edit an applied migration, blind down-migrate, drop production schema, or restore over the source database.

## Sign-off

- Release operator/date: ______________________________
- Database/backup owner/date: ______________________________
- Security/provider owner/date: ______________________________
- Rollback owner/date: ______________________________
- Final production approval: ______________________________
