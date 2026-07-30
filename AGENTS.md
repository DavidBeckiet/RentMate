# RentMate Codex Working Instructions

## 1. Purpose

This file is the repository-level execution policy for Codex work on RentMate. It applies to the entire repository.

Before any implementation task, read these frozen documents in full:

- `docs/requirements/REQUIREMENTS.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/database/DATABASE_DESIGN.md`
- `docs/api/API_SPECIFICATION.md`
- `docs/implementation/IMPLEMENTATION_ROADMAP.md`

Implement one explicitly requested roadmap task at a time. Preserve unrelated user work, do not reopen frozen decisions, do not expand MVP scope, verify the result, report accurately, and stop.

## 2. Source-of-truth order

Use this authority order:

1. The user’s current explicit task request
2. `AGENTS.md`
3. `docs/implementation/IMPLEMENTATION_ROADMAP.md`
4. `docs/api/API_SPECIFICATION.md`
5. `docs/database/DATABASE_DESIGN.md`
6. `docs/architecture/ARCHITECTURE.md`
7. `docs/requirements/REQUIREMENTS.md`
8. Existing implementation patterns, only where they do not conflict with the documents above

A current request may select and narrow work. It must not silently override frozen product, API, schema, lifecycle, privacy, or security decisions. Those decisions may change only through a separate, explicit design-change review requested by the user.

If authoritative documents genuinely contradict one another, stop the conflicting part and report the exact conflict. Do not invent a resolution. Existing code is not authoritative when it conflicts with the documents above.

## 3. Frozen project boundaries

- Next.js App Router frontend.
- Express and TypeScript backend.
- PostgreSQL accessed through direct, parameterized `pg`.
- One modular monolith with exactly four business modules: `auth`, `users`, `listings`, and `favorites`.
- Search, images, geocoding coordination, and moderation remain under `listings`.
- Cloudinary and Nominatim are infrastructure integration clients.
- No ORM and no PostGIS.
- Exactly two PostgreSQL enums and eight product tables.
- Exactly 31 `/api/v1` endpoints and separate `GET /api/health`.
- Two-hour JWT in the host-only HttpOnly `rentmate_session` cookie.
- No refresh tokens and no server-side session table.
- Frozen Option C listing lifecycle.
- Public visibility requires an `APPROVED` listing and an active owning landlord.
- Public coordinates are approximate; exact location remains private.
- Moderation history is append-only.
- Hard deletion is restricted to an owned `DRAFT` with no moderation-history rows.
- No atomic image-replacement endpoint.

Do not alter these boundaries during an implementation task.

## 4. Task selection and execution protocol

Every implementation request must name exactly one roadmap task, such as `RM-001`.

For the selected task:

1. Read the task, dependencies, done condition, files/modules, and specification references in the roadmap.
2. Read the referenced frozen specification sections.
3. Verify that all listed dependencies are complete.
4. Inspect the repository and working tree.
5. Implement only the selected task and directly necessary support.
6. Add or update only tests required by that task.
7. Run the narrowest relevant checks.
8. Inspect the final diff for scope and unrelated changes.
9. Stop when the selected task’s done condition is met.

Roadmap ordering alone is not proof that a dependency is complete. Before treating a dependency as complete, inspect the current repository, relevant tests, configuration, migrations, and available task evidence. Do not claim completion merely because the dependency’s task ID precedes the selected task. If a required dependency is incomplete or cannot be verified, report it and do not partially recreate it inside the current task.

Do not automatically start the next task.

If an implementation request names no task, ask the user to select one. If it names multiple tasks, do not silently combine them; ask the user to select one unless the prompt explicitly and deliberately authorizes a tightly coupled multi-task operation.

## 5. Working-tree and Git safety

Before editing, inspect:

- `git status --short`
- Relevant existing files
- Relevant package scripts and configuration
- The selected task’s expected files/modules

Rules:

