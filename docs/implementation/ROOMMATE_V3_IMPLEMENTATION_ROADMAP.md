# RentMate — Roommate V3 Implementation Roadmap

Status: **APPROVED — FROZEN FOR IMPLEMENTATION**

Specification: `docs/requirements/ROOMMATE_V3_SPECIFICATION.md`

Baseline checkpoint: `68cbf3d8edcea0edc2c6713ccb7c3f7ea00e304d` (`hoan thien tich hop roommate v2`)

## 1. Roadmap rules

Roommate V3 is implemented through exactly eight bounded milestones. A future request must name exactly one `ROOMMATE-V3-*` milestone. Complete, test, review, and checkpoint that milestone before beginning another.

For every milestone:

1. Read `AGENTS.md`, the full V3 specification, this roadmap milestone, and the referenced V1/V2 contracts.
2. Verify milestone dependencies from code, tests, Git history, and release evidence; ordering alone is not proof.
3. Inspect `git status --short` and preserve unrelated modified, staged, and untracked files.
4. Implement only allowed scope and inseparable support.
5. Use fake/mocked AI providers in ordinary automated tests.
6. Run milestone-specific tests and the narrow relevant regression suite.
7. Inspect the complete diff and `git diff --check`.
8. Stage only explicit milestone files; never use `git add .` or `git add -A`.
9. Create one Vietnamese checkpoint commit without diacritics only when all done conditions pass and the user has authorized implementation/commit behavior.
10. Do not push and do not auto-start the next milestone.

The V3 specification is frozen. A genuine contract conflict stops the conflicting work and must be reported; implementation convenience is not permission to change product behavior.

## 2. Milestone summary

| Milestone | Objective | Dependency | Checkpoint message |
| --- | --- | --- | --- |
| `ROOMMATE-V3-01` | AI infrastructure, provider boundary, schemas, config, errors, capability route, and test foundation | Roommate V2 release checkpoint | `xay dung nen tang ai cho roommate` |
| `ROOMMATE-V3-02` | Natural-language preference preview and owner confirmation UX | V3-01 | `them phan tich nhu cau roommate bang ai` |
| `ROOMMATE-V3-03` | Separate bounded semantic recommendation API and tenant surface | V3-01; V3-02 checkpoint complete in sequence | `them goi y roommate theo ngu nghia` |
| `ROOMMATE-V3-04` | On-demand grounded compatibility explanation and deterministic fallback UX | V3-01; V2 compatibility | `them giai thich tuong thich bang ai` |
| `ROOMMATE-V3-05` | Async text safety worker, minimum persistence, and shadow mode | V3-01; existing V1/V2 message safety | `them phan tich an toan ai cho tin nhan` |
| `ROOMMATE-V3-06` | Tenant safety warnings and separate admin report integration | V3-05 | `tich hop canh bao ai vao roommate` |
| `ROOMMATE-V3-07` | Golden evaluation, adversarial security, privacy-safe observability, and controlled rollout | V3-02 through V3-06 | `kiem thu va kiem soat ai roommate` |
| `ROOMMATE-V3-08` | Cross-service integration, PostgreSQL verification, browser flows, build, and release gate | V3-01 through V3-07 | `hoan thien tich hop roommate v3` |

## 3. `ROOMMATE-V3-01` — AI infrastructure and provider foundation

### Objective

Create the smallest server-side AI foundation required by all V3 capabilities without changing Roommate business behavior or requiring AI for service startup.

### Dependencies

- Roommate V2 release checkpoint and evidence are verified.
- Existing shared config, error middleware, rate limiter, logger, Gateway routing, and Engagement wiring are understood.

### Allowed scope

- Add an Engagement-owned `roommate-ai` module boundary.
- Define `AiProvider`, task input/output/usage types, deterministic `FakeAiProvider`, and the sole initial production adapter `GeminiAiProvider`.
- Use one non-streaming, single-turn Gemini `generateContent` request with `candidateCount: 1`, supported response JSON Schema, bounded `maxOutputTokens`, application timeout/abort, no tools/grounding/files/cache/chat/session/state, and sanitized responses.
- Add versioned prompt/schema files and independent runtime validation with unknown-field rejection.
- Add master/per-feature gates, safety mode, provider/model/timeout/concurrency/rollout validation for `ROOMMATE_AI_PROVIDER=DISABLED|GEMINI`, `GEMINI_API_KEY`, and the four frozen `ROOMMATE_AI_*_MODEL` variables.
- Add stable AI application errors from the specification.
- Add `GET /api/v1/roommate-ai/capabilities` for active tenants.
- Add Gateway routing for `/api/v1/roommate-ai` and contract tests.
- Add `.env.example` and Docker Compose placeholders only; no real value or secret.
- Establish privacy-safe provider metrics/log helpers and an evaluation fixture/test harness shell with no feature corpus yet.

