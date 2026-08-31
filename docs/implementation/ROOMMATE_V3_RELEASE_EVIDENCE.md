# Roommate V3 Final Integration and Release Evidence

## 1. Evidence identity

- Milestone: `ROOMMATE-V3-08`
- Verification date: `2026-08-31`
- Release baseline: `e4a0a3426e3aa0de2c329c3e0b0d9782aafad5d8`
- Evaluation dataset: `ROOMMATE_V3_EVAL_2026_08_31`
- Automated provider: `FakeAiProvider`
- Real-provider status: `REAL_PROVIDER_STAGING_NOT_RUN`
- Test data: synthetic fixtures and local release-test accounts only
- PostgreSQL target: disposable test database `rentmate_test_identity_v2`

Approved V3 checkpoints:

| Milestone | Commit | Message |
| --- | --- | --- |
| V3-01 | `417bd2f68da0e8bbb61f80a10d1518af810cf8e1` | `xay dung nen tang ai cho roommate` |
| V3-02 | `c3bce8599b99e78e04970bf86358aaaeae1e8bd4` | `them phan tich nhu cau roommate bang ai` |
| V3-03 | `7253c25b88b287f5b1debc85bb7ce694c061ceea` | `them goi y roommate theo ngu nghia` |
| V3-04 | `0510e06be24749920d7afb6b8b8b30b6460bc2d5` | `them giai thich tuong thich bang ai` |
| V3-05 | `a1c2d5b9cc4d5cf322fc0da1bde6b6190d28b33e` | `them phan tich an toan ai cho tin nhan` |
| Typecheck hygiene | `8c06f7304e5d892efe8910072ef1d26c8782f549` | `sua loi typecheck roommate ai` |
| V3-06 | `2e6f808a856148cfd5a2e836dda91e41549b865e` | `tich hop canh bao ai vao roommate` |
| V3-07 | `e4a0a3426e3aa0de2c329c3e0b0d9782aafad5d8` | `kiem thu va kiem soat ai roommate` |

## 2. Final decisions

```text
ROOMMATE_V3_ENGINEERING_READY = YES
ROOMMATE_V3_ENGINEERING_RELEASE = READY
```

Engineering closure and production AI rollout are separate decisions. The repository and deterministic release matrix are ready to freeze V3 Core, but no approved real-provider staging, production SHADOW, or governance evidence was supplied.

```text
SHADOW_TO_TENANT_PRODUCTION_ROLLOUT = NOT YET APPROVED
PRODUCTION_PRIVATE_CHAT_AI_ROLLOUT = BLOCKED_PENDING_GOVERNANCE
PRODUCTION_TENANT_AI_ROLLOUT = NOT APPROVED
```

## 3. Frozen V3 Core inventory

| Milestone | Integrated capability | State |
| --- | --- | --- |
| V3-01 | Vendor-neutral provider boundary, disabled/Gemini configuration, strict structured output, sanitized errors, capability discovery | Integrated and frozen |
| V3-02 | Explicit natural-language preference preview with editable, non-persisted proposal | Integrated and frozen |
| V3-03 | Separate semantic recommendation over the existing eligible candidate set with deterministic application ordering | Integrated and frozen |
| V3-04 | On-demand explanation grounded only in recomputed V2 compatibility evidence | Integrated and frozen |
| V3-05 | Post-send asynchronous text-safety worker, minimum metadata, lease/retry/retention, OFF/SHADOW operation | Integrated and frozen |
| V3-06 | Recipient-only tenant warning and exact-message admin report projection with no enforcement | Integrated and frozen |
| V3-07 | Deterministic evaluation, adversarial security audit, rollout evidence, and governance separation | Integrated and frozen |

V3-08 adds no AI feature, public endpoint, provider capability, safety signal, outcome, ranking rule, moderation action, or persistence model.

## 4. Architecture boundaries

- Engagement Service remains the sole AI owner.
- `AiProvider` remains the provider-neutral boundary; `FakeAiProvider` is deterministic CI infrastructure and `GeminiAiProvider` is the only production adapter.
- Interactive parser, recommendation, and explanation calls are explicit tenant actions.
- Safety analysis is discovered after message commit by an Engagement worker. No provider call and no safety-row write occurs in the message-send transaction.
- Identity verification, Listing eligibility, V1 discovery/lifecycle, V2 compatibility, V2 risk, reports, blocks, and human moderation do not depend on AI.
- Gateway forwards only the approved browser routes and does not expose an internal worker or repository route.
- No AI microservice, agentic loop, provider tool, grounding, Files API, cache, stateful provider chat, or automatic moderation exists.

