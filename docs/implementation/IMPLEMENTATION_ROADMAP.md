# RentMate MVP Implementation Roadmap

## 1. Purpose

This roadmap converts the frozen RentMate MVP requirements, architecture, database design, and API contract into an executable implementation sequence for one student developer over approximately eight weeks.

It is the authoritative implementation-order document. Later implementation work should select one task ID, implement only that bounded task, run its required checks, and stop without reopening product, schema, API, lifecycle, privacy, or architecture decisions.

Source-of-truth documents:

- `docs/requirements/REQUIREMENTS.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/database/DATABASE_DESIGN.md`
- `docs/api/API_SPECIFICATION.md`

The compatibility review is accepted as final: all 31 `/api/v1` endpoints and the separate health endpoint are compatible with exactly eight tables, and no schema or API changes are required.

## 2. Frozen implementation assumptions

- Architecture: one Next.js App Router frontend, one Express/TypeScript modular monolith, and one PostgreSQL database.
- Backend modules: exactly `auth`, `users`, `listings`, and `favorites`. Search, images, and moderation remain within `listings`.
- Persistence: direct parameterized SQL through `pg`; no ORM and no PostGIS.
- Schema: exactly the enum types `user_role` and `listing_status`, and exactly eight tables: `users`, `property_types`, `amenities`, `listings`, `listing_images`, `listing_amenities`, `favorites`, and `moderation_history`.
- API: exactly 31 versioned endpoints under `/api/v1`, plus unversioned `GET /api/health`.
- Authentication: bcrypt password hashes and a two-hour JWT in the host-only HttpOnly `rentmate_session` cookie. There are no refresh tokens or server-side session rows.
- Browser security: `SameSite=Lax`, production `Secure`, exact credential-aware CORS, and allowed-`Origin` validation on every unsafe method.
- Lifecycle: the frozen Option C state machine and significant-edit matrix are implemented exactly as specified.
- Visibility: public data requires an `APPROVED` listing and an active owning landlord.
- Privacy: exact address and coordinates remain owner/admin data; public coordinates are derived by deterministic three-decimal rounding. Landlord contact appears only for an active tenant on a public listing detail.
- Search: the one public listing collection handles browse, filters, map bounds, and radius. Radius uses a TypeScript bounding box and one PostgreSQL Haversine implementation with Earth radius `6371.0088 km`.
- Images: backend-mediated Cloudinary operations, at most eight 5 MiB JPEG/PNG/WebP images, and no atomic replacement endpoint.
- Geocoding: explicit backend-only Nominatim forward geocoding; no autocomplete, reverse geocoding, background geocoding, or separate cache.
- Audit/retention: moderation history is append-only. An owned listing can be hard-deleted only while `DRAFT` and only when it has no moderation history.
- Testing is incremental. A practical implementation stack is Vitest for TypeScript unit/service tests, Supertest for backend HTTP integration, a disposable PostgreSQL test database for constraint/transaction tests, Testing Library for frontend behavior, and Playwright for a small set of critical browser flows. These are development tools, not runtime architecture.
- The target folder structures in the frozen architecture are created only as implementation needs them; empty abstraction layers are not created.

## 3. Phase overview

| Phase | Default schedule | Primary outcome | Size |
|---|---|---|---|
| 0. Repository and development baseline | Week 1 | Reproducible skeleton with observability, errors, health, and test runner | Medium |
| 1. PostgreSQL migrations and seed data | Week 1 | Deterministic eight-table database from a clean PostgreSQL instance | Large |
| 2. Backend shared foundation | Week 1 | Shared HTTP, database, validation, auth, and DTO foundations | Large |
| 3. Authentication and users | Week 2 | Complete account/session/profile API | Large |
| 4. Lookups and listing draft foundation | Week 2 | Controlled lookups and owner draft read/create flows | Large |
| 5. Listing editing and lifecycle | Week 3 | Complete landlord lifecycle and concurrency rules | Large |
| 6. Listing images and Cloudinary | Week 4 | Complete image workflow and provider compensation | Large |
| 7. Forward geocoding | Week 4 | Explicit, throttled Nominatim workflow | Medium |
| 8. Public listing discovery | Week 5 | Unified public search, map/radius results, and public detail | Large |
| 9. Favorites | Week 5 | Visibility-aware tenant favorite API | Medium |
| 10. Admin moderation and user management | Week 6 | Moderation audit workflow and account activation | Large |
| 11. Frontend foundation | Week 6 | App shell, API/auth infrastructure, forms, and client-only map base | Large |
| 12. Frontend actor workflows | Week 7 | Public, tenant, landlord, and admin user journeys | Large |
| 13. Verification and integration testing | Week 8 | Cross-cutting acceptance and regression evidence | Large |
| 14. Deployment and final documentation | Week 8 | Deployable, documented MVP with production checks | Medium |

The schedule is a default sequence, not an hour estimate. Each phase includes tests rather than postponing all verification to Phase 13.

## 4. Detailed phases

### Phase 0 — Repository and development baseline

1. **Objective:** Make the existing frontend/backend skeleton reproducible and ready for incremental, observable, testable implementation.
2. **Scope:** Audit the skeleton; align TypeScript, linting, formatting, environment loading, local PostgreSQL, startup/shutdown, structured logging, request IDs, centralized errors, health, and test runners.
3. **Preconditions:** Frozen specifications are present; npm, Docker Desktop, and Docker Compose are available. Use the Node.js version already pinned by the repository, if present. If no version is pinned, RM-001 selects and documents one supported LTS version. Frontend and backend use the same documented development baseline unless an existing project constraint requires otherwise.
4. **Planned files/directories:** Root and package scripts/configuration; `.env.example`; `docker-compose.yml`; `backend/src/{app.ts,server.ts,config,db,shared}`; backend/frontend test configuration and test directories. Existing files are extended rather than replaced without review.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-001 | Audit and normalize repository tooling, scripts, strict TypeScript, frontend linting, formatting rules, and documented local commands. | Root README/config; both `package.json` and TypeScript/lint/format configs | Architecture §§2, 24–25; Requirements §5 | None | Clean installs can run typecheck, lint, format-check, build, and documented dev commands without product code. |
| RM-002 | Establish environment parsing, PostgreSQL-only Compose workflow, backend startup/graceful shutdown, structured console logging, request IDs, centralized unexpected-error handling, and preserve the specified health response. | `backend/src/config`, `db`, `shared/logging`, `shared/middleware`, `app.ts`, `server.ts`; `.env.example` | Architecture §§8, 21–23; API Health, §§6, 20 | RM-001 | Startup validates baseline configuration, shutdown closes the server/pool, every request has an ID, errors are sanitized, and health returns the frozen `200`/`503` shapes. |
| RM-003 | Add incremental test foundations and one smoke test per application without implementing product behavior. | Backend Vitest/Supertest config; frontend Vitest/Testing Library config; test helpers/scripts | Requirements §5 Reliability/Maintainability; API §§5–6 | RM-001, RM-002 | Unit and HTTP/component smoke tests run deterministically, and backend tests can target a disposable PostgreSQL database without using development data. |

6. **Backend tasks:** RM-002 and the backend portion of RM-003.
7. **Frontend tasks:** Tooling, lint/typecheck, and a minimal test-render baseline only; no application pages.
8. **Database tasks:** Verify local PostgreSQL connectivity and test-database isolation only; do not define product schema in this phase.
9. **Endpoints covered:** Separate `GET /api/health` only.
10. **Transaction/concurrency concerns:** Pool shutdown must not interrupt accepted requests; tests must never share mutable development database state.
11. **Security/privacy concerns:** Environment secrets stay uncommitted; logs and health omit credentials, SQL, stack traces, cookies, JWTs, and contact data.
12. **Tests required:** Health `200`, database-unavailable `503`, request-ID propagation, sanitized unexpected error, graceful shutdown helper, and frontend smoke render.
13. **Acceptance criteria:** A new developer can copy `.env.example`, start PostgreSQL, run both apps, call health, and run all baseline checks using documented commands.
14. **Explicitly out of scope:** Product migrations, authentication, product routes, provider clients, actor pages, and containerizing frontend/backend.
15. **Dependencies and size:** No earlier phase; **Medium**.

### Phase 1 — PostgreSQL migrations and seed data

1. **Objective:** Produce a deterministic, versioned translation of Database Design v1 with no schema decisions left to later repository work.
2. **Scope:** Migration runner/conventions, enum types, all eight tables, constraints, foreign keys, indexes, controlled lookup seeds, and controlled admin provisioning.
3. **Preconditions:** Phase 0 database/test baseline is operational.
4. **Planned files/directories:** `backend/migrations/` ordered SQL files; a narrowly scoped migration runner/script; seed files or scripts for lookup data and controlled admin provisioning; migration integration tests.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-004 | Implement deterministic migration discovery/execution without a database bookkeeping table, plus documented clean-database, existing-deployment, mismatch-detection, and rollback policies. | `backend/migrations`; migration runner and package scripts | Architecture §24; Database §§1–3, 33 | RM-003 | Clean databases run all files once in lexical/version order; existing deployments select only files newer than the externally recorded version; schema-precondition mismatches and partial failures stop clearly; shared migrations are immutable. |
| RM-005 | Add enum and foundational catalog/account migrations plus idempotent property-type and amenity seeds. | Early ordered migration/seed files | Database §§4, 6.1–6.3, 10–13 | RM-004 | `user_role`, `listing_status`, `users`, `property_types`, and `amenities` exactly match the frozen types, columns, constraints, and initial rows. |
| RM-006 | Add listing core, image, and amenity-junction migrations with all frozen checks and foreign keys. | Middle ordered migration files | Database §§6.4–6.6, 14, 18–20 | RM-005 | `listings`, `listing_images`, and `listing_amenities` exactly match the specification, including deferrable image order and non-draft scalar completeness. |
| RM-007 | Add favorites, moderation history, and the exact explicit index set. | Later ordered migration files | Database §§6.7–6.8, 21–22, 28–32 | RM-006 | `favorites` and `moderation_history` plus only the approved explicit indexes exist, with the specified cascade/restrict behavior. |
| RM-008 | Add controlled admin seed/provisioning strategy and full clean-build/constraint verification. | Seed/provision command; database integration tests; setup docs | Architecture §10; Database §§4.1, 29–31; API §3.1 | RM-007 | Admin creation is unavailable through public data paths, passwords are bcrypt hashes, lookup seeds are repeat-safe, and a clean database reproduces exactly two enums/eight tables. |