### Forbidden scope

- Parser, recommendation, explanation, or safety business logic.
- Database migration or AI persistence.
- Frontend AI surface beyond types strictly required to test capability transport; normally no frontend UI.
- Real provider calls in ordinary tests.
- Generic AI microservice/framework, provider SDK dependency unless repository inspection proves `fetch` insufficient, or tools/agents/RAG.
- Alternative provider adapters, multi-provider routing, or provider fallback adapters.
- Logging prompts, provider bodies, API keys, model input, or high-cardinality user data.

### Service ownership and expected areas

- Engagement: provider/config/prompt/schema foundation and capability controller/routes.
- Shared: only narrowly required generic error/config support.
- Gateway: one additive prefix and routing tests.
- Runtime docs/config examples: server-only placeholders.

Expected areas include:

```text
services/engagement-service/src/modules/roommate-ai/**
services/engagement-service/src/server.ts
services/shared/src/runtime/config/env.ts or an Engagement-local AI config loader
services/shared/src/runtime/shared/errors/application-error.ts
services/api-gateway/server.mjs
services/api-gateway/test/gateway.test.mjs
.env.example
docker-compose.microservices.yml
focused service tests
```

Prefer an Engagement-local AI config loader if extending the shared `RuntimeConfig` would force unrelated services to validate Engagement-only secrets.

### API impact

- Add `GET /api/v1/roommate-ai/capabilities` exactly as specified.
- Add error codes `AI_FEATURE_UNAVAILABLE`, `AI_PROVIDER_UNAVAILABLE`, `AI_TIMEOUT`, and `AI_OUTPUT_INVALID` with frozen statuses.
- No existing response shape changes.

### Database impact

None.

### Privacy and security checks

- AI-disabled startup in development/test/production-shaped config.
- Enabled config rejects missing/placeholder Gemini key, missing model, invalid timeout/concurrency/mode, and any browser/public key exposure; `NEXT_PUBLIC_GEMINI_API_KEY` is forbidden.
- Capability DTO exposes booleans only.
- Gemini adapter tests assert one single-turn `generateContent` call, `candidateCount: 1`, supported strict schema, bounded output tokens, timeout/abort, no tools/grounding/files/cache/chat/session/state, controlled retries, and no raw errors.
- Source/log/browser-bundle scans for provider key/model input leaks.
- Provider processing and retention satisfy the approved RentMate deployment privacy contract; no adapter-specific storage flag is assumed.
- Real Gemini calls are excluded from ordinary CI. Any manual V3-01 probe is opt-in and synthetic only; real/private content requires the later paid/commercial privacy and rollout gates.

### Tests and checks

- Config unit matrix for disabled and each enabled feature.
- Provider success, timeout, transport, `429`, `4xx`, `5xx`, refusal, empty/malformed/extra-field output, and abort tests.
- Prompt/schema version and unknown-field tests.
- Capability authorization and response tests.
- Gateway route/internal-isolation tests.
- Engagement/shared/Gateway typecheck and focused tests.
- Scoped Prettier and `git diff --check`.

### Done conditions

- AI-disabled Engagement behaves like V2 and starts without a key.
- A fake provider can execute a strict structured task through the foundation.
- `GeminiAiProvider` is isolated and sanitized; no parser, recommendation, explanation, safety business logic, or database change exists yet.
- Capability route works through Gateway and exposes no provider detail.
- No migration or unrelated change exists.
- One checkpoint commit: `xay dung nen tang ai cho roommate`.

## 4. `ROOMMATE-V3-02` — Natural-language preference parsing

### Objective

Deliver the complete owner-controlled natural-language preview flow for profile and request forms, with no silent mutation or persistence of AI input/output.

### Dependencies

- `ROOMMATE-V3-01` completed and checkpointed.
- Existing profile/request validators and frontend owner forms verified.

### Allowed scope

- Implement parser input normalization and exact PROFILE/REQUEST allowlists.
- Build versioned parser prompt/schema and server-side candidate/evidence-range validation.
- Add `POST /api/v1/roommate-ai/preference-previews` with the frozen authorization, rate limits, response, and errors.
- Add synthetic Vietnamese/English/mixed parser fixtures.
- Add frontend API/types and a compact owner-only parser panel on existing profile and request create/edit surfaces.
- Support review, confidence labels, unresolved ranges, edit/remove, apply-to-form, ordinary explicit form save, and all degraded states.
- Keep entered text in component memory only for the active UI session.

