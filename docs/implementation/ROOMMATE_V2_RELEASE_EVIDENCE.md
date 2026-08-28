# Roommate V2 release evidence

Date: 2026-08-28

Milestone: `ROOMMATE-V2-06`

Candidate: `ec76f5fbeb42732ab270dad732b3746128ca9f55` plus this release-evidence checkpoint

## Contract and scope

- Compatibility remains a pure, read-time evaluation of exactly eight dimensions: five lifestyle dimensions plus effective budget, area, and move-in intent.
- Dimension outcomes remain `ALIGNED`, `NEUTRAL`, `DISCUSS`, `IMPORTANT_DIFFERENCE`, and `NOT_EVALUATED`. Overall output remains `HIGH_ALIGNMENT`, `MIXED`, `IMPORTANT_DIFFERENCE`, or `null` when data is insufficient.
- Discovery keeps `createdAt DESC, requestId DESC`; compatibility does not rank or gate candidates.
- Verification remains factual and channel-independent. Public projections contain only `emailVerified`, `phoneVerified`, and `memberSince`; owner-private status contains the current destinations and verification timestamps.
- Risk remains a read-time admin aid with exactly seven frozen flags, `ELEVATED` or `STANDARD` priority, bounded evidence, and explicit moderation.
- No compatibility score, risk score, trust score, automatic enforcement, persistence, schema change, migration, AI, `RoommateGroup`, or V2.x feature was added.

## Integrated lifecycle evidence

| Stage | Evidence | Result |
| --- | --- | --- |
| Profile and request | Engagement service/validation suites and PostgreSQL lifecycle suite | PASS |
| Discovery and compatibility | Exhaustive compatibility and integration suites; explicit query-precedence, fallback, ordering, and dependency tests | PASS |
| Interest and connection | PostgreSQL interest/concurrency suite and real Gateway/browser Flow A and Flow B | PASS |
| Messaging | PostgreSQL pagination/read/write/rollback coverage and real Gateway/browser chat flow | PASS |
| Verification | Identity HTTP/service/PostgreSQL suites and tenant frontend tests | PASS |
| Block and report | Engagement HTTP/PostgreSQL suites and real Gateway/browser safety flow | PASS |
| Risk and admin review | Risk unit/admin suites, global pagination assertions, and admin frontend tests | PASS |
| Explicit moderation | Engagement safety suite and admin UI tests; no automatic state mutation | PASS |

The existing Playwright Roommate release suite ran against the real local Gateway and covered an eligible linked Listing flow, an unlinked request flow, interest creation, free-form chat, acceptance, current connection, reporting, pair block, unavailable Listing handling, and responsive layouts at 375, 768, 1024, and 1440 pixels.

## Authorization matrix

| Actor | Tenant Roommate surface | Owner/participant mutations | Verification | Admin reports/risk | Internal Identity risk projection |
| --- | --- | --- | --- | --- | --- |
| Anonymous | `401` | `401` | `401` | `401` | Not routed by Gateway (`404`) |
| Active tenant | Authenticated discovery/profile/request access | Only frozen owner, candidate, or participant actions | Own account only | Denied | Denied |
| Request owner | Own request lifecycle and incoming-interest actions | Owner checks enforced | Own account only | Denied | Denied |
| Non-owner tenant | Eligible discovery/detail only | Cannot mutate another owner's request; may create a valid interest as candidate | Own account only | Denied | Denied |
| Connected participant | Own conversation and connection actions | Participant checks enforced | Own account only | Denied | Denied |
| Blocked participant | Historical relationship remains non-restoring; interactions and connection are disabled | Only blocker can intentionally unblock; old interest/connection is not restored | Own account only | Denied | Denied |
| Admin | No tenant-role bypass | Explicit moderation routes only | Tenant owner routes denied | Queue/detail and `riskSummary` allowed | Denied through public Gateway |
| Internal service | No browser route | No browser route | Public-safe projection only where contracted | No admin privilege | Exact `createdAt` projection only behind internal service authentication |

The Gateway probes additionally verified invalid unsafe origins return `403`, anonymous tenant/admin calls return `401`, and internal routes remain unavailable through `/api/v1` and the browser Gateway.

## Privacy and security

- Tenant/public Roommate views do not expose risk flags, review priority, partial evaluation, risk evidence, reporter identities, blocker identities, reverse-block direction, email, phone, challenge/OTP/provider data, verification timestamps, or raw admin evidence.
- Admin risk evidence is an allowlisted, bounded set of IDs/counts/window timestamps and the account creation time needed for the frozen new-account rule.
- Risk summary and review priority occur only on admin report DTOs and admin frontend surfaces.
- Cross-account verification fields are rejected; verification identity comes from the authenticated principal.
- Challenge rows are locked for confirm/resend, store only a keyed digest, expire, consume after five failed attempts, and cannot be replayed after consumption.
- Email and phone request/confirm routes share one per-account/IP rate-limit scope of five attempts per 15 minutes.
- Roommate write validation rejects unknown fields, invalid IDs/enums/dates, unsafe content, and blank messages according to existing rules.
- Source/log searches found no raw Roommate message body, normalized body, report body, OTP, email, phone, provider secret, credentials, or database URL in production logs. Verification-adapter logs contain only route, status, duration, channel, safe reason, and provider status.

## Failure modes