6. **Backend tasks:** Migration runner and controlled seed command only; no repositories or endpoints.
7. **Frontend tasks:** None.
8. **Database tasks:** All work in this phase. Ordering is detailed in Section 7 of this roadmap.
9. **Endpoints covered:** None directly; schema prerequisites for all product endpoints.
10. **Transaction/concurrency concerns:** Each migration is atomic where PostgreSQL permits; concurrent application startup must not be the migration mechanism; seed upserts must not overwrite retired lookup state unexpectedly.
11. **Security/privacy concerns:** Admin seed password enters through protected environment/input and is never committed or logged; production database credentials remain backend-only.
12. **Tests required:** Clean database rebuild, deterministic ordering, explicit migration selection from an external version manifest, per-migration transaction/failure behavior, partial-failure detection, deployment-record/schema-precondition mismatch detection where practical, repeat-safe lookup seeds, enum/check/unique/FK and cascade/restrict behavior, deferrable image order, partial indexes, and exact final schema inventory.
13. **Acceptance criteria:** An empty PostgreSQL database becomes the exact frozen schema and seed set using one documented command; no ninth table or unapproved column/index appears.
14. **Explicitly out of scope:** ORM metadata, migration bookkeeping tables, session tables, PostGIS, application repositories, and runtime feature data.
15. **Dependencies and size:** Depends on Phase 0; **Large**.

### Phase 2 — Backend shared foundation

1. **Objective:** Provide the reusable database and HTTP controls required by all modules without generic base-class abstractions.
2. **Scope:** Production configuration validation, pool/transaction helper, repository conventions, errors/envelopes, validation, cookie parsing, CORS/Origin controls, rate-limit foundations, authentication/role/optional-auth middleware, and DTO mapping rules.
3. **Preconditions:** Phases 0–1; migrated disposable test database.
4. **Planned files/directories:** `backend/src/config`, `db`, `shared/{errors,middleware,validation,logging,http,types}`, plus focused shared tests.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-009 | Finalize production configuration validation, shared `pg` pool conventions, checked-out-client transaction helper, parameterized repository primitives, numeric/timestamp mapping rules. | `config`, `db`, shared repository types/helpers | Architecture §§8, 22; Database §§3, 26–27, 31; API §23 | RM-008 | Missing production config fails at startup; transactions use one client through commit/rollback; numeric mappings are explicit and tested. |
| RM-010 | Implement application error classes, frozen status/code mapping, success/error envelopes, malformed-body handling, request validation helpers, query/path parsing, and unknown-field rejection. | `shared/errors`, `shared/http`, `shared/validation`, error middleware | Architecture §21; API §§5–6, 13 | RM-009 | Handlers can return frozen object/pagination/204 shapes and consistent sanitized errors with request IDs. |
| RM-011 | Implement cookie parsing, exact credential-aware CORS, and allowed-`Origin` validation for every unsafe method. | `shared/middleware`; app wiring; security tests | Architecture §11; API §§3.3, 4, 5.1, 20 | RM-010 | Cross-origin development supports credentials only from configured frontend; unsafe missing/invalid Origin returns `403`; safe requests remain usable. |
| RM-012 | Implement reusable rate-limit foundations plus protected authentication, role enforcement, and public optional-auth middleware with current account activity checks. | `shared/middleware`; auth-facing interfaces; rate-limit helper | Architecture §10; API §§3.5, 4, 17, 20 | RM-009–RM-011 | Protected invalid/inactive sessions return `401`, wrong roles return `403`, and optional invalid/inactive sessions remain anonymous. |
| RM-013 | Define explicit database/application/API DTO boundaries and shared mapper/test-fixture conventions; verify middleware ordering in an integration harness. | Shared types/mappers/test helpers; `app.ts` | Architecture §§7, 12; API §§8–9, 23 | RM-010–RM-012 | No raw row is directly serializable as an API DTO; middleware order matches the frozen disclosure order; no base controller/service/repository framework is added. |

6. **Backend tasks:** RM-009 through RM-013.
7. **Frontend tasks:** None.
8. **Database tasks:** Transaction-test fixtures only; no schema changes.
9. **Endpoints covered:** Shared behavior for all versioned endpoints; no product endpoint is completed here.
10. **Transaction/concurrency concerns:** Transaction helper always releases clients and rolls back on failure; application code cannot accidentally issue transactional statements through the global pool.
11. **Security/privacy concerns:** Authentication rechecks `users.is_active`; optional auth never leaks enrichment; Origin precedes mutation; DTO mapping and logging default to omission of secrets/private fields.
12. **Tests required:** Transaction commit/rollback/client release; numeric mapping; malformed/unknown input; envelope/status mapping; CORS credentials; safe/unsafe Origin matrix; missing/invalid/expired/inactive auth; wrong roles; optional-auth fallback.
13. **Acceptance criteria:** Later modules can implement endpoints using stable, tested shared controls with no HTTP or security policy duplicated in repositories.
14. **Explicitly out of scope:** Auth endpoint business logic, module repositories, refresh/session storage, generic DI, and provider clients.
15. **Dependencies and size:** Depends on Phases 0–1; **Large**.

### Phase 3 — Authentication and users

1. **Objective:** Complete public tenant/landlord account creation, cookie authentication, and current-user profile behavior.
2. **Scope:** bcrypt, JWT issue/verify, registration auto-login, login/logout, activity checks, current profile reads, phone update, and immutable/protected account fields.
3. **Preconditions:** Shared middleware/database foundations and migrated `users`.
4. **Planned files/directories:** `backend/src/modules/auth` and `backend/src/modules/users` route/controller/service/repository/validation files as justified; focused test fixtures and integration tests.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-014 | Implement password validation/hashing/verification, two-hour minimal-claim JWT handling, and exact `rentmate_session` set/clear helpers. | `modules/auth`; cookie/JWT configuration | Architecture §§10–11; API §§3.2–3.3 | RM-012 | Passwords respect 8 characters/72 UTF-8 bytes, JWT claims are minimal, and cookie attributes exactly match environment rules. |
| RM-015 | Implement tenant and landlord registration with email normalization, role fixation, phone rules, duplicate conflict, committed insert, and auto-login. | Auth routes/controller/service/repository/validators | API V1-01, V1-02; Database §6.1 | RM-014 | Both registration endpoints return `201` profile envelopes and session cookies; public callers cannot choose or create `ADMIN`. |
| RM-016 | Implement login and idempotent logout, including generic invalid-credential behavior and inactive-account rejection. | Auth login/logout handlers and tests | API V1-03, V1-04; Architecture §10 | RM-014, RM-015 | Valid login replaces the two-hour cookie; invalid email/password/inactive account all use `401 INVALID_CREDENTIALS`; logout always clears and returns `204`. |
| RM-017 | Implement current-user retrieval and normalized phone-only update with role-specific nullability, protected-field rejection, and no-op timestamps. | `modules/users` routes/controller/service/repository/validators | API V1-05, V1-06; Database §6.1 | RM-015, RM-016 | Active users can read their profile and update only allowed phone data; email is immutable and unchanged phone leaves `updatedAt` untouched. |
| RM-018 | Complete auth/users unit, service, database, and HTTP contract tests. | Auth/users test suites and fixtures | Requirements §§3–4; API §§3–6 and V1-01–V1-06 | RM-014–RM-017 | Tests cover password byte limits, duplicate email races, inactive accounts, wrong roles, Origin, cookie attributes, unknown fields, privacy, auto-login, and no-op profile PATCH. |

6. **Backend tasks:** RM-014 through RM-018.
7. **Frontend tasks:** None; actor forms wait for Phase 11/12.
8. **Database tasks:** Use `users` only; no migration changes. Duplicate email is resolved through the unique constraint and mapped to `409`.
9. **Endpoints covered:** V1-01 through V1-06.
10. **Transaction/concurrency concerns:** Registration commits before cookie issuance; concurrent duplicate registration converges to one user and one `409`; no-op profile update performs no timestamp write.
11. **Security/privacy concerns:** Never return/log password, hash, token, or cookie; generic login failure avoids email enumeration; protected requests recheck current activity; role/email/isActive are immutable through self-profile APIs.
12. **Tests required:** RM-018 plus bcrypt non-plaintext persistence, JWT expiry/claims, host-only cookie (no `Domain`), production/development Secure behavior, and logout with absent/invalid cookie.
13. **Acceptance criteria:** All six auth/users endpoints match their status, envelope, cookie, validation, authorization, and privacy contracts.
14. **Explicitly out of scope:** Password reset, email change, social login, refresh tokens, sessions, public admin registration, frontend pages, and admin activation.
15. **Dependencies and size:** Depends on Phases 1–2; **Large**.

### Phase 4 — Lookups and listing draft foundation

1. **Objective:** Establish controlled-value reads and the landlord-owned draft create/read foundation required by lifecycle and image work.
2. **Scope:** Active lookup collections, draft creation, owner listing collection/detail, nullable draft DTOs, code resolution, initial amenity assignment, and current-reason projection plumbing.
3. **Preconditions:** Auth/role enforcement works; catalog and listing tables are migrated and seeded.
4. **Planned files/directories:** `backend/src/modules/listings` route/controller/service/repository/validation/DTO files; listing test builders and database/HTTP tests.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-019 | Implement public active property-type and amenity lookup repositories and endpoints with stable ordering and narrow DTOs. | Listings lookup route/handler/repository/mapper | API V1-07, V1-08; Database §§6.2–6.3, 17 | RM-013 | Endpoints return only active values ordered by label/code and reject undocumented query/body data. |
| RM-020 | Implement landlord draft creation with subset/null handling, active controlled-code resolution, coordinate-pair validation, duplicate amenity rejection, and atomic initial amenity insert. | Listing create route/controller/service/repository/validator | API V1-11; Database §§6.4, 6.6, 19 | RM-018, RM-019 | Active landlords can create `{}` or partial `DRAFT`s; listing and amenities commit together and return exact owner detail. |
| RM-021 | Implement owner-scoped listing collection and detail, including nullable fields, exact owner coordinates/address, owner image DTO shape, and latest applicable moderation reason lookup. | Owner read routes/service/repository/mappers | API V1-12, V1-13; Database §§22–23 | RM-020 | Results are scoped to authenticated landlord, ordered/paginated as frozen, and non-owner/missing IDs use owner-scoped `404`. |
| RM-022 | Add lookup/draft read-create tests across validation, ownership, mapping, pagination, and transaction rollback. | Listings tests/fixtures | API §§5, 8.9–8.10, 13 and V1-07–V1-13 | RM-019–RM-021 | Tests prove nullable draft behavior, active-code selection, atomic amenities, no private cross-owner disclosure, no N+1 owner read, and exact response shapes. |