### Forbidden scope

- Automatic profile/request write, background parse, or provider call on keystroke.
- Extraction of `intro`, `note`, `listingId`, IDs, contact, verification, risk, protected traits, or unknown future fields.
- Persisting parser input/output in database, URL, local storage, analytics, or log.
- Semantic recommendation, compatibility explanation, safety analysis, or saved feedback.
- Changes to existing profile/request mutation contracts.

### Service ownership and expected areas

- Engagement `roommate-ai` parser prompt/schema/service/validation/controller/routes and tests.
- Gateway tests for POST body passthrough and errors; existing prefix should route after V3-01.
- Frontend Roommate profile/request form components, API/types, and focused tests.

### API impact

- Add `POST /api/v1/roommate-ai/preference-previews` exactly as specified.
- No existing mutation endpoint change.

### Database impact

None.

### Privacy and security checks

- No input/preview in database, log, metric, URL, or local storage.
- Protected/sensitive ranges become unresolved with no candidate.
- Prompt injection cannot emit new fields or mutate data.
- Unauthorized roles and inactive accounts cannot call the endpoint.
- Provider errors and invalid output contain no raw text/body.

### Tests and checks

- PROFILE and REQUEST happy paths for Vietnamese, English, and mixed text.
- NFC/whitespace/code-point length/control-character/unknown-field validation.
- HIGH/MEDIUM/LOW confidence and evidence-range bounds.
- Ambiguous, conflicting, unsupported, and protected content.
- Provider invalid enum/date/range/extra field/evidence reference and timeout/failure.
- Regression assertion that parsing creates/updates no profile or request row.
- Frontend loading, preview, edit/remove, low-confidence non-selection, apply, explicit save, `422`/`429`/`502`/`503`/`504`, accessibility, responsive states.
- Focused Engagement/Gateway/frontend tests, relevant typecheck/lint, scoped Prettier, production build if shared rendering is affected, and `git diff --check`.

### Done conditions

- Tenant can convert natural text into an editable structured preview and must still submit the existing authoritative form.
- Unsupported/protected content does not become a field.
- Manual form remains fully usable with AI disabled/down.
- No persistence or contract drift exists.
- One checkpoint commit: `them phan tich nhu cau roommate bang ai`.

## 5. `ROOMMATE-V3-03` — Semantic recommendation

### Objective

Deliver a separate AI-assisted recommendation surface whose candidates remain an exact subset of V1/V2 eligibility and whose ordering is application-owned, bounded, explainable, and non-discriminatory.

### Dependencies

- `ROOMMATE-V3-01` completed and checkpointed.
- `ROOMMATE-V3-02` checkpoint complete in roadmap sequence.
- Existing V2 compatibility and discovery integration tests pass before edits.

### Allowed scope

- Extract/reuse one centralized discovery eligibility/data-loading path so ordinary discovery and recommendation cannot drift.
- Select at most 30 newest eligible candidates after existing filters.
- Minimize/redact approved profile intro/request note and use opaque provider tokens.
- Implement the exact approved semantic concept taxonomy, conflict handling, evidence validation, and deterministic ranking tuple.
- Add `POST /api/v1/roommate-ai/recommendations` and its rate limits/errors.
- Return at most ten existing participant-safe request DTOs with closed reason codes and versions; return a structured empty result for insufficient evidence.
- Add a separate frontend AI recommendation tab/panel with reasons, V2 compatibility, ordinary request navigation, session-only dismissal, edit-preferences action, and deterministic discovery fallback.

### Forbidden scope

- Modifying `GET /api/v1/roommate-requests`, its filters, sort, pagination, or DTO.
- AI-generated candidate eligibility, user-facing percentage/score, persisted rank/embedding/profile, vector database, or recommendation cache.
- Use of identity, verification, safety, risk, block/report, moderation, message, protected, exact location, or private listing data as semantic input/rank.
- Automatic interest creation, automatic profile/request change, or learned personalization.
- Database migration.

### Service ownership and expected areas

- Engagement Roommate discovery policy/repository/service and `roommate-ai` recommender.
- Existing Identity and Listing clients are reused without projection changes.
- Gateway endpoint tests.
- Frontend Roommate discovery/recommendation components, API/types, and tests.

### API impact

- Add `POST /api/v1/roommate-ai/recommendations` exactly as specified.
- Existing discovery API remains byte-for-byte contract compatible except internal refactoring with regression proof.