- Preserve unrelated modified, staged, and untracked files.
- Do not discard, reset, restore, overwrite, delete, move, or reformat unrelated user work.
- Never replace an existing file wholesale before reading it.
- Do not claim pre-existing changes were created by the current task.
- Report relevant pre-existing changes separately from task-created changes.
- Do not amend, commit, push, merge, rebase, or create tags unless explicitly requested.
- Do not drop or recreate a non-test database.
- Do not modify `AGENTS.md` during an ordinary `RM-*` implementation task. It may change only when the user explicitly requests a repository-policy update; a prompt that merely requests code implementation does not authorize changing it.
- Frozen specifications and the implementation roadmap remain protected under their existing rules.

Unless explicitly authorized, do not use destructive operations such as:

- `git reset --hard`
- `git clean`
- `git checkout -- <file>`
- `git restore <file>`
- Force push
- Deleting unknown files
- Dropping or recreating development or production databases

## 6. Scope control

Classify possible changes as:

1. Required by the selected task
2. Directly necessary support for the selected task
3. Unrelated improvement

Only the first two are allowed.

Never broaden the selected task automatically. Directly necessary support must be small, inseparable from the selected task, and must not implement an independently valuable adjacent roadmap outcome.

Do not:

- Refactor opportunistically.
- Rename unrelated files.
- Format the whole repository.
- Upgrade unrelated dependencies.
- Introduce speculative abstractions.
- Add generic base controllers, services, or repositories.
- Add unused directories, placeholder files, or empty layers.
- Add endpoints, tables, columns, enums, modules, providers, queues, caches, infrastructure, or features outside the task.
- Fix unrelated defects unless they block the selected task.

Record an unrelated defect in the final report without changing it. If it blocks the selected task, report the blocker and stop the blocked work. Fixing that defect, implementing an adjacent roadmap task, or widening the allowed file/module scope requires explicit user authorization. A blocker is never automatic permission to expand scope.

## 7. Database and migration rules

- Match `docs/database/DATABASE_DESIGN.md` exactly.
- Keep exactly two enums and eight product tables.
- Do not add a migration bookkeeping table.
- Use ordered, versioned migration files.
- Applied or shared migration files are immutable; corrections use new forward migrations.
- A clean database runs all migrations once in deterministic order.
- An existing deployment runs only migrations selected using the external deployment version record.
- Do not make all DDL silently idempotent through broad `IF NOT EXISTS` usage.
- Application startup is not the migration runner.
- Use parameterized SQL for every application query.
- Use a disposable test database for database tests. Never destroy development or production data.

Every multi-write transaction must use one checked-out `pg` client from `BEGIN` through `COMMIT` or `ROLLBACK`. Never split a transaction across independent `pool.query` calls. Use the listing row as the serialization point for listing mutations where specified.

Do not add triggers, PostGIS, ORM metadata, generated columns, revision tables, session tables, soft-delete columns, generalized audit tables, or any other schema object outside the frozen design.

## 8. API contract rules

Implement `docs/api/API_SPECIFICATION.md` exactly, including:

- HTTP method and path
- Authentication, current account activity, role, and ownership
- Request fields, normalization, validation, and unknown-field rejection
- Response envelope and DTO fields
- Privacy projection
- Status and application error codes
- Idempotency and no-op behavior
- Lifecycle effect
- Transaction and concurrency behavior

Do not:

- Invent endpoint aliases or generic status-update endpoints.
- Return raw database rows or database `snake_case`.
- Expose exact public address or coordinates.
- Expose landlord identity or contact outside the authorized active-tenant public-detail case.
- Expose Cloudinary public IDs or raw provider values.
- Expose moderation data publicly.
- Expose passwords, password hashes, JWTs, cookies, SQL, stack traces, or secrets.

Map explicitly between database rows, internal application values, and API response DTOs.

## 9. Authentication and authorization

- Email is the only login identifier and is immutable through MVP APIs.
- Use bcrypt for passwords.
- Passwords require at least 8 characters and at most 72 UTF-8 bytes.
- JWT lifetime is two hours.
- Cookie name is `rentmate_session`.
- Cookie is host-only, HttpOnly, `SameSite=Lax`, and `Secure` in production.
- Never return the token in JSON or read/store it in frontend JavaScript.
- No refresh token and no session row.
- Check current `users.is_active` on every protected request.