6. **Backend tasks:** RM-019 through RM-022.
7. **Frontend tasks:** None.
8. **Database tasks:** Read catalog rows; insert `listings` and `listing_amenities` atomically. No schema changes.
9. **Endpoints covered:** V1-07, V1-08, V1-11, V1-12, V1-13.
10. **Transaction/concurrency concerns:** Draft and initial amenity relationships are one transaction; owner queries use stable `updatedAt DESC, id DESC`; limit-plus-one determines `hasNextPage`.
11. **Security/privacy concerns:** Active landlord role precedes owner lookup; owner detail may contain exact location but never Cloudinary public IDs or another landlord’s resources.
12. **Tests required:** Active-only lookup behavior, retired-value omission, `{}` draft, partial/null draft, coordinate pair, code/duplicate/unknown-field errors, insert rollback, owner `404`, pagination, and DTO privacy.
13. **Acceptance criteria:** All five endpoints conform, and later lifecycle/image services can lock and operate on a reliable owner listing aggregate.
14. **Explicitly out of scope:** PATCH, lifecycle actions, hard deletion, uploads, public discovery, favorites, moderation mutations, and frontend.
15. **Dependencies and size:** Depends on Phases 1–3; **Large**.

### Phase 5 — Listing editing and lifecycle

1. **Objective:** Implement every landlord content mutation and frozen lifecycle transition with consistent locking, no-op behavior, and moderation-history retention.
2. **Scope:** PATCH, amenity replacement, significant-edit policy, current moderation reason, submission, deactivate/reactivate, hard-delete database eligibility/cascades, state conflicts, and an internal post-commit provider-cleanup handoff for draft deletion.
3. **Preconditions:** Owner draft aggregate and shared transaction/error controls exist.
4. **Planned files/directories:** Listings lifecycle policy/helper, mutation repositories/services/controllers/routes/validators; lifecycle and concurrency test suites.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-023 | Implement listing PATCH normalization, resulting-state validation, coordinate-pair handling, order-insensitive amenity comparison/replacement, active new-code resolution, and true no-op detection. | Listing mutation validator/service/repository | Architecture §14; API V1-14, §§10, 13 | RM-022 | Real scalar/set changes commit atomically; normalized no-ops perform no content, status, amenity, or `updatedAt` write. |
| RM-024 | Centralize the exact significant-edit matrix and latest `REJECTED`/`HIDDEN` reason projection for all current/future content mutations. | Listings lifecycle policy and reason repository/mappers | Architecture §§13–15; Database §§18, 22; API §10 | RM-023 | All six source states map exactly as frozen, and current reasons use `createdAt DESC, id DESC` without exposing history publicly. |
| RM-025 | Implement explicit `DRAFT/HIDDEN -> PENDING` submission with row lock, scalar completeness, persisted-image minimum, and known-retired lookup retention. | Submit route/service/repository | API V1-16; Database §§17, 19–20, 31 | RM-024 | Both allowed transitions succeed only for complete listings with an image; unknown references fail; repeated/stale submission returns `409`. |
| RM-026 | Implement `APPROVED -> INACTIVE` deactivation and unchanged `INACTIVE -> APPROVED` reactivation using the shared listing lock and expected state. | Lifecycle action routes/service/repository | API V1-17, V1-18; Architecture §13 | RM-024 | Each legal action changes status/`updatedAt` once; repeats and invalid source states return `409`. |
| RM-027 | Implement hard-delete eligibility with an owned listing lock, required `DRAFT` state, no-moderation-history check, capture of Cloudinary public IDs before deletion, database deletion/child cascades, and an internal post-commit cleanup handoff for later wiring. | Listing delete route/service/repository and cleanup interface | API V1-15; Database §§22, 28, 31 | RM-024 | Database-side eligibility, locking, retention, ID capture, deletion, cascades, and handoff are tested; eligible deletion returns `204` and ineligible deletion returns the frozen errors, but provider cleanup is not yet operational until RM-029. |
| RM-028 | Complete exhaustive lifecycle, ownership, validation, rollback, and stale/concurrent-state tests. | Listing lifecycle unit/service/database/HTTP tests | Architecture §§13–15; API V1-14–V1-18 | RM-023–RM-027 | Every allowed and forbidden transition, every state’s significant-edit result, no-op PATCH, retired lookup rules, deletion restriction, lock conflict, and reason selection are proven. |