### Database impact

None. Recommendation, semantic concepts, overlap counts, order, and dismissals are not persisted.

### Privacy and security checks

- Provider input allowlist snapshot test; forbidden fields absent.
- Opaque candidate tokens cannot be substituted or duplicated.
- Provider output references only supplied candidates/evidence ranges/concepts.
- Eligibility and authorization are rechecked before DTO mapping.
- Protected-attribute counterfactual tests require unchanged output order/reasons.
- No cache can leak one tenant's candidate context to another.

### Tests and checks

- Exact V1/V2 eligibility subset: inactive, hidden, blocked, expired, matched, own, incomplete-profile, active-connection, unavailable-listing cases.
- Existing discovery ordering and pagination regression.
- Candidate window 30, output limit 10, stable tie-breakers, at least one semantic overlap requirement.
- Concept allowlist/conflict/evidence range and V2 important-difference handling.
- Provider timeout, malformed, unknown candidate/concept, refusal, insufficient evidence, dependency failure, and budget/rate-limit cases.
- Frontend separate-surface labeling, no score, reasons, dismissal session, empty/fallback/error/loading/accessibility/responsive behavior.
- Focused Engagement/Gateway/frontend tests, relevant PostgreSQL discovery regression if repository queries change, typecheck/lint, scoped Prettier, build, and `git diff --check`.

### Done conditions

- Recommendation results can never exceed the eligible pool or alter ordinary discovery.
- Rank is the frozen deterministic tuple; no model score is exposed/persisted.
- Only approved lifestyle concepts and V2 evidence influence reasons/order.
- AI failure routes the tenant to ordinary discovery.
- One checkpoint commit: `them goi y roommate theo ngu nghia`.

## 6. `ROOMMATE-V3-04` — Grounded compatibility explanation

### Objective

Turn current deterministic V2 compatibility evidence into optional localized prose without sending private source text or changing the evidence.

### Dependencies

- `ROOMMATE-V3-01` completed and checkpointed.
- V2 compatibility rules/integration remain green.
- V3-03 checkpoint complete in roadmap sequence.

### Allowed scope

- Add versioned explanation prompt/schema/service and strict evidence-reference validation.
- Recompute V2 compatibility server-side for the current authorized caller/request.
- Add `POST /api/v1/roommate-requests/:requestId/ai-explanation` with frozen rate/error behavior.
- Add explicit “AI explanation” action on request detail; render generated summary/cautions separately from V2 facts.
- Add deterministic V2 fallback for every disabled/error/timeout/invalid-output state.

### Forbidden scope

- Automatic generation on discovery/card/page load.
- Sending profile intro, request note, identity, contact, verification, listing, message, report, block, risk, or moderation data.
- Caching/persisting explanation or provider response.
- Personality diagnosis, match guarantee, trust/safety claim, new compatibility dimension, or V2 override.
- Database migration.

### Service ownership and expected areas

- Engagement `roommate-ai` explainer and current Roommate detail orchestration.
- Existing compatibility engine remains the sole evidence source.
- Gateway route test under the existing roommate-request prefix.
- Frontend request detail/API/types/tests.

### API impact

- Add `POST /api/v1/roommate-requests/:requestId/ai-explanation` exactly as specified.
- No existing request-detail/compatibility field changes.

### Database impact

None.

### Privacy and security checks

- Provider-input test proves only V2 version/category/dimensions/codes/locale are present.
- Every output reference and caution maps to supplied evidence.
- Prompt injection is impossible through raw user text because none is sent.
- Existing block/visibility/active-role rules run before provider call.

### Tests and checks

- Vietnamese/English grounded success for all V2 outcomes and insufficient-data category.
- Fabricated/missing/duplicate reference, caution on unsupported dimension, excessive length, extra field, refusal, timeout, provider failure.
- `IMPORTANT_DIFFERENCE` mention and no unsupported certainty/personality/safety assertions.
- Blocked/non-visible/non-owner/anonymous/wrong-role matrix.
- Frontend explicit action, AI label, V2 always visible, retry/fallback/error/loading/accessibility/responsive cases.
- Focused Engagement/Gateway/frontend tests, V2 compatibility regression, typecheck/lint, scoped Prettier, build, and `git diff --check`.

### Done conditions

- Generated text is on-demand, bounded, localized, and fully traceable to current V2 evidence.
- A failed explanation never hides or changes V2 compatibility.
- No private source text or persistence is introduced.
- One checkpoint commit: `them giai thich tuong thich bang ai`.

## 7. `ROOMMATE-V3-05` — Safety analysis foundation and shadow mode