Frozen disclosure behavior:

- Missing, invalid, expired, or inactive authentication on a protected route: `401`.
- Authenticated caller with the wrong role: `403`.
- Missing or invalid allowed `Origin` on an unsafe method: `403`.
- Non-owner landlord accessing another landlord’s owner-scoped listing or image: `404`.
- Public request for a non-public listing: `404`.

Frontend route guards are navigation and UX only; backend authorization remains authoritative.

## 10. Listing lifecycle

Use one centralized listing lifecycle policy.

Significant-edit results:

| Current | Result |
|---|---|
| `DRAFT` | `DRAFT` |
| `PENDING` | `PENDING` |
| `REJECTED` | `DRAFT` |
| `APPROVED` | `PENDING` |
| `INACTIVE` | `PENDING` |
| `HIDDEN` | `HIDDEN` |

Explicit transitions:

- `DRAFT -> PENDING`
- `HIDDEN -> PENDING`
- `APPROVED -> INACTIVE`
- `INACTIVE -> APPROVED`
- `PENDING -> APPROVED`
- `PENDING -> REJECTED`
- `APPROVED -> HIDDEN`
- `HIDDEN -> APPROVED`

Additional invariants:

- A normalized no-op PATCH changes no content, status, amenities, or `updatedAt`.
- Image reorder is not significant.
- A real reorder updates `updatedAt`; a no-op reorder does not.
- Moderation status and one history insert commit atomically.
- Stale transitions return `409`.
- Moderation history remains append-only.
- Hard deletion requires an owned `DRAFT` and no moderation-history rows.
- Do not add revision snapshots or persisted change markers.

## 11. Public search and privacy

- Public visibility requires `listings.status = 'APPROVED'` and an active owning landlord.
- Use the single unified public listing collection for browse, filters, bounds, and radius.
- Text search uses only title and area name.
- Amenity filtering uses ALL semantics.
- Bounds and radius groups are mutually exclusive.
- Maximum radius is configuration-driven with the frozen value 50 km.
- TypeScript calculates the radius bounding box.
- PostgreSQL calculates Haversine distance using exact coordinates.
- Public coordinates are rounded deterministically to three decimals.
- Do not run a total-count query; use limit plus one.
- Use deterministic tie-breakers.
- Avoid N+1 image and amenity queries.
- Public repositories select narrow public-safe projections.

Exact address, exact response coordinates, landlord identity/contact, moderation data, image database IDs, and provider identifiers are not public. Only an active tenant viewing a currently public listing detail receives landlord email and phone.

## 12. Images and external providers

Cloudinary rules:

- Backend-mediated operations only.
- Accept exactly one uploaded file per request.
- JPEG, PNG, or WebP only.
- Validate both declared MIME type and actual detected format.
- Maximum 5 MiB per image and eight images per listing.
- Assign the smallest unused `displayOrder` slot.
- A non-draft listing must retain at least one image.
- No atomic replacement endpoint.
- Provider upload success followed by database failure triggers best-effort cleanup.
- Image/listing database deletion commits before provider cleanup.
- Post-commit cleanup failure is logged and does not undo committed deletion.
- Never blind-retry a non-idempotent upload.
- Do not add a queue or worker without a later approved design change.

Nominatim rules:

- Backend-only and active-landlord-only.
- Explicit user-triggered forward geocoding.
- At most five normalized candidates.
- Identifying headers, bounded timeout, and rate limiting.
- No autocomplete, reverse geocoding, background geocoding, raw provider response exposure, or geocoding cache table/API.

## 13. Frontend rules

- Use the Next.js App Router.
- API requests use `credentials: "include"`.
- Never store or read the JWT in JavaScript.
- Frontend route checks are UX only; server responses remain authoritative.
- Load Leaflet client-side only.
- Keep OpenStreetMap attribution visible.
- Map movement alone does not issue search requests; use the frozen explicit search action.
- Describe public location as approximate.
- Show exact location only in owner/admin workflows.
- Handle loading, empty, validation, `401`, `403`, `404`, `409`, provider-error, and retry-safe states.
- Do not conceal backend contract defects with frontend workarounds.