6. **Backend tasks:** RM-023 through RM-028.
7. **Frontend tasks:** None.
8. **Database tasks:** Transactional content/amenity/status writes and eligible cascaded deletion only; no schema changes.
9. **Endpoints covered:** V1-14, V1-16, V1-17, and V1-18 are completed here. RM-027 implements V1-15’s database-side behavior and cleanup handoff; V1-15 is complete only after RM-029 wires the Cloudinary cleanup operation.
10. **Transaction/concurrency concerns:** One checked-out client and listing `FOR UPDATE` lock cover content, amenities, status, and timestamp. Expected-state failures return `409`, never overwrite newer state. Hard deletion captures provider identifiers before commit and invokes only the internal post-commit handoff; Cloudinary execution is wired later by RM-029.
11. **Security/privacy concerns:** Role check precedes owner-scoped lookup; all protected/unknown fields are rejected; exact data remains owner/admin only; deletion cannot erase audit history.
12. **Tests required:** Matrix from each of `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `HIDDEN`, `INACTIVE`; all explicit transitions; hidden submit with no revision proof; inactive significant edit; coordinate null/result rules; amenity set no-op; lock/stale conflicts; rollback; hard-delete cases.
13. **Acceptance criteria:** Listing PATCH and lifecycle policies are correct and transactionally safe; submission is demonstrated with persisted-image database fixtures; hard-delete database eligibility, cascades, retention, and cleanup handoff are verified. The complete user-facing image-to-submit and provider-cleanup workflow is not claimed until Phase 6.
14. **Explicitly out of scope:** Generic status endpoint, revision snapshots, deletion of moderated listings/history, images, Cloudinary calls, public discovery, and frontend.
15. **Dependencies and size:** Depends on Phase 4; **Large**.

### Phase 6 — Listing images and Cloudinary

1. **Objective:** Implement all frozen image operations while preserving database/provider consistency and lifecycle invariants.
2. **Scope:** Cloudinary client, multipart upload, dual type detection, limits, display slots, deletion, reorder, lifecycle transitions, compensation, cleanup logging, and wiring Cloudinary deletion into RM-027’s post-commit hard-delete cleanup handoff.
3. **Preconditions:** Listing lifecycle policy and row-lock convention are complete.
4. **Planned files/directories:** `backend/src/integrations/cloudinary.client.ts`; listings image routes/controllers/services/repositories/validators/mappers; multipart/type-detection configuration; mocked-provider and database tests.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-029 | Implement the bounded Cloudinary client and one-image multipart upload, then wire Cloudinary asset deletion into RM-027’s post-commit hard-delete cleanup handoff. Upload includes declared/actual JPEG/PNG/WebP agreement, 5 MiB limit, preliminary and locked ownership/count checks, smallest-unused slot, and compensation. | Cloudinary client; upload middleware/route/service/repository; hard-delete cleanup wiring | Architecture §20; API V1-15, V1-19, §16.1 | RM-028 | Valid upload returns owner image `201`; count/type/size/provider errors map correctly; DB upload failure triggers best-effort provider removal. After this task, successful hard deletion attempts best-effort removal of captured Cloudinary assets, logs cleanup failure, preserves the committed `204`, and introduces no queue/worker. |
| RM-030 | Implement image deletion with nested owner scope, non-draft last-image protection, significant-edit status/timestamp transaction, then best-effort post-commit Cloudinary removal. | Image delete route/service/repository | API V1-20, §16.2; Database §20 | RM-029 | Metadata deletion/status change commit together; last image is protected outside `DRAFT`; provider cleanup failure is logged and response remains `204`. |
| RM-031 | Implement complete-set image reorder using deferred uniqueness, normalized relative-order comparison, 1-based final slots, changed-order timestamp, and no-op behavior. | Image order route/service/repository | API V1-21; Database §§6.5, 20, 31 | RM-029 | Exact current set reorders atomically; changed order updates listing timestamp only; same order does no writes; lifecycle never changes. |
| RM-032 | Complete image lifecycle, ordering, concurrency, provider-failure, and hard-delete cleanup-handoff tests, including the documented UI replacement sequences as acceptance scenarios. | Image unit/service/database/HTTP tests with Cloudinary mock | API V1-15, §§13.4, 16, 18–19; Architecture §20 | RM-029–RM-031 | Tests cover all six lifecycle source states for add/delete, slots/gaps/eight limit, last image, MIME mismatch, stale count/order, compensation, image and hard-delete cleanup logging, committed hard-delete success after cleanup failure, and no atomic replacement endpoint. |

6. **Backend tasks:** RM-029 through RM-032.
7. **Frontend tasks:** None; replacement behavior is tested/documented but UI comes later.
8. **Database tasks:** Transactional image metadata and listing status/timestamp mutations; deferred order uniqueness. No schema changes.
9. **Endpoints covered:** Completes V1-15 provider cleanup behavior begun in RM-027; implements V1-19, V1-20, and V1-21.
10. **Transaction/concurrency concerns:** Upload occurs before the DB transaction and is compensated on persistence failure; image and eligible-listing deletion commit before provider cleanup; all image operations share the listing lock with submission/lifecycle; reorder detects stale sets. Hard-delete cleanup runs through RM-027’s post-commit handoff and cannot reverse committed database deletion.
11. **Security/privacy concerns:** Validate actual bytes as well as MIME; enforce ownership twice around provider work; keep Cloudinary credentials/public IDs out of API output and logs.
12. **Tests required:** File count/size/type/signature, exact one file, alt text, slots/gaps, maximum eight, last-image rule, lifecycle matrix, reordered/no-op timestamps, foreign/missing image IDs, concurrent upload/delete/order, provider timeout/failure/compensation.
13. **Acceptance criteria:** All three image endpoints and provider consistency rules match the contract, including safe partial-failure behavior, and V1-15 now performs best-effort Cloudinary cleanup after committed eligible hard deletion.
14. **Explicitly out of scope:** Atomic replacement, direct browser signing/upload, local permanent files, background cleanup queue, image editing, and automated moderation.
15. **Dependencies and size:** Depends on Phase 5; **Large**.

### Phase 7 — Forward geocoding

1. **Objective:** Add the single explicit, landlord-only Nominatim forward-geocoding capability.
2. **Scope:** Client timeout/headers/result limit, normalized candidate DTO, endpoint validation, throttling, empty results, and provider error mapping.
3. **Preconditions:** Active landlord authentication, shared rate limiting/errors, and listing draft UI/API concepts exist.
4. **Planned files/directories:** `backend/src/integrations/nominatim.client.ts`; a listings-owned geocoding route/controller/service/validator; provider mock tests.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-033 | Implement Nominatim client and `POST /geocoding/forward` with explicit validated address, identifying headers, bounded timeout, maximum five normalized candidates, and per-user/provider throttling. | Nominatim client; geocoding route/service/validator | Architecture §§9, 19; API V1-22, §17 | RM-012, RM-020 | Active landlord requests return `200` with zero-to-five normalized candidates; timeout/provider/rate-limit failures map to `502`/`429`. |
| RM-034 | Add geocoding unit and HTTP integration tests for authentication, request discipline, normalization, empty/provider responses, timeout, headers, and throttling. | Nominatim mock/client/endpoint tests | Requirements §§3.2, 5 Reliability; API V1-22 | RM-033 | Tests prove explicit-only behavior and that raw provider fields, autocomplete, reverse geocoding, retries, and background calls are absent. |

6. **Backend tasks:** RM-033–RM-034.
7. **Frontend tasks:** None; explicit trigger and pin adjustment are scheduled in Phase 12.
8. **Database tasks:** None; candidates are not cached or persisted by this endpoint.
9. **Endpoints covered:** V1-22.
10. **Transaction/concurrency concerns:** No local transaction; each request may call the provider once and is not automatically retried.
11. **Security/privacy concerns:** Landlord-only active account, allowed Origin, no raw Nominatim response, identifying but non-secret headers, bounded address length, and no sensitive logging.
12. **Tests required:** Role/activity/Origin, blank/oversize/unknown fields, zero/five/truncated results, malformed provider items, timeout, non-2xx provider response, identifying headers, and rate limit.
13. **Acceptance criteria:** The endpoint behaves predictably during success, empty result, provider failure, and throttling without mutating listing data.
14. **Explicitly out of scope:** Autocomplete, reverse geocoding, address cache/table/API, background requests, automatic retry loops, and map UI.
15. **Dependencies and size:** Depends on Phases 2–4; scheduled after lifecycle/image foundation; **Medium**.

### Phase 8 — Public listing discovery

1. **Objective:** Deliver the one privacy-safe public listing collection and public detail contract for browse, list/map, filters, bounds, and radius.
2. **Scope:** Search validation, public visibility/projections, filters, ALL amenities, retired filter codes, bounds, HCMC radius scope, bounding box, PostgreSQL Haversine, sorting/pagination, aggregate loading, and optional active-tenant detail contact.
3. **Preconditions:** Listing lifecycle and images are stable; approved test fixtures and user activity rules exist.
4. **Planned files/directories:** Listings public search/detail routes/controllers/services/repositories/validators/DTO mappers; shared bounding-box/Haversine query implementation; performance and privacy tests.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-035 | Implement the complete unified search query validator and ordinary public browse/filter repository with literal visibility predicate, title/area-only text search, ranges, known retired codes, ALL amenities, deterministic non-radius sorting, and limit-plus-one pagination. | Public search validator/service/repository/mapper | Architecture §§12, 17; API V1-09, §§9, 11–13 | RM-028, RM-032 | Ordinary searches accept only frozen parameters, return narrow public summaries, omit totals/private data, and avoid N+1 image/amenity loading. |
| RM-036 | Extend the same collection for mutually exclusive map bounds and HCMC radius groups using TypeScript bounding boxes and one PostgreSQL Haversine calculation/filter/order. | Bounding-box helper; shared search repository SQL | Architecture §§16–18; Database §§23–25; API V1-09, §12 | RM-035 | Bounds and radius use exact stored coordinates, radius enforces configured 50 km maximum/scope, distance is calculated once, and output coordinates are rounded. |
| RM-037 | Implement public listing detail with the same public visibility predicate/projection and optional contact enrichment only for a valid currently active tenant. | Public detail route/service/repository/mapper | Architecture §12; API V1-10, §§3.5, 8.7–8.8, 9 | RM-035, RM-018 | Missing/non-public targets return `404`; anonymous/landlord/admin/invalid sessions get public data only; active tenants additionally get landlord email/phone. |
| RM-038 | Complete public discovery validation, Haversine, privacy, pagination, and query-shape tests using known coordinates and query-count assertions. | Public search/detail unit/database/HTTP tests | API V1-09–V1-10, §§11–13, 20–21 | RM-035–RM-037 | Tests prove visibility, every filter/group/sort, ALL amenities, retired filters, HCMC/radius limits, known distances, rounding, stable pages, no total/N+1, and every contact projection case. |

6. **Backend tasks:** RM-035 through RM-038.
7. **Frontend tasks:** None; list/map UI follows in Phase 12.
8. **Database tasks:** Read-only parameterized aggregate/bulk queries using frozen indexes and exact coordinates. No schema or extra search index.
9. **Endpoints covered:** V1-09 and V1-10.
10. **Transaction/concurrency concerns:** Read queries use a consistent visibility predicate; pagination has deterministic tie-breakers; no total-count race is introduced.
11. **Security/privacy concerns:** Public SQL avoids selecting `address_text`, exact output coordinates, landlord identity/contact, moderation data, image IDs/public IDs, and hashes. Exact coordinates are used only internally and rounded during authorized mapping.
12. **Tests required:** All query parameters and invalid combinations; inactive landlord; all non-public statuses; q/area limitations; filters and ALL semantics; bounds/radius exclusion; exact Haversine known pairs; sorting; page+1; map/list equivalence; optional-auth activity/role matrix; query count/privacy field assertions.
13. **Acceptance criteria:** The one collection serves browse/map/radius consistently and the detail route exposes contact only to the authorized tenant case.
14. **Explicitly out of scope:** Separate map/radius endpoints, exact public location/address, total count, PostGIS, full-text/trigram extensions, marker clustering, autocomplete, and public landlord identity.
15. **Dependencies and size:** Depends on Phases 3, 5, and 6; **Large**.

### Phase 9 — Favorites

1. **Objective:** Implement tenant favorite relationship semantics while preserving current public visibility and retained preference data.
2. **Scope:** Favorite collection, idempotent ensure-present/ensure-absent mutations, visibility checks, retained non-public rows, pagination, and public-only projections.
3. **Preconditions:** Tenant authentication and public listing summary/query primitives are complete.
4. **Planned files/directories:** `backend/src/modules/favorites` route/controller/service/repository/validation files and tests; reuse public listing summary mapping without importing private listing rows.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-039 | Implement favorite retrieval and idempotent PUT/DELETE with tenant role, add-time public visibility, removal without current visibility/existence requirement, retained hidden rows, and stable pagination. | Favorites module and listings public-summary interface | Database §§6.7, 21; API V1-23–V1-25 | RM-038 | The three endpoints match frozen status/idempotency rules; retrieval returns only currently public summaries ordered by favorite time/ID. |
| RM-040 | Add favorite service/database/HTTP tests for role, visibility changes, retention/reappearance, duplicate operations, privacy, and pagination. | Favorites tests/fixtures | Requirements §3.1; API V1-23–V1-25, §19 | RM-039 | Tests prove add `404` for non-public targets, repeated PUT/DELETE `204`, invisible retained rows, active-landlord filtering, and no contact/private fields. |

6. **Backend tasks:** RM-039–RM-040.
7. **Frontend tasks:** None; favorite controls/pages follow public UI in Phase 12.
8. **Database tasks:** Use the `favorites` composite key; hard-delete only the relationship on DELETE; no removal on listing status/account activity change.
9. **Endpoints covered:** V1-23, V1-24, V1-25.
10. **Transaction/concurrency concerns:** PUT uses conflict-safe insert semantics; DELETE converges even when absent or target listing is gone; stable retrieval uses limit-plus-one.
11. **Security/privacy concerns:** Active tenant only; add does not disclose non-public targets; retrieval reuses public-safe projection and never returns landlord contact.
12. **Tests required:** Authentication/role/Origin, malformed ID, public/non-public add, concurrent/repeated add, repeated remove, remove invisible/missing listing, retained/reappearing favorite, landlord activity, order/pagination, and projection.
13. **Acceptance criteria:** Favorite state converges exactly as requested and never bypasses public visibility or privacy.
14. **Explicitly out of scope:** Favorite notifications, folders, counts, ranking, deletion on visibility changes, and frontend.
15. **Dependencies and size:** Depends on Phases 3 and 8; **Medium**.

### Phase 10 — Admin moderation and user management

1. **Objective:** Complete admin listing review, append-only moderation, and tenant/landlord activation management.
2. **Scope:** Admin queue/detail/history, four moderation actions, reason rules, atomic audit writes, stale actions, admin user list, activation no-op, `ADMIN` target protection, and public visibility side effects.
3. **Preconditions:** Listing lifecycle, owner/admin DTOs, public visibility, and active-account middleware are established.
4. **Planned files/directories:** Admin routes/controllers/services/repositories/validators within `modules/listings` and `modules/users`; moderation/activation tests. No separate admin business module.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-041 | Implement admin listing queue/detail and paginated moderation-history reads with exact admin DTOs, default status filter, stable ordering, and latest/current data. | Listings admin read routes/service/repository/mappers | API V1-26–V1-28; Database §22 | RM-028, RM-032 | Active admins can retrieve the frozen moderation projections/history; non-admins cannot; secrets/provider IDs remain omitted. |
| RM-042 | Implement `APPROVE`, `REJECT`, `HIDE`, and `RESTORE` as one locked status/history transaction with action-specific reason rules and stale-state conflicts. | Listings moderation route/service/repository/validator | Architecture §15; Database §§6.8, 22, 31; API V1-29 | RM-041 | Each valid action returns exactly one `201` history item; any invalid/stale/failing action changes neither status nor history. |
| RM-043 | Implement admin user list and idempotent tenant/landlord activation update, including `ADMIN` target `403` and activity-driven visibility without listing/history writes. | Users admin routes/service/repository/validators | API V1-30, V1-31; Architecture §12 | RM-038, RM-018 | Admin list filters/order/pagination work; activation changes only `users`; existing JWTs lose protected access after deactivation. |
| RM-044 | Complete admin authorization, moderation atomicity/concurrency, history retention, activation, and visibility tests. | Admin listings/users unit/database/HTTP tests | API V1-26–V1-31, §§18–20 | RM-041–RM-043 | Tests prove all transitions/reasons, stale rollback, one history row, append-only behavior, target protection/no-op activation, JWT activity enforcement, and public/favorite disappearance/reappearance. |

6. **Backend tasks:** RM-041 through RM-044.
7. **Frontend tasks:** None; admin UI follows in Phase 12.
8. **Database tasks:** Read/write existing `users`, `listings`, and `moderation_history`; no schema changes or generalized audit data.
9. **Endpoints covered:** V1-26, V1-27, V1-28, V1-29, V1-30, V1-31.
10. **Transaction/concurrency concerns:** Moderation locks the listing and atomically updates status plus exactly one history row; stale expected state returns `409`. Activation locks/conditionally updates the target and treats unchanged state as a `200` no-op.
11. **Security/privacy concerns:** Active `ADMIN` only; passwords/hashes/provider IDs omitted; `ADMIN` activation forbidden; listing public visibility changes derive from owner activity rather than status mutation.
12. **Tests required:** Queue filters/default/order, detail/history projection, every action/source/reason combination, rollback fault injection, simultaneous moderation, history retention, user list filters, activation no-op, ADMIN target, inactive JWT, and landlord visibility effects.
13. **Acceptance criteria:** Admin API completes the frozen moderation/account-management scope with authoritative history and no privacy or concurrency gaps.
14. **Explicitly out of scope:** Admin registration/hierarchy, admin activation mutation, deleting users/history, generalized audit endpoints, dashboards/analytics, and frontend.
15. **Dependencies and size:** Depends on Phases 3, 5, 6, 8, and 9 visibility behavior; **Large**.

### Phase 11 — Frontend foundation

1. **Objective:** Create the shared Next.js infrastructure needed to implement actor workflows consistently without treating client routing as authorization.
2. **Scope:** App Router organization, layouts/navigation, API client, error conversion, auth state, UX guards, form conventions, shared UI, accessibility/responsiveness, and browser-only Leaflet base.
3. **Preconditions:** Backend contracts are implemented and integration-tested through Phase 10.
4. **Planned files/directories:** `frontend/app` route groups `(public)`, `(auth)`, `(tenant)`, `(landlord)`, `(admin)` as needed; `components/{ui,map}`; `features`; `lib/{api,auth}`; `types`; frontend tests.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-045 | Implement App Router shell, responsive accessible layout/navigation, shared typed API client with `credentials: "include"`, frozen envelope/error conversion, and current-user auth state/UX guards. | `app`, `components/ui`, `lib/api`, `lib/auth`, shared types/tests | Architecture §4; API §§3–6, 8 | RM-044 | Pages can call every backend method through one client, display normalized errors, and redirect/guard for UX while documentation/tests state backend is authoritative. |
| RM-046 | Implement reusable form/status/empty/loading/error primitives and a client-only Leaflet/OpenStreetMap base with visible attribution and controlled map events. | UI/form components; `components/map`; validation helpers/tests | Requirements §5 Usability; Architecture §§4, 9, 17 | RM-045 | Components support keyboard/responsive use; Leaflet never server-renders; map movement alone does not automatically trigger search. |

6. **Backend tasks:** None beyond using its frozen contract.
7. **Frontend tasks:** RM-045–RM-046.
8. **Database tasks:** None.
9. **Endpoints covered:** Client infrastructure can call all endpoints; current user uses V1-05 and logout uses V1-04 for auth state, but no complete actor workflow is claimed.
10. **Transaction/concurrency concerns:** UI disables duplicate non-idempotent submissions where practical and treats server responses/conflicts as authoritative; it does not simulate transactions client-side.
11. **Security/privacy concerns:** JWT is never read by JavaScript; API calls include credentials; frontend guards are UX only; error rendering avoids leaking raw bodies; map labels location as approximate.
12. **Tests required:** API envelope/204/error conversion, credential inclusion, auth loading/anonymous/role states, keyboard behavior, responsive smoke tests, Leaflet client-only load, attribution, and explicit map-search trigger.
13. **Acceptance criteria:** Actor pages can be built from stable shared primitives without duplicating API/cookie/error/map infrastructure.
14. **Explicitly out of scope:** Full actor workflows, storing JWTs, frontend authorization claims, Redux/global state framework, sophisticated design system, and advanced map behavior.
15. **Dependencies and size:** Depends on completed backend Phases 3–10; **Large**.

### Phase 12 — Frontend actor workflows

1. **Objective:** Deliver the complete responsive user journeys over the frozen backend without adding client-only product behavior.
2. **Scope:** Authentication, public/tenant discovery and favorites, landlord profile/listing/geocoding/image/lifecycle management, and admin moderation/user activation.
3. **Preconditions:** Phase 11 shared frontend infrastructure and corresponding backend endpoints.
4. **Planned files/directories:** Workflow pages/components/hooks under the existing App Router route groups and `features/{auth,listings,favorites}`; admin UI remains a route concern over listings/users rather than a fifth business module.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-047 | Build tenant/landlord registration and shared login/logout pages with role-appropriate phone rules, validation, auto-login navigation, and auth error states. | Auth route pages/components/tests | Requirements §§3.1–3.2, 4.1; API V1-01–V1-04 | RM-045, RM-018 | Registration/login/logout work in browser flows and never expose/store the JWT. |
| RM-048 | Build public search/list/map/filter/pagination and detail experiences using URL query state, explicit “Search this area,” radius/current-location input, approximate markers, and loading/empty/error states. | Public listing pages; search/map/filter components/tests | Requirements §3.1, §§4.5, 8; API V1-09–V1-10 | RM-046, RM-038 | List and map use the same response/query; all frozen filters/sorts/groups work; detail shows no private location and only authorized contact. |
| RM-049 | Add tenant favorite controls and favorites page with idempotent mutations, sign-in/role UX, current visibility behavior, and public-only cards. | Favorites feature/components/page/tests | Requirements §3.1; API V1-23–V1-25 | RM-048, RM-040 | Active tenants can add/remove/view saved public listings; non-public saved rows simply disappear from the returned page. |
| RM-050 | Build landlord profile and owned-listing dashboard/detail/draft editor with lookup loading, nullable progress, exact owner location, current moderation reason, PATCH/no-op feedback, submit/deactivate/reactivate/delete actions. | Landlord pages; listing editor/lifecycle components/tests | Requirements §3.2; API V1-05–V1-08, V1-11–V1-18 | RM-046, RM-028 | Landlord can complete the full non-image listing lifecycle and sees server-authoritative status/reason/conflict feedback. |
| RM-051 | Add explicit geocoding candidate selection/manual pin adjustment and image upload/delete/reorder/replacement UX, respecting count-dependent replacement order and no blind upload retry. | Landlord location/image components/tests | Architecture §§19–20; API V1-19–V1-22 | RM-050, RM-032, RM-034 | Draft data survives geocoding failure; pin can be adjusted; image limits/order/lifecycle feedback match backend; no atomic replacement is implied. |
| RM-052 | Build admin login entry, moderation queue/detail/history/actions with reason forms, and user filtering/tenant-landlord activation management. | Admin route pages/components/tests | Requirements §3.3; API V1-03, V1-26–V1-31 | RM-045, RM-044 | Admin can demonstrate all four moderation actions and allowed activation changes, with conflict/error refresh behavior and no ADMIN mutation control. |

6. **Backend tasks:** None; defects that contradict frozen contracts return to their owning backend task rather than being patched with client workarounds.
7. **Frontend tasks:** RM-047 through RM-052.
8. **Database tasks:** None.
9. **Endpoints covered:** All 31 versioned endpoints are exercised by at least one frontend or administration flow where applicable; health remains operational monitoring rather than an actor feature.
10. **Transaction/concurrency concerns:** Non-idempotent actions show pending state and avoid blind retries; `409` triggers clear refresh/review guidance; upload replacement uses the frozen separate-request ordering.
11. **Security/privacy concerns:** No JWT/browser storage; no frontend-only authorization claims; anonymous cards/map/favorites omit contact; exact location appears only in landlord/admin screens; admin and owner routes tolerate backend `401/403/404`.
12. **Tests required:** Component tests for validation/state/error branches and focused browser flows for auth, public search/detail, favorites, landlord draft-to-submit including images/geocoding, lifecycle conflict, admin moderation, and activation.
13. **Acceptance criteria:** Tenant/public, landlord, and admin workflows are demonstrable end to end on desktop and mobile widths with loading, empty, validation, and provider-error states.
14. **Explicitly out of scope:** Messaging, booking, payment, notifications, reviews, analytics, advanced autocomplete, image editing, marker clustering, and visual polish beyond usable/accessible layouts.
15. **Dependencies and size:** Depends on Phase 11 and all corresponding backend phases; **Large**.

### Phase 13 — Verification and integration testing

1. **Objective:** Produce cross-cutting evidence that the assembled MVP preserves contracts, security, privacy, lifecycle, database integrity, and critical user journeys.
2. **Scope:** Repository/service/API/database/concurrency/provider/frontend tests, complete authorization/privacy matrices, manual acceptance, and regression closure.
3. **Preconditions:** All feature phases are complete with their incremental tests passing.
4. **Planned files/directories:** Cross-module integration/acceptance suites, Playwright critical-flow tests, test fixtures/factories, acceptance checklist, and CI/check scripts. Existing phase tests remain in their owning modules.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-053 | Build the cross-module backend/database verification suite and contract inventory covering all endpoints, tables, constraints, auth/role/ownership/activity, privacy, lifecycle, rollback, stale concurrency, numeric mapping, search, and provider mocks. | Backend cross-module integration tests and contract checklist | All frozen API/Database sections | RM-044 | Every endpoint has success/important-error coverage and all business-critical matrices pass against a fresh migrated test database. |
| RM-054 | Build focused frontend critical-flow automation and execute the full manual acceptance checklist across responsive, accessibility, provider-failure, and actor workflows. | Playwright/Testing Library suites; manual acceptance document | Requirements §§3–6; Architecture §4 | RM-047–RM-052, RM-053 | Automated critical paths pass; the manual checklist records evidence for every MVP actor capability and no unresolved release blocker remains. |

6. **Backend tasks:** RM-053.
7. **Frontend tasks:** RM-054.
8. **Database tasks:** Rebuild from migrations, verify exact inventory/constraints, inject rollback faults, and isolate concurrent test clients.
9. **Endpoints covered:** Separate health plus all V1-01 through V1-31.
10. **Transaction/concurrency concerns:** Explicit competing-client tests cover listing PATCH/action, image count/order, hard deletion, and moderation; fault injection proves atomic rollback and client release.
11. **Security/privacy concerns:** Full request matrix for anonymous, active/inactive tenant, landlord owner/non-owner, admin, wrong role, invalid/expired cookie, and invalid Origin; response field allowlists are asserted.
12. **Tests required:** All categories named in the objective, with business-critical paths mandatory. Coverage percentage is secondary; if tracked, aim for roughly 80% on backend services/policies while requiring explicit branch coverage for lifecycle, privacy, authorization, and transaction rules.
13. **Acceptance criteria:** Fresh-environment automated checks and the manual acceptance checklist pass; each defect is fixed and tested in its owning module before sign-off.
14. **Explicitly out of scope:** Load testing for nationwide scale, 100% coverage, live destructive provider tests in normal CI, and features outside MVP.
15. **Dependencies and size:** Depends on Phases 0–12; **Large**.

### Phase 14 — Deployment and final documentation

1. **Objective:** Prepare and verify a production-safe deployment and complete operator/developer documentation.
2. **Scope:** Production config validation, HTTPS/same-site topology, secure cookie/CORS/Origin checks, migrations/seeds/admin provisioning, provider configuration, smoke tests, README/API usage, and release checklist.
3. **Preconditions:** Phase 13 acceptance is green and a target hosting environment is available.
4. **Planned files/directories:** Deployment/environment documentation and configuration already allowed by the architecture; root/backend/frontend README updates; deployment/smoke checklist. No new runtime service is introduced.
5. **Implementation tasks:**

| ID | Bounded change | Expected files/modules | Frozen sections | Depends on | Done condition |
|---|---|---|---|---|---|
| RM-055 | Finalize production environment/deployment configuration and release documentation; run migrations/seeds/admin provisioning and production smoke/rollback-readiness checks. | Environment templates/validation; README/API/deployment checklist; smoke scripts/tests | Architecture §§11, 22, 24, 26; API §§2–6, 20 | RM-054 | HTTPS same-site deployment serves frontend/API, secure host-only cookie/CORS/Origin work, schema/admin/providers are configured, health and critical smoke flows pass, and rollback/restore ownership is documented. |

6. **Backend tasks:** Production config/smoke validation only; no new endpoints.
7. **Frontend tasks:** Production public API base/topology validation and build/smoke checks only.
8. **Database tasks:** Execute reviewed versioned migrations and idempotent lookup seeds; provision admin through the controlled strategy; verify backups/restore instructions.
9. **Endpoints covered:** Smoke-test health, login/logout, public listing search/detail, one protected landlord read, one tenant favorite read, and one admin read without mutating production data unnecessarily.
10. **Transaction/concurrency concerns:** Migration execution is single-owner and backed up; failed release does not edit applied migrations; provider operations are not part of deployment database transactions.
11. **Security/privacy concerns:** HTTPS, production `Secure`, host-only cookie, exact origin, no wildcard credentials, secret separation, sanitized logs, least-privilege database/provider credentials, and private projection smoke checks.
12. **Tests required:** Production builds/typecheck/lint/tests, migration dry run on staging-like database, configuration-negative tests, health, cookie/CORS/Origin verification, provider connectivity, and critical non-destructive smoke tests.
13. **Acceptance criteria:** The documented deployment can be repeated, operated, and smoke-tested without architectural improvisation; the README and API usage guidance match the shipped system.
14. **Explicitly out of scope:** Containerizing every component, queues/Redis/API gateway, multi-region scaling, monitoring platform, CDN redesign, and any post-MVP feature.
15. **Dependencies and size:** Depends on Phase 13; **Medium**.

## 5. Sequential task backlog

This is the default single-developer execution order. A task is ready only when all listed dependencies are complete. Its detailed files, specification references, and done condition are defined in its owning phase.

| ID | Phase | Commit-sized outcome |
|---|---:|---|
| RM-001 | 0 | Repository tooling and commands normalized |
| RM-002 | 0 | Runtime config, logging, request/error baseline, health, and shutdown |
| RM-003 | 0 | Backend/frontend test foundations |
| RM-004 | 1 | Deterministic migration runner and policy without a schema bookkeeping table |
| RM-005 | 1 | Enums, users/catalog tables, and lookup seeds |
| RM-006 | 1 | Listings, images, and listing-amenity schema |
| RM-007 | 1 | Favorites, moderation history, and exact indexes |
| RM-008 | 1 | Controlled admin provisioning and schema verification |
| RM-009 | 2 | Production config, pool/transactions, and value mapping |
| RM-010 | 2 | Errors, envelopes, and request validation |
| RM-011 | 2 | Cookie parsing, CORS, and Origin enforcement |
| RM-012 | 2 | Rate limits and authentication/role/optional-auth middleware |
| RM-013 | 2 | DTO boundaries and middleware-order integration harness |
| RM-014 | 3 | Password, JWT, and session-cookie primitives |
| RM-015 | 3 | Tenant and landlord registration |
| RM-016 | 3 | Login and logout |
| RM-017 | 3 | Current-user read and phone update |
| RM-018 | 3 | Authentication/users verification |
| RM-019 | 4 | Active lookup endpoints |
| RM-020 | 4 | Atomic landlord draft creation |
| RM-021 | 4 | Owner listing collection and detail |
| RM-022 | 4 | Lookup/draft verification |
| RM-023 | 5 | Normalized listing PATCH and amenity replacement |
| RM-024 | 5 | Significant-edit policy and current reason |
| RM-025 | 5 | Draft/hidden submission |
| RM-026 | 5 | Deactivate/reactivate actions |
| RM-027 | 5 | Restricted hard-delete database behavior and cleanup handoff |
| RM-028 | 5 | Full lifecycle/concurrency verification |
| RM-029 | 6 | Cloudinary upload and hard-delete cleanup wiring |
| RM-030 | 6 | Image deletion and cleanup |
| RM-031 | 6 | Complete image reorder |
| RM-032 | 6 | Image/provider verification |
| RM-033 | 7 | Nominatim client and forward endpoint |
| RM-034 | 7 | Geocoding/rate-limit verification |
| RM-035 | 8 | Unified ordinary public search |
| RM-036 | 8 | Bounds and bounding-box/Haversine radius search |
| RM-037 | 8 | Public detail and active-tenant contact enrichment |
| RM-038 | 8 | Discovery/privacy/performance verification |
| RM-039 | 9 | Favorites collection and idempotent mutations |
| RM-040 | 9 | Favorites visibility verification |
| RM-041 | 10 | Admin listing/detail/history reads |
| RM-042 | 10 | Atomic moderation actions |
| RM-043 | 10 | Admin user list and activation |
| RM-044 | 10 | Admin/moderation/visibility verification |
| RM-045 | 11 | Frontend shell, API client, and auth state |
| RM-046 | 11 | Shared forms/states and client-only map |
| RM-047 | 12 | Frontend registration/login/logout |
| RM-048 | 12 | Public search/list/map/detail UI |
| RM-049 | 12 | Tenant favorites UI |
| RM-050 | 12 | Landlord profile/draft/lifecycle UI |
| RM-051 | 12 | Landlord geocoding/image UI |
| RM-052 | 12 | Admin moderation/activation UI |
| RM-053 | 13 | Cross-module backend/database contract suite |
| RM-054 | 13 | Frontend critical-flow and manual acceptance |
| RM-055 | 14 | Production deployment, smoke checks, and final docs |

### Safe parallelism

The default remains sequential for one developer. If extra capacity exists, only these bounded combinations are considered safe after their common dependencies:

- RM-019 lookup reads and RM-014 authentication primitives can proceed independently after Phase 2, but their owning phase order should still be preserved for the solo schedule.
- RM-030 deletion and RM-031 reorder may proceed in parallel only after RM-029 establishes the shared image aggregate/lock conventions.
- RM-033/RM-034 geocoding can proceed alongside RM-035 ordinary public-search work after their listed prerequisites.
- RM-039 favorites and RM-041 admin read endpoints can proceed independently after public summary and lifecycle primitives are stable.
- RM-047–RM-052 frontend workflow tasks may be split by actor only after RM-045/RM-046 and the corresponding backend tasks pass.

Parallel work must not edit the same lifecycle policy, public DTO mapper, transaction helper, or shared API client without coordination.

## 6. Endpoint-to-phase mapping

### Separate health endpoint

| Endpoint | Implementation phase/task | Verification |
|---|---|---|
| `GET /api/health` | Phase 0, RM-002 | RM-003, RM-053, RM-055 |

### Versioned API

| # | Endpoint | Implementation phase/task | Frontend consumer | Primary verification |
|---:|---|---|---|---|
| V1-01 | `POST /api/v1/auth/register/tenant` | Phase 3, RM-015 | RM-047 | RM-018, RM-054 |
| V1-02 | `POST /api/v1/auth/register/landlord` | Phase 3, RM-015 | RM-047 | RM-018, RM-054 |
| V1-03 | `POST /api/v1/auth/login` | Phase 3, RM-016 | RM-047, RM-052 | RM-018, RM-054 |
| V1-04 | `POST /api/v1/auth/logout` | Phase 3, RM-016 | RM-047 | RM-018, RM-054 |
| V1-05 | `GET /api/v1/users/me` | Phase 3, RM-017 | RM-045, RM-050 | RM-018, RM-054 |
| V1-06 | `PATCH /api/v1/users/me` | Phase 3, RM-017 | RM-050 | RM-018, RM-054 |
| V1-07 | `GET /api/v1/lookups/property-types` | Phase 4, RM-019 | RM-048, RM-050 | RM-022, RM-054 |
| V1-08 | `GET /api/v1/lookups/amenities` | Phase 4, RM-019 | RM-048, RM-050 | RM-022, RM-054 |
| V1-09 | `GET /api/v1/listings` | Phase 8, RM-035/RM-036 | RM-048 | RM-038, RM-054 |
| V1-10 | `GET /api/v1/listings/:listingId` | Phase 8, RM-037 | RM-048 | RM-038, RM-054 |
| V1-11 | `POST /api/v1/landlord/listings` | Phase 4, RM-020 | RM-050 | RM-022, RM-054 |
| V1-12 | `GET /api/v1/landlord/listings` | Phase 4, RM-021 | RM-050 | RM-022, RM-054 |
| V1-13 | `GET /api/v1/landlord/listings/:listingId` | Phase 4, RM-021 | RM-050 | RM-022, RM-054 |
| V1-14 | `PATCH /api/v1/landlord/listings/:listingId` | Phase 5, RM-023/RM-024 | RM-050 | RM-028, RM-054 |
| V1-15 | `DELETE /api/v1/landlord/listings/:listingId` | Phases 5–6, RM-027 + RM-029 | RM-050 | RM-028, RM-032, RM-054 |
| V1-16 | `POST /api/v1/landlord/listings/:listingId/submit` | Phase 5, RM-025 | RM-050 | RM-028, RM-054 |
| V1-17 | `POST /api/v1/landlord/listings/:listingId/deactivate` | Phase 5, RM-026 | RM-050 | RM-028, RM-054 |
| V1-18 | `POST /api/v1/landlord/listings/:listingId/reactivate` | Phase 5, RM-026 | RM-050 | RM-028, RM-054 |
| V1-19 | `POST /api/v1/landlord/listings/:listingId/images` | Phase 6, RM-029 | RM-051 | RM-032, RM-054 |
| V1-20 | `DELETE /api/v1/landlord/listings/:listingId/images/:imageId` | Phase 6, RM-030 | RM-051 | RM-032, RM-054 |
| V1-21 | `PUT /api/v1/landlord/listings/:listingId/images/order` | Phase 6, RM-031 | RM-051 | RM-032, RM-054 |
| V1-22 | `POST /api/v1/geocoding/forward` | Phase 7, RM-033 | RM-051 | RM-034, RM-054 |
| V1-23 | `GET /api/v1/favorites` | Phase 9, RM-039 | RM-049 | RM-040, RM-054 |
| V1-24 | `PUT /api/v1/favorites/:listingId` | Phase 9, RM-039 | RM-049 | RM-040, RM-054 |
| V1-25 | `DELETE /api/v1/favorites/:listingId` | Phase 9, RM-039 | RM-049 | RM-040, RM-054 |
| V1-26 | `GET /api/v1/admin/listings` | Phase 10, RM-041 | RM-052 | RM-044, RM-054 |
| V1-27 | `GET /api/v1/admin/listings/:listingId` | Phase 10, RM-041 | RM-052 | RM-044, RM-054 |
| V1-28 | `GET /api/v1/admin/listings/:listingId/moderation-actions` | Phase 10, RM-041 | RM-052 | RM-044, RM-054 |
| V1-29 | `POST /api/v1/admin/listings/:listingId/moderation-actions` | Phase 10, RM-042 | RM-052 | RM-044, RM-054 |
| V1-30 | `GET /api/v1/admin/users` | Phase 10, RM-043 | RM-052 | RM-044, RM-054 |
| V1-31 | `PATCH /api/v1/admin/users/:userId/activation` | Phase 10, RM-043 | RM-052 | RM-044, RM-054 |

## 7. Database migration ordering

The implementation may split files further for reviewability, but it must preserve this dependency order and must not add schema objects outside the two frozen enums, eight tables, specified constraints, and specified indexes.

| Order | Migration content | Dependency/rollback expectation |
|---:|---|---|
| 1 | Create `user_role` and `listing_status` enum types. | Down migration drops them only after all dependent tables are removed. |
| 2 | Create `users`, then `property_types`, then `amenities`, including all checks/unique constraints/defaults. | Reverse drop order; never remove referenced lookup rows as normal rollback behavior. |
| 3 | Seed the five property types and twelve amenities using stable codes. | Repeat-safe; rollback removes only rows inserted by this seed when no references exist, otherwise use clean test reset/forward correction. |
| 4 | Create `listings` with landlord/property-type FKs and every row-local/completeness check. | Drop after all children and moderation history are removed. |
| 5 | Create `listing_images` and `listing_amenities`, including cascades, restrictions, composite key, slots, and deferrable `(listing_id, display_order)` uniqueness. | Drop children before `listings`; external Cloudinary assets are never managed by schema rollback. |
| 6 | Create `favorites` with composite key and the two specified cascades. | Drop before `listings`/`users`. |
| 7 | Create `moderation_history` last among tables, with restrictive FKs and transition/reason checks. | Drop before `listings`/`users`; production data is append-only and is not deleted merely to roll back application code. |
| 8 | Add exactly the ten explicit indexes in Database Design §32. | Index down steps drop only their named index; PK/unique backing indexes are not duplicated. |
| 9 | Verify exact inventory and provision an admin through controlled seed/command input. | Admin provisioning is repeat-safe by normalized email and never exposes plaintext secrets. |

Migration execution policy:

**Clean database**

- Run every ordered migration file exactly once in deterministic lexical/version order.
- Verify the exact enum, table, constraint, foreign-key, and index inventory afterward.

**Existing deployed database**

- Record the currently applied migration version in the release/deployment manifest outside the RentMate product schema.
- Explicitly select only migration files newer than that externally recorded version.
- Advance the external deployment record only after all selected migrations apply successfully and final verification passes.
- Never blindly execute migration files already recorded as applied.
- Fail the release clearly when the recorded version and observed schema preconditions disagree.

**Migration tests and rollback**

- Test clean database rebuild, deterministic ordering, explicit selection from an external version manifest, per-migration transaction/failure behavior, partial-failure detection, final schema inventory, repeat-safe lookup seeds, and deployment-record mismatch detection where practical.
- Do not require every DDL file to use `IF NOT EXISTS` or make a full rerun succeed as a no-op.
- Shared/applied migration files are immutable; corrections use a new forward migration.
- Production uses backup plus forward-fix/restore procedures; destructive down migrations are primarily for disposable local/test databases.
- Execution is explicit during deployment, not normal application startup.
- Because the frozen product schema contains exactly eight tables, no migration bookkeeping table is created.
- A clean rebuild test is mandatory after every migration change.

### Table coverage

| Table | Created in | First application phase |
|---|---|---|
| `users` | RM-005 | Phase 3 |
| `property_types` | RM-005 | Phase 4 |
| `amenities` | RM-005 | Phase 4 |
| `listings` | RM-006 | Phase 4 |
| `listing_images` | RM-006 | Phase 6 |
| `listing_amenities` | RM-006 | Phase 4 |
| `favorites` | RM-007 | Phase 9 |
| `moderation_history` | RM-007 | Phase 5 reads/restriction; Phase 10 writes |

### Lifecycle implementation coverage

| Transition or outcome | Actor/trigger | Implementation | Required verification |
|---|---|---|---|
| New listing becomes `DRAFT` | Landlord create | RM-020 | RM-022 |
| `DRAFT -> PENDING` | Landlord submit | RM-025 | RM-028 |
| Unmoderated `DRAFT -> deleted` | Owner hard delete | RM-027 database behavior + RM-029 provider cleanup wiring | RM-028, RM-032 |
| `PENDING -> APPROVED` | Admin approve | RM-042 | RM-044 |
| `PENDING -> REJECTED` | Admin reject with reason | RM-042 | RM-044 |
| `REJECTED -> DRAFT` | Real significant edit | RM-023/RM-024 | RM-028 |
| `PENDING -> PENDING` | Real significant edit | RM-023/RM-024 | RM-028 |
| `APPROVED -> PENDING` | Real significant edit/image add/delete | RM-024, RM-029/RM-030 | RM-028, RM-032 |
| `APPROVED -> INACTIVE` | Landlord deactivate | RM-026 | RM-028 |
| `APPROVED -> HIDDEN` | Admin hide with reason | RM-042 | RM-044 |
| `INACTIVE -> APPROVED` | Landlord reactivate unchanged | RM-026 | RM-028 |
| `INACTIVE -> PENDING` | Real significant edit/image add/delete | RM-024, RM-029/RM-030 | RM-028, RM-032 |
| `HIDDEN -> HIDDEN` | Remediation edit/image add/delete | RM-024, RM-029/RM-030 | RM-028, RM-032 |
| `HIDDEN -> PENDING` | Explicit landlord submit | RM-025 | RM-028 |
| `HIDDEN -> APPROVED` | Admin restore | RM-042 | RM-044 |
| Any state unchanged | Normalized content no-op or image-order no-op | RM-023, RM-031 | RM-028, RM-032 |

## 8. Test strategy

### Incremental test layers

1. **Pure unit tests:** Normalizers, validators, lifecycle matrix, bounding-box math, DTO mapping, Haversine expectations, cookie options, and provider response normalization.
2. **Service tests:** Role/ownership/state decisions, no-op behavior, lookup retirement, contact enrichment, favorites visibility, and provider compensation using repository/client fakes only where that improves failure targeting.
3. **HTTP integration tests:** Express app plus migrated test PostgreSQL for exact methods, paths, status codes, envelopes, cookies, Origins, unknown fields, optional/protected auth, and projections.
4. **Database integration tests:** Real PostgreSQL constraints, transactions, locks, cascades/restrictions, limit-plus-one ordering, Haversine SQL, and fault-injected rollbacks.
5. **Provider contract tests:** Mocked Nominatim and Cloudinary HTTP/client boundaries; no routine CI dependency on live providers.
6. **Frontend tests:** Testing Library for form/component behavior and Playwright for a small critical-flow set.
7. **Manual acceptance:** Desktop/mobile workflows, keyboard operation, map interaction, actual provider staging configuration, error recovery, and production smoke checklist.

### Mandatory business-critical matrices

- Authentication: missing, invalid, expired, inactive, and optional cookie behavior.
- Authorization: every endpoint’s allowed role, wrong role, and owner/non-owner behavior.
- Origin: safe methods and each unsafe method with allowed, missing, and denied Origin.
- Privacy: explicit field allowlists for public collection/detail, active-tenant detail, owner detail, favorites, and admin projections.
- Lifecycle: every row in the lifecycle coverage table, invalid source states, repeated actions, and no-op updates.
- Transactions: content/amenities/status, image/status/timestamp, moderation/history, and deletion/cascades.
- Concurrency: stale listing PATCH/actions, simultaneous moderation, image count/order changes, and hard deletion conflicts.
- Search: all filters, ALL amenities, retired codes, bounds/radius groups, known coordinate pairs, exact distance, rounding, deterministic sorts, page+1, and no total count/N+1.
- Providers: upload success/DB failure compensation, post-commit delete cleanup failure, Nominatim empty/timeout/rate limit/normalization.

Coverage percentage is not a release substitute. If measured, roughly 80% service/policy coverage is a useful target, while the matrices above require explicit tests regardless of the aggregate percentage.

## 9. Milestones

| Milestone | Completed tasks | Demonstrable end-to-end outcome |
|---|---|---|
| M1 — Database and backend foundation operational | RM-001–RM-013 | From a clean checkout, PostgreSQL receives exactly the frozen schema/seeds; the backend starts, reports health, emits request IDs, and enforces shared HTTP/security conventions. |
| M2 — Authentication and user profile complete | RM-014–RM-018 | A tenant and landlord can register and auto-login, log out/in with the secure cookie, read/update permitted profile data, and inactive accounts are blocked. |
| M3 — Landlord listing lifecycle complete | RM-019–RM-028 | Listing PATCH and lifecycle policies are complete; submission is verified with persisted-image database fixtures; hard-delete database eligibility, cascades, and moderation-history retention are verified. The complete user-facing image-to-submit/provider-cleanup workflow is not yet claimed. |
| M4 — Images and geocoding complete | RM-029–RM-034 | A landlord can create a draft, upload an image, submit it, delete/reorder images, perform eligible hard deletion with best-effort Cloudinary cleanup, and use explicit geocoding without losing draft data. |
| M5 — Public discovery and favorites complete | RM-035–RM-040 | Public users can browse/filter/map/radius-search and view approximate details; an active tenant can see contact and manage visibility-aware favorites. |
| M6 — Admin moderation complete | RM-041–RM-044 | An admin can review listings, perform all four atomic moderation transitions, inspect history, and manage tenant/landlord activity with immediate visibility effects. |
| M7 — Frontend actor workflows complete | RM-045–RM-052 | Public/tenant, landlord, and admin workflows are usable end to end on responsive pages against the complete backend. |
| M8 — Integration-tested deployable MVP | RM-053–RM-055 | Fresh-database automated/manual acceptance is green and a production-safe, documented deployment passes smoke checks. |

## 10. Dependency map

```text
Phase 0
  -> Phase 1 database
  -> Phase 2 shared backend
      -> Phase 3 auth/users
          -> Phase 4 lookups/drafts
              -> Phase 5 lifecycle
                  -> Phase 6 images
                  -> Phase 7 geocoding
                  -> Phase 8 public discovery
                      -> Phase 9 favorites
                      -> Phase 10 admin moderation/users
                          -> Phase 11 frontend foundation
                              -> Phase 12 actor workflows
                                  -> Phase 13 verification
                                      -> Phase 14 deployment