### Objective

Build durable, concurrent, post-send text safety analysis in Engagement and operate it in `OFF`/`SHADOW` without changing tenant chat delivery or enforcement.

### Dependencies

- `ROOMMATE-V3-01` completed and checkpointed.
- V1/V2 message, notification, block, report, moderation, risk, and PostgreSQL concurrency suites are green before edits.
- V3-04 checkpoint complete in roadmap sequence.

### Allowed scope

- Create one forward Engagement migration for `roommate_message_ai_safety_analyses` and the message scan index exactly as specified.
- Add repository claim/lease/complete/fail/retry/cleanup operations using parameterized SQL and short transactions.
- Add a bounded Engagement worker/scheduler with multi-instance-safe compare-and-set behavior and no provider call in a transaction.
- Discover eligible messages missing the current analysis version without changing the send transaction.
- Add redaction, request-local message tokens, same-thread context selection, deterministic pre-filter, exact seven signals, evidence validation, and deterministic three-state outcome derivation.
- Add versioned safety prompt/schema and fake provider tests.
- Implement `OFF` and `SHADOW`; persist minimum metadata for all completed outcomes and sanitized terminal failures.
- Add privacy-safe queue/provider/outcome metrics and retention cleanup.

### Forbidden scope

- Tenant warning DTO/UI or admin report DTO/UI; those belong to V3-06.
- Any synchronous provider call or analysis-row insert in the message-send transaction.
- Any message delivery failure caused solely by AI/provider state.
- Raw prompt/response/message snapshot/reason prose/provider body/user ID columns or logs.
- New V2 risk flag, V2 priority change, notification, report, block, moderation, or enforcement action.
- External URL fetch, attachments, or analysis outside RentMate Roommate messages.
- Identity/Listing migration.

### Service ownership and expected areas

- Engagement migration, Roommate AI safety repository/service/worker/config/server wiring and tests.
- Existing Roommate safety service is touched only where required for read-only future projection seams or direct regression.
- No Gateway/frontend API impact yet.

### API impact

None in this milestone. `SHADOW` results are internal and do not alter tenant/admin DTOs.

### Database impact

- One new Engagement table: `roommate_message_ai_safety_analyses`.
- One scan index on `roommate_messages(created_at, id)` if query-plan evidence confirms it is required by the frozen worker design.
- Unique `(message_id, analysis_version)`, finite checks, bounded arrays/attempts, indexes for pending work/lease/retention.
- Old migrations remain immutable; no raw payload persistence.

Before destructive database tests, verify and use only a disposable Engagement test database whose name matches repository safety conventions. Never drop/reset development, compatibility, staging, or production databases.

### Privacy and security checks

- Context contains only current/up-to-five prior visible messages from one interest and opaque local tokens.
- Typed redaction removes actual contact/OTP/account/URL/secret values while retaining classification meaning.
- No unreported chat is made human-readable to an admin by this milestone.
- Provider output cannot select outcome/enforcement; server derives outcome.
- Logs/metrics/table schema contain no forbidden raw content.

### Tests and checks

- Migration schema/constraint/index/rollback and clean migration order.
- Claim races across workers, expired lease recovery, no double completion, unique version dedupe, max two attempts, retryable/non-retryable mapping, cleanup retention.
- Message send transaction succeeds when AI is off, provider down, worker down, or analysis insert/complete fails.
- Provider is never called inside a database transaction.
- All seven signals, exact outcome rules, `NO_WARNING`, ordinary payment false positives, OTP/credential strength, context/redaction/evidence grounding.
- `OFF` creates no work; `SHADOW` creates/persists work but returns no tenant/admin output.
- V1/V2 message pagination/read/notification/block/report/moderation/risk regression.
- Focused/full Engagement tests, disposable PostgreSQL safety/concurrency suites, typecheck, scoped Prettier, `git diff --check`.

### Done conditions

- Async analyses are durable, deduplicated, bounded, recoverable, and retention-limited.
- Chat persistence/delivery does not depend on provider latency or availability.
- Shadow analysis is invisible to tenants and does not change V2 risk/enforcement.
- No raw content is duplicated or logged.
- One checkpoint commit: `them phan tich an toan ai cho tin nhan`.

## 8. `ROOMMATE-V3-06` — Tenant warnings and admin integration

### Objective

Expose completed safety cautions to the correct message recipient and separately to admins in existing authorized report contexts, while keeping all enforcement human-driven.

### Dependencies

- `ROOMMATE-V3-05` completed and checkpointed with disposable PostgreSQL evidence.
- Existing tenant conversation/report and admin Roommate report UI/actions are green.