## 5. Public API inventory

| Method | Path | Authorization and Origin | Rate limit | Provider behavior | Persistence |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/v1/roommate-ai/capabilities` | Authenticated active tenant; safe read | Existing protected-read controls | Zero calls | None |
| `POST` | `/api/v1/roommate-ai/preference-previews` | Authenticated active tenant; allowed Origin required | 5/15 minutes and 30/day per tenant+IP | One bounded call only after body and feature validation | None |
| `POST` | `/api/v1/roommate-ai/recommendations` | Authenticated active eligible tenant; allowed Origin required | 3/15 minutes and 20/day per tenant+IP | At most one bounded call after ordinary eligibility produces the candidate window | None |
| `POST` | `/api/v1/roommate-requests/:requestId/ai-explanation` | Authenticated active tenant with existing request visibility/block checks; allowed Origin required | 5/15 minutes and 30/day per tenant+IP | Zero calls for `compatibility === null`; otherwise at most one bounded call | None |

Existing message and admin report reads have additive nullable `safetyWarning` and `aiSafetySummary` projections. They read persisted bounded metadata and make zero provider calls. Message send remains the existing endpoint and only schedules post-commit discovery indirectly. No additional V3 public route was found.

## 6. Authorization and privacy closure

Targeted HTTP, service, PostgreSQL, Gateway, and frontend tests cover anonymous, inactive tenant, active tenant, landlord, admin, unrelated tenant, blocked participant, sender, and recipient boundaries.

- AI actions are tenant-only; inactive authentication remains `401`, wrong role remains `403`.
- Recommendation candidates remain a subset of ordinary discovery and exclude blocked/ineligible tenants.
- Explanation reuses current request visibility and block rules.
- Message classification is never shown to its sender.
- Recipient warnings require the same Interest, recipient role, completed current-version analysis, `TENANT` mode, and rollout membership.
- Admin AI evidence exists only in an already authorized `ROOMMATE_MESSAGE` report and only for the exact reported message.
- `ROOMMATE_PROFILE` and `ROOMMATE_REQUEST` reports return `aiSafetySummary: null`.
- No BOLA/IDOR, cross-interest context, block-direction disclosure, or cross-message admin aggregation was found.

## 7. Provider and configuration state

The source, example environment, Compose configuration, configuration tests, local production-shaped containers, and frontend bundle were audited.

| State | Verified behavior |
| --- | --- |
| Provider omitted or `DISABLED` | Starts without a Gemini key; all capabilities are false; safety worker performs no discovery/provider work |
| Gemini feature enabled | Requires a non-placeholder server-side `GEMINI_API_KEY` and the model for each enabled capability |
| `NEXT_PUBLIC_GEMINI_API_KEY` present | Configuration is rejected |
| Safety default | `OFF` |
| Rollout default | `0` percent |
| CI | Uses fake/disabled provider; no external Gemini dependency |

The local release runtime was rebuilt from the current working tree without changing its database volume. Its verified state was `DISABLED`, feature gates false, safety `OFF`, and rollout `0`. An authenticated real-Gateway probe returned HTTP 200 with all four capability booleans false. Anonymous access returned `401 AUTHENTICATION_REQUIRED`.

No Gemini key, model configuration, provider endpoint, or private provider detail was found in the production frontend static bundle.

## 8. Provider payload minimization

| Capability | Provider input |
| --- | --- |
| Preference parser | Only bounded tenant-entered preference text, target, locale, and application prompt/schema metadata; no unrelated profile, contact, identity, or listing data |
| Recommendation | Only the frozen semantic allowlist from at most 30 already-eligible candidates, bounded/redacted intro/note, allowed structured intent, opaque candidate tokens, and locale |
| Explanation | Only recomputed deterministic V2 dimensions/explanation codes and locale; no raw profile/request text |
| Safety | Only redacted same-Interest context, at most six messages and 6,000 Unicode code points, opaque `M0..M5`, and `SENDER`/`COUNTERPART` roles |

Protected attributes are excluded from parser/recommendation/explanation decisions. Safety can classify only the seven frozen solicitation signals independently present in text; protected content itself is not a signal.

## 9. Database closure

V3 introduced exactly one product migration:

```text
0020_roommate_ai_safety_analyses.sql
```

It creates `roommate_message_ai_safety_analyses` and the bounded message scan index. V3-08 adds no migration, table, column, enum, trigger, or persistence model.

The table stores bounded work/audit metadata: message/version ownership, processing status/lease/attempts, application prompt/schema versions, provider/model identifier, application-owned outcome, bounded signal/evidence identifiers, sanitized error category, and timestamps. It stores no raw chat, prompt, provider response, contact value, OTP, account value, or tenant profile.

Disposable PostgreSQL verification applied current Engagement migrations inside isolated temporary schemas and proved:

- clean migration and version inventory;
- unique message + analysis version;
- foreign-key cascade of AI metadata only;
- ordered bounded discovery and claim leases;
- concurrent claim deduplication;
- lease recovery, finite retry, poisoned-item isolation, and stale cleanup;
- 180-day bounded retention cleanup;
- message commit before provider work;
- provider unavailable/timeout/invalid output isolation;
- recipient/sender/mode/rollout projection;
- admin exact-message projection and V2 risk/order invariance;
- V1 lifecycle, commitment, messaging, pagination, block, unblock, report, moderation, and rollback invariants.

## 10. V1/V2 non-regression

- Ordinary `GET /api/v1/roommate-requests` eligibility, filters, chronological ordering, pagination, and listing availability remain unchanged.
- AI recommendations are a separate explicit flow and do not alter ordinary discovery.
- V2 compatibility remains deterministic with the same eight dimensions, fixed order, explanations, category reducer, and null semantics. No numeric score or AI-controlled category exists.
- Email/phone verification remains factual, independent, provider-isolated, and AI-free.
- `ROOMMATE_RISK_V2_1` keeps exactly seven deterministic flags. V3 outcome/signal metadata does not enter `riskSummary`, `reviewPriority`, report ordering, or moderation.
- Message delivery remains independent of provider success.
- Blocks/reports preserve authorization, historical lifecycle, and explicit human action.
- No automatic hide, block, resolve, ban, or other enforcement was added.

The real local AI-disabled Playwright/Gateway flow created tenants and profiles, created linked and unlinked requests, used ordinary discovery, rendered V2 compatibility, created interests, sent and paged free-text chat, formed connections, reported and blocked, and retained usable responsive UI. Provider mode was `DISABLED`, so no Gemini adapter existed in that runtime.

## 11. V3 flow closure

### Flow A: preference preview

Explicit Vietnamese text is normalized and parsed through the provider boundary, strict output validation produces an editable proposal, LOW-confidence candidates remain unselected, and applying changes only the local structured form. Existing Save/Create/Update remains required; no AI service or preview route persists data.

### Flow B: recommendation

The ordinary eligible candidate set is bounded to 30 and converted to an allowlisted/redacted provider payload. Strict output validation accepts only known candidate tokens and reason concepts. The application performs the frozen deterministic sort and returns at most 10 participant-safe requests. Ordinary discovery remains unchanged and no provider score/rank leaks.

### Flow C: explanation

The service rechecks authorization/visibility and recomputes V2 compatibility. Provider evidence references must exactly match that object; V2 remains visible and authoritative. `compatibility === null` returns HTTP 200 `{ "data": null }` with zero provider calls. A compatibility object whose `category` is null remains valid evidence and may be explained neutrally.

### Flow D: safety shadow

Message commit is independent, the async worker claims current-version work, bounded validated metadata is persisted, and tenant warning projection stays null in `SHADOW`. An authorized exact-message admin report may read the separate bounded summary without changing V2 priority or moderation.

### Flow E: safety tenant

Only the recipient in the stable rollout cohort can see `CAUTION` or `HIGH_CAUTION`; the sender sees null. `HIGH_CAUTION` renders both inline guidance and a conversation banner. Curated tips and the explicit report shortcut remain available; no automatic action occurs.

### Flow F: AI disabled

Configuration, HTTP route, worker, PostgreSQL, full backend/frontend, real Gateway, and Playwright evidence jointly prove that request/profile/discovery/compatibility/interest/connection/chat/block/unblock/report/risk/admin behavior remains usable with zero Gemini calls.

## 12. Failure and degraded behavior

- Interactive disabled features return `AI_FEATURE_UNAVAILABLE` after normal validation/auth checks.
- Provider transport/quota/auth/permission/model/eligible 5xx failures map to sanitized `AI_PROVIDER_UNAVAILABLE`.
- Application deadline expiry maps to `AI_TIMEOUT`.
- Refusal, malformed JSON, extra fields, schema violations, and ungrounded evidence map to `AI_OUTPUT_INVALID`.
- Local limits return `RATE_LIMITED` before provider work.
- Parser failure preserves the tenant text/manual form.
- Recommendation failure preserves ordinary discovery.
- Explanation failure preserves and focuses deterministic V2 evidence.
- Safety failure/backlog leaves committed chat, static safety checklist, report/block, and V2 admin risk usable.
- Safety reads use persisted metadata and never call the provider.
- No raw provider error/body is returned, persisted, or logged.

## 13. Security and outbound audit

| Check | Result |
| --- | --- |
| Committed real Gemini secret | No |
| Client Gemini key/private model config | No; production static bundle matches: 0 |
| Raw chat or prompt logging | No |
| Raw provider response logging/persistence | No |
| Arbitrary URL fetch | No |
| Gemini outbound path | One fixed `generativelanguage.googleapis.com` `generateContent` path |
| Tools, grounding, search, Files, cache, stateful chat | No |
| Provider-controlled numeric ranking | No |
| Provider-controlled moderation mutation | No |
| Cross-interest safety context | No |
| Sender classification exposure | No |
| Admin cross-message aggregation | No |
| Automatic enforcement | No |

Prompt/output injection, unknown/extra fields, malformed/truncated/refusal output, protected-attribute counterfactuals, cross-candidate token substitution, unknown signals/evidence, and supplied URL text are covered by deterministic adversarial tests.

## 14. Observability

Operational logs/metrics are aggregate and bounded: capability/version, result or sanitized error category, schema-valid flag, duration, aggregate token counts, and allowed outcome/signal aggregates. Raw text, prompt, response, email, phone, OTP, account/bank value, URL, display name, tenant ID, message body, and provider body are not metric labels or AI worker log values.

The database can derive bounded status/error/outcome aggregates without retaining source text. Repository code is not presented as evidence of production latency, error rates, incident absence, or organizational approval.

## 15. Accessibility and responsive closure

- Parser preview, recommendation panel, explanation action/result, inline safety warning, `HIGH_CAUTION` banner, and admin summary use named controls/headings, non-color-only labels/icons/text, alerts or polite live regions where appropriate, and explicit buttons/links.
- Async safety polling does not move focus and pauses when the document is hidden.
- Keyboard actions remain ordinary buttons, links, textareas, checkboxes, and form controls.
- Component tests cover hidden/disabled/loading/success/error/fallback states and sender/recipient behavior.
- Chromium Playwright E2E verified no static horizontal overflow and usable Roommate navigation at 375, 768, 1024, and 1440 pixels.
- The in-session interactive browser surface was unavailable, so no additional manual visual session is claimed. The repository Playwright suite did run Chromium normally and exited successfully.

## 16. Verification matrix

| Area | Result |
| --- | --- |
| Shared TypeScript | PASS |
| Shared tests | No package test script; covered through consuming service suites |
| Identity full | 57/57 PASS |
| Identity PostgreSQL verification | 5/5 PASS |
| Identity TypeScript | PASS |
| Listing full projection/regression | 40/40 PASS |
| Listing TypeScript | PASS |
| Engagement V1/V2 focused | 57/57 PASS |
| V3-01 provider/config/routes | 11/11 PASS |
| V3-02 preference preview | 3/3 PASS |
| V3-03 recommendation | 3/3 PASS |
| V3-04 explanation | 6/6 PASS |
| V3-05 worker/migration focused | 12/12 PASS |
| V3-06 projection/admin focused | 5/5 PASS |
| V3-07 evaluation/security | 13/13 PASS |
| Engagement full | 158/158 PASS |
| Engagement TypeScript | PASS |
| PostgreSQL Roommate | 30/30 PASS |
| Gateway full | 10/10 PASS |
| Real Gateway health and anonymous route probe | 200 health; 401 capability auth boundary PASS |
| Real Gateway authenticated AI-off probe | 201 registration; 200 capabilities; all four flags false PASS |
| Frontend Roommate focused | 76/76 PASS across 16 files |
| Frontend admin Roommate focused | 4/4 PASS |
| Frontend full | 711/711 PASS across 115 files; normal exit |
| Frontend TypeScript | PASS |
| Frontend lint | PASS |
| Chromium Roommate/Gateway E2E | 5/5 PASS |
| Frontend production build | PASS through all Next.js phases and normal exit |

The full frontend suite used deterministic threads with one worker and no file parallelism. The production build used a temporary process-local HTTPS public API origin and did not modify persistent environment configuration.

## 17. V3-07 evaluation metrics

V3-08 reran the unchanged V3-07 deterministic evaluation suite. Results remain tied to `FakeAiProvider` and synthetic fixtures; they are not real Gemini semantic-quality evidence.

| Area | Metric | Threshold | Result | Status |
| --- | --- | ---: | ---: | --- |
| Parser | Macro precision | reported | 1.00 | PASS |
| Parser | Macro recall | reported | 1.00 | PASS |
| Parser | Macro F1 | >= 0.90 | 1.00 | PASS |
| Parser | False inference | <= 0.02 | 0/90 = 0.00 | PASS |
| Parser | Protected violations | 0 | 0 | PASS |
| Parser | Schema-valid | 1.00 | 18/18 = 1.00 | PASS |
| Recommendation | Eligibility preservation | 1.00 | 5/5 = 1.00 | PASS |
| Recommendation | Reason grounding | 1.00 | 18/18 = 1.00 | PASS |
| Recommendation | Protected counterfactual order changes | 0 | 0 | PASS |
| Recommendation | Human top-5 relevance | >= 0.80 | 5/5 = 1.00 | PASS |
| Explanation | Evidence refs | 1.00 | 10/10 = 1.00 | PASS |
| Explanation | Hallucination | 0 | 0/5 = 0 | PASS |
| Explanation | Important-difference recall | >= 0.95 | 5/5 = 1.00 | PASS |
| Safety | OTP/credential recall | >= 0.95 | 11/11 = 1.00 | PASS |
| Safety | `HIGH_CAUTION` recall | >= 0.90 | 15/15 = 1.00 | PASS |
| Safety | Benign finance FP | <= 0.05 | 0/10 = 0.00 | PASS |
| Safety | Grounding | 1.00 | 25/25 = 1.00 | PASS |

## 18. Production rollout and governance

No new approved evidence appeared after V3-07. Unknown or organizational evidence absent from the repository remains `NOT_MET` rather than being inferred from code.

| Gate | Evidence | State |
| --- | --- | --- |
| Real Gemini synthetic staging | Not run | `NOT_MET` |
| Paid/commercial Gemini project | No approval artifact | `NOT_MET` |
| Privacy/DPA/retention review | No completed review artifact | `NOT_MET` |
| Tenant disclosure | No published disclosure evidence | `NOT_MET` |
| Data minimization/redaction approval | Implementation tested; organizational approval absent | `NOT_MET` |
| Controlled rollout approval | No approval artifact | `NOT_MET` |
| SHADOW observation | No approved production observation | `NOT_MET` |
| SHADOW duration | No 14-day evidence | `NOT_MET` |
| Completed SHADOW analyses | No 500-analysis evidence | `NOT_MET` |
| Invalid-schema rate | No production-window rate | `NOT_MET` |
| Timeout/unavailable rate | No production-window rate | `NOT_MET` |
| End-to-warning p95 | No production measurement | `NOT_MET` |
| Privacy incident attestation | No approved attestation | `NOT_MET` |

Safe production configuration recommendation: keep provider `DISABLED` and safety `OFF` by default. Do not set `TENANT` mode or rollout to 100 until every frozen governance, real-provider, SHADOW, privacy, reliability, latency, and explicit approval gate is met.

## 19. Known limitations

- Real Gemini semantic quality has not been validated by CI `FakeAiProvider` results.
- Production SHADOW observation is not complete or evidenced.
- Private-chat production processing requires a paid/commercial eligible Gemini project, privacy/DPA/retention review, tenant disclosure, and explicit rollout approval.
- Zero provider retention is not claimed.
- AI safety is advisory and is not automatic moderation.
- Absence of a warning is not a guarantee of safety.
- `ROOMMATE_PROFILE` and `ROOMMATE_REQUEST` reports intentionally do not aggregate chat AI safety metadata.
- The deterministic evaluation set is small and reviewable, not statistically conclusive.
- The interactive browser surface was unavailable during V3-08; automated Chromium Playwright and component accessibility/responsive checks passed.

## 20. Final scope audit

```text
New AI feature in V3-08: No
New public endpoint: No
New provider capability: No
New safety signal: No
New outcome: No
New moderation automation: No
New product migration: No
V2 compatibility changed: No
V2 risk changed: No
Ordinary discovery changed: No
V3-03 ordering changed: No
V3-04 grounding changed: No
V3-05 worker contract changed: No
V3-06 authorization/privacy changed: No
V3-07 thresholds changed: No
Production rollout falsely approved: No
Post-V3 feature started: No
```

Final engineering decision:

```text
ROOMMATE_V3_ENGINEERING_RELEASE = READY
```

Independent production decision:

```text
PRODUCTION_TENANT_AI_ROLLOUT = NOT APPROVED
```