| Failure | Behavior | Result |
| --- | --- | --- |
| Identity public facts unavailable | Discovery/detail fail closed with `DEPENDENCY_UNAVAILABLE`; no badge or account age is fabricated | PASS |
| Identity risk projection unavailable | Queue remains usable, Engagement-owned flags remain, `partialEvaluation=true`, and the new-account flag is not fabricated | PASS |
| Listing unavailable | A linked intent that requires Listing facts returns `DEPENDENCY_UNAVAILABLE`; explicit query intent that needs no fallback remains usable | PASS |
| Verification provider unavailable | `503 PROVIDER_UNAVAILABLE`; PostgreSQL state remains unverified | PASS |
| PostgreSQL mutation error | Existing transaction suites verify rollback without partial interest, message, block, report, connection, or read-state mutation | PASS |

## Concurrency and PostgreSQL

Only disposable databases whose names begin with `rentmate_test` were used. No development, staging, production, or compatibility database was reset or dropped.

| Suite/scenario | Result |
| --- | --- |
| Identity migration/setup on `rentmate_test_identity_v2` | PASS |
| Verification resend/resend | PASS |
| Verification resend/confirm | PASS |
| Verification confirm/confirm | PASS |
| Verification contact-change/confirm | PASS |
| One usable challenge per account and channel | PASS |
| Provider failure cannot create verified state | PASS |
| Engagement foundation/lifecycle on `rentmate_test_roommate_v2_risk` | PASS (3 tests) |
| Engagement interest/concurrency | PASS (12 tests) |
| Engagement messaging/block/report/risk safety | PASS (6 tests) |

## Priority and pagination

The admin report service loads the complete filtered Roommate report set in bounded batches, computes risk, applies the optional priority filter, sorts globally by `ELEVATED` before `STANDARD`, then `createdAt ASC`, then report ID ascending, and only then slices the requested page. Release assertions cover page 1, page 2, both priority filters, stable page metadata, no duplicate report IDs, and no missing report IDs.

## Verification results

| Area | Command/evidence | Result |
| --- | --- | --- |
| Shared | `npm run typecheck` | PASS |
| Identity focused | Five Roommate/verification files | PASS (15/15) |
| Identity full | `npm test` | PASS (57/57) |
| Identity PostgreSQL | `npm run test:tenant-verification:database` | PASS (5/5) |
| Listing full | `npm test` | PASS (40/40) |
| Engagement focused | Twelve Roommate files after release-gate assertions | PASS (55/55) |
| Engagement full | `npm test` after release-gate assertions | PASS (107/107) |
| Engagement PostgreSQL | Four existing Roommate database scripts | PASS (21/21) |
| Gateway | `npm test` | PASS (5/5) |
| Real Gateway/browser | `npm run test:roommate-v1:e2e` | PASS (5/5) |
| Frontend focused | Roommate features and API clients | PASS (63/63) |
| Frontend full | `npm test` | PASS (697/697 across 114 files) |
| Frontend typecheck | `npm run typecheck` | PASS |
| Frontend lint | `npm run lint` | PASS |
| Production build | `NEXT_PUBLIC_API_BASE_URL=https://api.rentmate.example; npm run build` | PASS; 43 static pages generated |

The production origin above is the public, non-secret placeholder documented in the repository deployment guide and is supplied only to the build process.

## Known non-blocking repository/environment findings

- The task text names `docs/requirements/ROOMMATE_BLOCK_MANAGEMENT_API_ADDENDUM.md`; the authoritative addendum is actually tracked at `docs/api/ROOMMATE_BLOCK_MANAGEMENT_API_ADDENDUM.md`. This is a task-path documentation typo only.
- The repository-wide Prettier check has unrelated historical formatting drift. V2-06 files are checked and formatted only in scope; unrelated files are not rewritten.
- The stored `TEST_DATABASE_URL` value failed authentication in this shell. The database name was independently verified, and the existing repository test helpers were run with process-only credentials against the same disposable test database. No URL or credential was printed.
- The initially running microservice images predated the V2 routes. Rebuilding the current Identity, Listing, Engagement, and Gateway images resolved the local `404` probes; no source fix or data reset was needed.
- Browser E2E emitted existing non-failing Next.js development warnings for one Listing LCP image and the root smooth-scroll declaration. They do not affect Roommate V2 correctness or the successful production build.

## Release readiness

| Area | Status | Evidence |
| --- | --- | --- |
| Compatibility | PASS | Exact eight dimensions, exhaustive matrix tests, no score/ranking/persistence |
| Verification | PASS | HTTP/service/database/concurrency and provider-failure tests |
| Risk/admin | PASS | Exact seven flags, bounded evidence, explicit moderation, global priority pagination |
| Tenant frontend | PASS | 63 focused tests plus real browser flows |
| Admin frontend | PASS | Neutral priority/partial copy, seven labels, explicit action tests |
| Authorization | PASS | Route guards, ownership/participant database tests, negative Gateway/HTTP tests |
| Privacy | PASS | DTO allowlists, internal-route isolation, log/source audit |
| PostgreSQL | PASS | 26 Identity and Engagement database tests on disposable databases |
| Failure modes | PASS | Identity/Listing/provider/database error evidence |
| Gateway | PASS | 5 tests, real probes, and 5 browser flows |
| Production build | PASS | Optimized Next.js build with documented safe HTTPS origin |
| V1 regression | PASS | 107 Engagement tests, 21 Roommate database tests, and 5 real browser tests |

Roommate V2 is release-ready when this evidence file and the release-gate regression tests are the only V2-06 changes staged.
