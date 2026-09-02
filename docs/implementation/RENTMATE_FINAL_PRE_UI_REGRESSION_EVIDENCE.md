# RentMate — FINALIZATION-03 Pre-UI Regression Evidence

Date: 2026-09-02
Baseline commit: `fdb954ed3079630216fec70e9f7e5fb08a4260b7` (`chuan bi du lieu va moi truong demo rentmate`)

## Scope and topology

- This was a verification-only pass. No Roommate V1/V2/V3 contract, migration, API, schema, or UI redesign was introduced.
- Docker Compose services were healthy: PostgreSQL, compatibility Backend, Identity, Listing, Engagement, Gateway (`4001`), and Verification Delivery Adapter.
- `GET http://localhost:4001/api/health` returned HTTP 200 with a connected database.
- Frontend Roommate Playwright configuration targets Gateway `4001`; the legacy RM-054 compatibility browser configuration targets its own `4100` fixture as designed.
- Identity/Engagement disposable database suites used the configured disposable Identity test database. Compatibility backend database tests used the existing disposable `rentmate_test_rm054` database in a process-local override; `.env` was not modified.

## Migration and seed evidence

Source migration inventories and live database markers:

| Service | Migration files | Live marker |
| --- | ---: | --- |
| Identity | 6 | `user_auth_identities` exists in `rentmate_identity` |
| Listing | 7 | all four `availability_*` columns from migration 0007 exist in `rentmate_listing` |
| Engagement | 20 | `roommate_message_ai_safety_analyses` exists in `rentmate_engagement` |

The deterministic local seed completed twice. Both runs reported the same high-level state: 8 accounts, 10 listings, 4 inquiries, 3 Roommate requests, 2 interests, and 8 Roommate demo records.

## Automated checks

| Area | Command/result |
| --- | --- |
| Shared TypeScript | PASS |
| Identity full | PASS — 57/57 |
| Identity tenant-verification PostgreSQL | PASS — 5/5; guarded helper verified the disposable database before cleanup/migrations |
| Identity service TypeScript | PASS |
| Listing full | PASS — 40/40 |
| Listing TypeScript | PASS |
| Engagement full | PASS — 165/165 |
| Engagement TypeScript | PASS |
| Roommate foundation PostgreSQL | PASS — 2/2 |
| Roommate lifecycle PostgreSQL | PASS — 1/1 |
| Roommate interest PostgreSQL | BLOCKED — 0/12; every fixture request uses `moveInFrom=2026-09-01`, while the current business date is `2026-09-02` |
| Roommate safety PostgreSQL | PASS — 6/6 |
| Roommate AI safety PostgreSQL | PASS — 7/7 |
| Roommate AI safety projection PostgreSQL | PASS — 2/2 |
| API Gateway | PASS — 10/10 |
| Verification Delivery Adapter | PASS — 14/14 |
| Compatibility backend full | PASS — 173 files / 2032 tests |
| Compatibility backend database | PASS — 43 files / 341 tests on disposable `rentmate_test_rm054` |
| Compatibility backend TypeScript/lint | PASS / PASS |
| Frontend focused deterministic threads | PASS — 66 files / 460 tests |
| Frontend full deterministic threads | PASS — 115 files / 711 tests |
| Frontend TypeScript/lint | PASS / PASS |
| Frontend production build | PASS — Next.js compiled, typechecked, and generated all 43 routes using a non-localhost production-shaped API origin |
| Dedicated Roommate Gateway/browser E2E | PASS — 5/5 |
| Core RM-054 browser E2E | BLOCKED in the initial pass — 11 failed, 4 not run; see the preserved history and FINALIZATION-03B decision below |

The default frontend Vitest fork runner was not used for the release result because the repository documents its known hang; deterministic threads mode completed successfully.

## Seeded Gateway smoke

The concise smoke reached the real Gateway and passed:

- tenant login;
- listing search and detail;
- Roommate discovery and request detail;
- eight-dimension compatibility;
- pending interest;
- accepted connection and conversation;
- free-text message send (`201`);
- Roommate report (`201`);
- admin Roommate report queue.

The current local AI flags are not fully disabled: parser and semantic recommendation are enabled, while explanation and safety are disabled; no live Gemini request was made. With safety mode `OFF`, the seeded recipient warning is intentionally not projected. The sender own-message projection had no warning leak, admin `ROOMMATE_MESSAGE` report had the exact-message AI summary, and profile/request reports had no AI summary.

## Security and hygiene

- Tracked-source scan found no committed production Gemini/OpenAI credential, private key, or client-side Gemini key value. Matches are placeholders, configuration guards, documentation, or synthetic test fixtures.
- Localhost URLs, `console.log` in the structured logger, mocks, and temporary wording were reviewed as expected test/development infrastructure; no suspicious production finding was identified.
- Scoped Prettier for the current Identity test change: PASS.
- `git diff --check`: PASS.
- Repository-wide `npm.cmd run format:check`: BLOCKED by 42 pre-existing files (including existing Docker/config, frontend, service, and test files); no mass-formatting was performed.

## Failure classification