### Allowed scope

- Add caller-specific nullable `safetyWarning` to Roommate message DTO mapping.
- Add nullable `aiSafetySummary` to existing admin Roommate report queue/detail DTOs.
- Preserve V2 `riskSummary`, priority, ordering, pagination, and evidence.
- Add frontend API/types, message warning, conversation high-caution banner, curated localized copy, safety tips, and message Report shortcut.
- Poll/revalidate messages using the frozen visible-page 5-second/30-second policy.
- Add a separate AI safety panel/tag to existing admin report surfaces; show underlying authorized evidence and existing explicit moderation controls.
- Implement stable tenant rollout cohort behavior for `TENANT` mode.

### Forbidden scope

- Showing safety results to sender, public/candidate surfaces, landlords, other tenants, or an admin outside existing report authorization.
- Showing `NO_WARNING` as a safety badge/guarantee.
- Changing V2 flags, `reviewPriority`, queue sorting/filtering, report lifecycle, moderation actions, or notification behavior.
- AI-generated warning prose or generative admin summary.
- Automatic hide/block/ban/deactivate/terminate/report/resolve/dismiss action.
- New database migration unless V3-05's approved schema is demonstrably defective and a new forward migration is separately approved.

### Service ownership and expected areas

- Engagement safety/message/admin report view mapping and controller DTOs.
- Gateway response passthrough tests.
- Frontend Roommate conversation, safety copy/components, report control, admin reports, API/types/tests.

### API impact

- Add nullable `safetyWarning` to existing message DTOs.
- Add nullable `aiSafetySummary` to existing admin Roommate report DTOs.
- No new warning mutation endpoint and no existing action contract change.

### Database impact

None planned. Read V3-05 analysis metadata only.

### Privacy and security checks

- Only the recipient receives a warning for counterpart-authored visible content.
- Sender, blocked/non-participant, wrong tenant, public, and landlord requests receive no signal/direction leak.
- Admin message IDs are bounded and belong to the report context.
- Shadow/off/non-cohort output remains null.
- Model/provider internals are never exposed to tenant; admin receives only the frozen audit metadata.

### Tests and checks

- Participant projection matrix for SELF/COUNTERPART, caution states, pending/failed/no-warning, hidden message, block, terminal thread, off/shadow/tenant cohort.
- Curated Vietnamese/English warning copy for seven signals and OTP rule.
- Warning dedupe, poll stop, banner priority, report shortcut target, no focus theft, non-color accessibility, reduced motion, responsive layouts.
- Admin separate AI/V2 panels, no priority/order mutation, authorized evidence and existing human actions.
- Provider unavailable/backlog leaves chat usable and static safety checklist present.
- Focused Engagement/Gateway/frontend tests, Roommate safety/risk regressions, frontend typecheck/lint, scoped Prettier, production build, and `git diff --check`.

### Done conditions

- Correct recipients receive neutral actionable warnings with no accusation or enforcement.
- Admin sees a separate bounded AI signal only while reviewing an existing report.
- V2 risk/priority and human moderation remain unchanged.
- AI off/shadow/down preserves the complete V1/V2 chat/report flow.
- One checkpoint commit: `tich hop canh bao ai vao roommate`.

## 9. `ROOMMATE-V3-07` — Evaluation, security, observability, and rollout

### Objective

Turn the implemented capabilities into measurable, adversarially tested, privacy-reviewed features that can safely progress from fake-provider tests to controlled Gemini rollout.

### Dependencies

- `ROOMMATE-V3-02` through `ROOMMATE-V3-06` completed and checkpointed.
- Application-owned versions and schemas are stable enough to evaluate.

### Allowed scope

- Create version-controlled synthetic/hand-authored golden datasets for parser, semantic recommendation, explanation, and safety.
- Include Vietnamese, English, mixed language, informal abbreviations, obfuscation, emoji, leetspeak, prompt injection, benign financial discussion, and protected counterfactuals.
- Implement deterministic evaluation runners/reports with sample counts and frozen metrics/thresholds.
- Complete privacy-safe observability for counts, latency, errors, fallbacks, token totals, queue age/depth, outcomes, and warning/report actions.
- Add budget/circuit-breaker behavior and provider-project deployment checklist.
- Add stable percentage rollout and mode-transition tests.
- Add an opt-in manual/staging `GeminiAiProvider` suite using synthetic fixtures only.
- Add privacy disclosure/release checklist documentation directly required by V3.

### Forbidden scope