## 14. Testing and verification

Tests accompany the selected task. Use the layers appropriate to its done condition:

- Unit tests for pure helpers and policies
- Service tests for business decisions
- HTTP integration tests for endpoint contracts
- PostgreSQL integration tests for constraints, transactions, and locking
- Mocked provider tests for Cloudinary and Nominatim
- Frontend component tests
- Focused browser tests for critical flows

Business-critical authorization, privacy, lifecycle, transaction, and concurrency behavior requires explicit tests regardless of aggregate coverage.

Before reporting completion, run the relevant available commands, such as:

- Typecheck
- Lint
- Format check
- Focused unit tests
- Focused integration tests
- Build when build configuration or production output is affected

Never claim a check passed unless it was run successfully. If a check cannot run, report the exact command, why it could not run, and whether the cause is environmental or implementation-related.

## 15. Dependency management

Do not install or upgrade packages unless the selected task requires it.

Use the package manager already established by the repository. Inspect package-manager metadata and existing lockfiles before running installation commands. During an ordinary roadmap task, do not switch between npm, pnpm, Yarn, or another package manager, and do not create a second competing lockfile. When a selected task requires a dependency, update only the repository’s existing correct lockfile.

Before adding a dependency:

1. Inspect existing dependencies.
2. Confirm the capability is not already available.
3. Choose a maintained package suitable for the frozen stack.
4. Add only the minimum required package.
5. Update the correct lockfile.
6. Report why it was required.

Never perform broad dependency upgrades or automatic repair commands such as forceful audit fixes unless explicitly requested.

## 16. Code quality

- Keep strict TypeScript.
- Prefer small, focused functions.
- Use explicit types at module boundaries.
- Use parameterized SQL.
- Sanitize errors and logs.
- Never log sensitive data.
- Avoid `any` unless narrowly justified.
- Leave no dead or commented-out implementation.
- Add no empty speculative abstractions.
- Do not pass raw database/provider objects across API boundaries.
- Comments explain non-obvious reasons, not obvious syntax.
- Follow existing repository style only after confirming it does not conflict with frozen documents.
- Avoid generic frameworks and premature reuse.

## 17. Definition of task completion

A task is complete only when:

- The selected task’s done condition is satisfied.
- Required tests are present.
- Relevant checks pass.
- The final diff has no unrelated changes.
- Frozen specifications and the roadmap remain unchanged.
- No adjacent roadmap task was implemented.
- No new product, schema, API, lifecycle, privacy, or security decision was introduced.
- Limitations, failed checks, unrelated defects, and blockers are reported honestly.

Stop after completion and wait for another explicit task request.

## 18. Required final response format

Every implementation response must use this structure:

## Task

- Task ID
- One-sentence outcome

## Files changed

- List each created, modified, or deleted file.
- Separate relevant pre-existing changes.

## What was implemented

- Give a bounded summary tied to the selected task’s done condition.

## Tests and checks

For each command, report:

- Command
- Result
- Relevant failure details, if any

## Contract verification

Confirm:

- Frozen specifications and roadmap are unchanged.
- Endpoint and schema scope are unchanged.
- Privacy, security, and lifecycle rules are preserved.
- No adjacent `RM-*` task was implemented.

## Remaining issues

List blockers, environment limitations, and unrelated defects discovered but not changed. If none, state:

`None.`

## Next roadmap task

State the next task ID as informational context only when the selected task’s done condition is fully satisfied and all required checks have passed, or `None` after a completed `RM-055`. Do not implement it automatically.

If the task is blocked, partially implemented, has unresolved implementation failures, or cannot be confirmed complete because of an environment limitation, state:

`Current task remains open: RM-XXX`

Do not recommend starting the next roadmap task while the current task remains incomplete. Report environment-only limitations honestly and distinguish whether they prevent confirmation of task completion.