1. **Roommate interest PostgreSQL — STALE_TEST**. `roommate-interest.database.ts` has used a static `2026-09-01` start date since the V1 interest checkpoint. The current business clock is `2026-09-02`, so the frozen production validation correctly rejects the fixture before concurrency logic. No Roommate source change caused this.
2. **Core RM-054 browser — STALE_TEST / TEST_ENVIRONMENT**. The RM-054 helper still calls broad `getByLabel("Mật khẩu")` selectors that are ambiguous after the existing password-confirmation/toggle UI, and the core config includes the dedicated Roommate spec while its frontend runs against the separate `4100` compatibility fixture. The dedicated Roommate config and real Gateway suite pass. No source change occurred after the baseline commit.
3. **Identity profile database teardown — TEST_HARNESS**. The optional profile database helper drops `users` without first dropping newer Identity tables; its business assertion passed, but teardown returned PostgreSQL `2BP01`. The required tenant-verification database suite passed, and the helper was not changed.

The OAuth state test had a stale base64url final-character mutation that could leave decoded authenticated bytes unchanged. A deterministic leading-character mutation is kept as a test-only correction; runtime OAuth behavior, API contracts, and security semantics are unchanged.

## Final status

```text
P0 product regressions = 0
PRE_UI_FUNCTIONAL_BASELINE = GREEN
RENTMATE FINALIZATION-03 = READY_WITH_LEGACY_E2E_EXCEPTION
RM054_LEGACY_E2E = DEFERRED
FINAL_CURRENT_ARCHITECTURE_E2E = REQUIRED_AFTER_UI_REDESIGN
LIVE_GEMINI_FULL_REGRESSION = NOT_REQUIRED
```

The initial RM-054 browser failure is retained as a legacy-fixture exception, not rewritten as a passing product test. The current product Gateway/Identity topology and the dedicated Roommate browser flow are green, and no P0 product regression remains. The repository-wide format debt remains pre-existing and does not change the touched-file result.

## FINALIZATION-03A harness closure follow-up

The original failures above are retained as historical facts. The following targeted re-runs were performed after the harness-only corrections:

| Gate | Result |
| --- | --- |
| Roommate interest PostgreSQL | PASS — 12/12. The test now injects a stable test-local clock and derives the valid 29-day move-in window from its business date; production validation is unchanged. |
| Identity OAuth state | PASS — 3/3. The tamper test changes a leading base64url character, so authenticated bytes always differ. Runtime OAuth code is unchanged. |
| Roommate dedicated Gateway/browser E2E | PASS — 5/5. It remains isolated in `playwright.roommate-v1.config.ts` against Gateway `4001`. |
| Temporary `TENANT` safety projection | PASS — 2/2 PostgreSQL scenarios. The recipient receives the seeded `HIGH_CAUTION` projection; the sender does not receive its own classification; admin summaries remain exact-message-only. Default `ROOMMATE_AI_SAFETY_MODE=OFF` was not changed. |
| RM-054 core configuration | PARTIALLY RESOLVED. `playwright.config.ts` now ignores `roommate-v1-release.spec.ts`, leaving 10 intended RM-054 core tests. |

RM-054 remains blocked by a separate topology incompatibility: the current frontend registration form correctly requires and sends `displayName`, but the historic compatibility backend fixture on `4100` rejects that field as unknown. The real product Gateway/Identity topology accepts the current registration contract; this mismatch is limited to the legacy RM-054 fixture. A temporary Playwright request-rewrite experiment was rejected because it caused navigation hangs and was not retained.

Closing that final RM-054 gate safely requires an explicit decision to either provide a current-contract RM-054 fixture/topology or extend the legacy compatibility backend contract. Neither is a stale locator-only change, so no runtime source was modified in FINALIZATION-03A.

Formatting status for touched files remains `PASS`; repository-wide `npm.cmd run format:check` remains `PRE_EXISTING_DEBT` (42 historical files). `git diff --check` passed after this evidence update and must be rerun before any future checkpoint.

## FINALIZATION-03B legacy RM-054 exception closure

The release owner decision for the remaining RM-054 result is:

- `RM054_LEGACY_E2E = DEFERRED`.
- The historic `4100` compatibility fixture no longer represents the current frontend registration contract: the current form sends the required `displayName`, while that fixture accepts only its older email/password/phone shape and rejects the additional field. This is a test-topology mismatch, not a current Gateway or Identity regression.
- The current frontend contract, backend validation, Gateway routing, and Roommate V1/V2/V3 behavior are not weakened or rewritten to satisfy the stale fixture. The rejected request-rewrite experiment is not retained.
- `PRE_UI_FUNCTIONAL_BASELINE = GREEN` and `RENTMATE FINALIZATION-03 = READY_WITH_LEGACY_E2E_EXCEPTION` because all current-architecture gates are green and `P0 product regressions = 0`.
- After the approved UI redesign, a replacement current-architecture browser suite is required. It must exercise Browser → Next.js → Gateway `4001` → services → PostgreSQL across authentication, listing/search/detail, favorite/inquiry, landlord, Roommate, V2 compatibility, interest/connection, conversation, report/block, admin, and responsive behavior. The dedicated Roommate E2E may be reused for its covered scenarios.
- The legacy RM-054 result is retired only after that replacement suite passes; this checkpoint does not claim the old fixture passed and does not begin FINALIZATION-04.

The valid FINALIZATION-03A harness-only corrections are retained: a deterministic Roommate interest test clock, deterministic OAuth-state tampering, current-UI RM-054 selectors/form controls, and isolation of the dedicated Roommate Playwright project. No product source, migration, frozen specification, or roadmap was changed.