- Real private user messages, real OTP/account/contact details, production dumps, or raw prompts/responses in fixtures/artifacts.
- Default CI dependency on paid quota, network, real provider, or secret.
- Online training, automatic prompt/model update, user-behavior learning, persisted feedback, or unapproved feature expansion.
- Relaxing a threshold to make a failing model pass without explicit reviewed evidence/version change.
- Generative admin summary, attachment, URL reputation, or RoommateGroup.

### Service ownership and expected areas

- Engagement AI eval/security/observability tests and bounded metrics.
- Repository test fixtures/scripts under existing conventions.
- Frontend/Gateway security regression where outputs cross those boundaries.
- V3 evaluation/security/rollout evidence documentation.

### API impact

No new product endpoint planned. Existing capability booleans and AI errors reflect rollout/budget state. Any new feedback/eval endpoint is out of scope.

### Database impact

None planned. Evaluation results are build/release artifacts, not product tables.

### Privacy and security checks

- Automated source/log/fixture scans for prompts, provider bodies, secrets, sensitive examples, and high-cardinality labels.
- Cross-tenant candidate/message token substitution and cache-isolation tests.
- Prompt injection, output injection, schema smuggling, malformed Unicode, oversized inputs, and refusal handling.
- No URL fetch/tool execution path exists.
- Active paid/commercial Gemini eligibility, applicable terms/DPA/privacy/retention review, product disclosure, server-only key controls, and evidence that unpaid services never receive private data are deployment gates.
- Zero provider retention must not be claimed by default; if required, Gemini project/feature eligibility, configuration, and verification are an additional release gate.

### Tests and checks

- Run all four offline evaluation suites and produce versioned metric report with sample counts.
- Require all section 28 specification thresholds before marking complete.
- Verify `FakeAiProvider` remains the CI default and the manual Gemini command refuses missing explicit opt-in/config.
- Verify metric label allowlist and sanitized logs/errors across all failure categories.
- Verify per-feature call/input/output/concurrency/rate/budget limits.
- Verify OFF/SHADOW/TENANT and percentage cohort stability.
- Focused/full relevant service/Gateway/frontend tests, typecheck/lint, scoped Prettier, `git diff --check`.

### Done conditions

- Golden suites meet frozen thresholds with reviewable version/sample evidence.
- CI is deterministic, secret-free, and provider-independent.
- Observability and budget controls are useful without raw/high-cardinality data.
- Controlled rollout cannot silently expose shadow results or bypass capability gates.
- One checkpoint commit: `kiem thu va kiem soat ai roommate`.

## 10. `ROOMMATE-V3-08` — Integration and release gate

### Objective

Prove Roommate V3 works through real local service/Gateway/frontend boundaries, that safety persistence is correct under PostgreSQL concurrency, and that V1/V2 remain fully usable when AI is disabled or degraded.

### Dependencies

- `ROOMMATE-V3-01` through `ROOMMATE-V3-07` completed and checkpointed.
- Shadow-to-tenant promotion evidence satisfies the V3 specification if tenant warnings are being released.

### Allowed scope

- Add integration/browser/release evidence and fix only verified defects that directly block V3 release readiness.
- Use deterministic fake provider for automated end-to-end scenarios.
- Run optional manual `GeminiAiProvider` synthetic probes separately when credentials and explicit opt-in are intentionally available.
- Verify production-shaped config/build for both AI disabled and enabled-with-placeholder-safe validation.
- Create V3 release evidence documenting versions, evaluation, privacy, failure, concurrency, and rollback/disable behavior.

### Forbidden scope

- New product capability, V3.x feature, contract redesign, broad refactor, dependency upgrade, or unrelated defect fix.
- Real user content/provider secrets in tests/evidence/commits.
- Production/development database reset or destructive operation.
- Closing V3 solely on mocked unit tests.

### Service ownership and expected areas

- Existing service/Gateway/frontend integration and browser test suites.
- Disposable Engagement PostgreSQL test helpers.
- V3 release evidence documentation.
- Production source only when a reproduced V3 Core release defect requires the smallest fix.

### API impact

None planned. A new endpoint/field is a contract conflict and requires explicit approval.

### Database impact

No new migration planned. Apply all current Engagement migrations to a verified disposable test database and test the V3-05 schema/worker there.

### Required end-to-end flows