```

Additional hard dependencies:

- Migrations precede every repository.
- RM-012 auth/role middleware precedes every protected endpoint.
- RM-024 lifecycle policy precedes image content mutation and moderation actions.
- RM-035 public summary/projection precedes favorites retrieval.
- RM-038 public visibility tests precede RM-043 landlord-activation visibility acceptance.
- Each backend endpoint task precedes its Phase 12 frontend consumer.
- Phase 14 begins only after M8 acceptance evidence is complete.

## 11. Risk register

| Risk | Practical frozen-design-compatible mitigation | Verification owner |
|---|---|---|
| Lifecycle logic diverges across PATCH, images, and actions | One listings lifecycle policy; all mutation services call it; exhaustive state table tests. | RM-024, RM-028, RM-032, RM-044 |
| Public/private data leakage through joins or raw rows | Narrow SQL projections plus distinct row/application/API DTOs and response field allowlists. | RM-013, RM-038, RM-040, RM-044 |
| Transaction uses pool calls or multiple clients accidentally | One transaction helper passes the checked-out client explicitly; rollback/client-release tests and code review checklist. | RM-009, RM-028, RM-032, RM-044 |
| N+1 image/amenity loading | Aggregate query or bounded bulk loads per selected page; query-count tests; no per-row repository calls. | RM-035, RM-038 |
| PostgreSQL `numeric` silently returns strings or coerces rent | Validate integer/scale before SQL and deliberately map approved safe values; mapping/constraint tests. | RM-009, RM-022, RM-038 |
| Bounding-box/Haversine mistakes | One TypeScript bounding-box helper, one repository expression, `6371.0088`, clamp intermediate value, known-coordinate tests. | RM-036, RM-038 |
| Cloudinary/database partial failure | Upload compensation, delete-after-commit cleanup, structured failure logs, and no blind retry/atomicity claim. | RM-029–RM-032 |
| Nominatim unavailable or rate-limited | Explicit-only request, timeout, identifying headers, per-user/provider throttling, empty/error UX, and manual pin placement. | RM-033, RM-034, RM-051 |
| Cookie/CORS/Origin mismatch between environments | Same-site production topology, exact origin configuration, credential-aware client/CORS, host-only cookie, negative configuration tests. | RM-011, RM-014, RM-045, RM-055 |
| Eight-week scope erosion | Enforce the cut line, one task per prompt/commit, no speculative abstractions, and milestone demos before polish. | Entire roadmap |

## 12. MVP cut line

### Must not be removed

- Registration/login/logout, secure cookie handling, and account activity enforcement.
- Role and ownership authorization, Origin validation, request validation, and privacy projections.
- Listing drafts, editing/no-op rules, every lifecycle/moderation transition, hard-delete restriction, and transaction/concurrency controls.
- Cloudinary image upload/delete/reorder, count/type/size rules, and partial-failure handling.
- Explicit Nominatim geocoding with manual location correction path.
- Unified public search/detail with active-landlord visibility, bounds/radius/Haversine behavior, and approximate coordinates.
- Tenant contact enrichment and favorites semantics.
- Admin moderation/history and tenant/landlord activation.
- Incremental business-critical tests and deployment security checks.

### Polish that may be reduced

- Visual refinement beyond a clear responsive and accessible interface.
- Advanced loading animations; retain understandable loading states.
- Nonessential reusable-component abstraction; retain shared API/auth/error/map primitives.
- Extensive optional alt-text authoring assistance; retain storage, validation, display, and basic meaningful-alt guidance.
- Sophisticated map gestures or conveniences beyond approved bounds/radius behavior, explicit refresh, manual pin adjustment, and usable list parity.

Required security, lifecycle, privacy, transaction, error, accessibility-baseline, and validation behavior is never treated as polish.

## 13. Definition of Done

A task is done only when:

- Its bounded frozen behavior is implemented without unrelated changes.
- Its expected files remain within the approved four modules/shared infrastructure/integration clients/frontend structure.
- Typecheck, lint/format-check, and relevant tests pass.
- New business-critical branches have unit/service/HTTP/database tests at the appropriate layer.
- Errors, status codes, envelopes, DTO fields, ordering, pagination, idempotency, and no-op behavior match the API contract.
- Authorization order, active-account check, owner-scoped `404`, unsafe Origin, and privacy field allowlists are reviewed.
- Multi-write workflows use one checked-out client and have rollback/failure tests.
- Provider work follows the exact compensation/post-commit policy.
- No migration, endpoint, table, column, module, infrastructure service, or product feature outside frozen scope is introduced.
- Documentation/comments are updated only where they explain implemented behavior; frozen specifications are not modified.
- The task can be demonstrated independently and is suitable for one coherent commit.

The MVP is done only when all RM-001 through RM-055 conditions, M8, and the final readiness checklist are satisfied.

## 14. Recommended implementation commit strategy

- Use one task ID per commit by default: `RM-023: implement normalized listing patch`.
- A task may use two commits only when separating a deterministic schema/tooling change from its verification materially improves review; both commits retain the same task ID.
- Do not combine unrelated backend, frontend, database, or provider tasks.
- Keep tests in the same commit as the behavior they verify.
- Review `git diff` before every commit and preserve unrelated user changes.
- Never rewrite an already shared migration. Add a forward migration tied to the correcting task.
- Tag or record milestone commits M1–M8 after their demonstrable outcome passes.
- Run the narrow task suite during development and the full accumulated suite at phase and milestone boundaries.
- Later Codex prompts should name one RM task, cite this roadmap and the frozen specifications, explicitly prohibit adjacent tasks, and request the task’s done condition and tests.

## 15. Final readiness checklist

Before implementation begins:

- [ ] Frozen requirements, architecture, database design, and API contract remain unchanged.
- [ ] One task ID and its dependencies are selected.
- [ ] The task’s specification sections and done condition are quoted in the implementation prompt.
- [ ] Existing working-tree changes are inspected and preserved.
- [ ] Required earlier migrations/middleware/modules are complete and green.
- [ ] Test database/provider mocks needed by the task are available.

Before deployment:

- [ ] RM-001 through RM-055 are complete.
- [ ] M1 through M8 outcomes have been demonstrated.
- [ ] Exactly two enums and eight product tables exist.
- [ ] Exactly 31 `/api/v1` endpoints plus separate `GET /api/health` are registered.
- [ ] Every lifecycle transition and invalid/repeated path passes.
- [ ] Authentication/role/ownership/activity/Origin matrices pass.
- [ ] Public, tenant, owner, favorite, and admin projection allowlists pass.
- [ ] Search bounds/radius/Haversine/rounding/sort/pagination tests pass with no total count or N+1 behavior.
- [ ] Cloudinary and Nominatim success/failure/rate-limit/compensation paths pass.
- [ ] Responsive critical actor workflows and manual acceptance pass.
- [ ] Production HTTPS, same-site topology, secure host-only cookie, exact CORS, and Origin controls are verified.
- [ ] Production migrations, lookup seeds, controlled admin provisioning, backup/restore, provider credentials, smoke checks, and operator documentation are verified.

No implementation work begins merely because this roadmap exists; implementation begins only through a later bounded task request.