1. **Flow A — preference preview:** natural Vietnamese text → structured preview → edit/remove → apply to form → explicit existing mutation → persisted structured profile/request only.
2. **Flow B — recommendation:** separate AI surface → candidate subset/curated reasons → ordinary detail/interest → ordinary discovery order unchanged.
3. **Flow C — explanation:** request detail → explicit AI explanation → grounded references → provider timeout → V2 fallback remains.
4. **Flow D — safety shadow:** message commits immediately → async analysis persists → no tenant warning → authorized admin report receives separate AI summary only.
5. **Flow E — safety tenant:** message commits immediately → CAUTION/HIGH_CAUTION recipient warning → curated advice/report shortcut → explicit admin review/action only.
6. **Flow F — AI disabled:** profile/request/discovery/compatibility/interest/connection/chat/block/unblock/report/risk/admin flows operate as V1/V2 with no provider call.

### PostgreSQL and concurrency evidence

- Clean migration through the new Engagement migration on a disposable test database.
- Two workers claiming the same message/version produce one completed row and one warning projection.
- Lease expiry/recovery, retry/restart, cleanup/retention, and version uniqueness.
- Provider failure cannot roll back message/notification or create partial lifecycle state.
- Existing active-commitment, messaging, block/report, moderation, and V2 risk PostgreSQL suites remain green.

### Security/privacy release matrix

- Anonymous, inactive, wrong role, non-owner, blocked, hidden, non-participant, and admin-only negative cases.
- Cross-tenant recommendation/message token isolation.
- Prompt injection and malformed/extra-field/refusal output.
- No raw message/parser/semantic text, prompt/output, contact, OTP/account data, provider secret/body, or exact location in logs, metrics, responses, frontend bundle, fixtures, or release evidence.
- No external URL fetch, tool execution, automatic enforcement, V2 flag conversion, or V2 priority mutation.
- Production processing of private content uses only an approved paid/commercial Gemini project after privacy/DPA/retention review and disclosure; unpaid Gemini is synthetic-only.

### Required checks

- Full relevant Engagement tests and all Roommate focused suites.
- Engagement disposable PostgreSQL migration, lifecycle, interest/concurrency, messaging/safety, V2 risk, and V3 safety worker suites.
- Relevant Identity and Listing projection/regression tests; no V3 projection change expected.
- Full Gateway tests and real local Gateway API probes.
- Frontend focused Roommate V3/V2/V1 tests and critical browser E2E at 375, 768, 1024, and 1440 pixels.
- Shared/Engagement/Gateway/frontend typecheck as applicable.
- Frontend lint, scoped/full relevant Prettier, `git diff --check`, and production build.
- AI-disabled production-shaped startup/build.
- Provider disabled, unavailable, timeout, `429`, `5xx`, invalid output, budget exhaustion, queue backlog, and recovery cases.
- Versioned Vietnamese golden evaluation report meeting all thresholds.
- Optional manual Gemini synthetic suite reported separately; inability to run it does not make CI nondeterministic, but paid/commercial Gemini privacy and production readiness must be explicitly classified.

### Done conditions

- All five enabled V3 flows and the complete AI-disabled V1/V2 flow pass through real local boundaries.
- V3 PostgreSQL concurrency/retention behavior is proven on a verified disposable database.
- Privacy, authorization, prompt-injection, cost, latency, observability, and evaluation gates pass.
- Production frontend build and Gateway integration pass.
- V2 compatibility/verification/seven risk flags/human moderation and V1 lifecycle remain unchanged.
- Final diff contains only V3-08 release evidence/tests and release-blocking V3 fixes.
- One checkpoint commit: `hoan thien tich hop roommate v3`.

## 11. Cross-milestone contract guardrails

Every checkpoint review must explicitly confirm:

- no existing V1 discovery eligibility/order or lifecycle change;
- no V2 compatibility rule/dimension/outcome/category change;
- no Identity verification change;
- exactly seven unchanged V2 deterministic risk flags;
- V3 AI safety remains separate and cannot affect V2 priority;
- no automatic enforcement or hidden risk/match score;
- no user-facing numeric AI percentage;
- no cross-tenant context or protected-attribute ranking;
- no external chat monitoring, URL fetching, attachments, or RoommateGroup;
- AI disabled preserves V1/V2 and requires no provider secret;
- real Gemini provider remains optional/manual for CI;
- unrelated working-tree changes remain untouched.

## 12. Release boundary

Completing `ROOMMATE-V3-08` closes only V3 Core. It does not approve:

- generative admin evidence summaries;
- stored feedback or recommendation learning;
- advanced personalization/model routing;
- attachment/image/audio safety;
- URL reputation/fetching;
- cross-listing/general AI chat assistance;
- RoommateGroup.

Those remain V3.x or deferred and require a separate product decision/specification. Do not automatically begin `ROOMMATE-V3-01` or any later milestone from this planning task.
