# Roommate V3 Evaluation, Security, and Rollout Evidence

## Evidence identity

- Milestone: `ROOMMATE-V3-07`
- Evaluation date: `2026-08-31`
- Baseline commit: `2e6f808a856148cfd5a2e836dda91e41549b865e`
- Dataset version: `ROOMMATE_V3_EVAL_2026_08_31`
- CI provider: `FakeAiProvider`
- Real-provider status: `REAL_PROVIDER_STAGING_NOT_RUN`
- Data classification: synthetic, hand-authored fixtures only

Application behavior versions:

| Feature | Application version | Prompt/schema version |
| --- | --- | --- |
| Preference parser | `ROOMMATE_AI_PARSER_V3_1` | `ROOMMATE_AI_PARSER_PROMPT_V1` / `ROOMMATE_AI_PARSER_SCHEMA_V1` |
| Recommendation | `ROOMMATE_AI_SEMANTIC_V3_1` | `ROOMMATE_AI_RECOMMENDATION_PROMPT_V1` / `ROOMMATE_AI_RECOMMENDATION_SCHEMA_V1` |
| Explanation | `ROOMMATE_AI_EXPLANATION_V3_1` | `ROOMMATE_AI_EXPLANATION_PROMPT_V1` / `ROOMMATE_AI_EXPLANATION_SCHEMA_V1` |
| Safety | `ROOMMATE_AI_SAFETY_V3_1` | `ROOMMATE_AI_SAFETY_PROMPT_V1` / `ROOMMATE_AI_SAFETY_SCHEMA_V1` |

## Interpretation boundary

The offline results below measure the deterministic application harness, strict schemas, frozen application-owned rules, and hand-authored synthetic provider outputs. They prove that CI is reproducible and that invalid or adversarial provider output cannot override the application contract. They are not evidence that a real Gemini model meets the same semantic-quality metrics.

The real Gemini matrix was not run because no approved staging execution and governance evidence was available for this checkpoint. This does not fail the engineering checkpoint, but it prevents production tenant rollout approval.

The benchmark is intentionally reviewable and small. It must not be presented as statistically conclusive.

## Fixture composition

All fixtures are synthetic. They include Vietnamese, English, mixed language, missing accents, informal chat, abbreviations, emoji, typos, slang, light obfuscation, leetspeak, prompt injection, protected-attribute counterfactuals, and benign finance negatives.

| Evaluation | Composition |
| --- | --- |
| Parser | 18 cases; 90 target-field opportunities; all 10 frozen fields have positive gold coverage; 3 protected-only cases |
| Recommendation | 1 reviewable six-candidate benchmark, five human-labeled relevant candidates, and one two-candidate protected counterfactual pair |
| Explanation | 5 V2 evidence sets; 10 evidence references; 5 `IMPORTANT_DIFFERENCE` items |
| Safety | 36 messages; 11 OTP/credential cases; 15 expected `HIGH_CAUTION`; 10 benign-finance negatives; 25 grounded signals |

No production/private chat, tenant identifier, real contact value, real OTP, real bank/account value, provider response, or credential is present in the fixtures.

## Metric definitions

Parser metrics are micro-counted per field and macro-averaged across exactly the ten frozen fields.

- True positive: the proposed field exists in gold and its canonical value exactly matches.
- False positive: a field is proposed when absent from gold, or its canonical value differs from gold.
- False negative: a gold field is absent or has a different canonical value.
- False inference denominator: all allowed target-field opportunities, five per fixture according to `PROFILE` or `REQUEST`.
- Protected violation: any proposed field in a protected-only fixture.
- Schema-valid rate: provider outputs accepted in full by the production parser validator divided by all parser fixtures.

Recommendation relevance is independent hand-authored gold based only on allowed roommate concepts. Top-five relevance is the number of gold-relevant candidates in the returned top five divided by five. Eligibility preservation is the share of outputs that came from the ordinary discovery candidate set. Reason grounding requires each reason to be backed by an allowed semantic overlap or exact aligned V2 dimension.

Explanation evidence validity requires every returned pair to exactly match a recomputed V2 dimension and explanation code. Hallucination is a fixture claim not supportable from those V2 facts. Important-difference recall counts referenced `IMPORTANT_DIFFERENCE` facts divided by all such facts.

Safety recall uses the hand-authored expected signals and application-owned expected outcome. Benign-finance false positives count benign fixtures with any returned signal. Grounding requires the predicted signal to match gold and cite an opaque message token supplied for that fixture.

## Parser results

Every field has precision, recall, and F1 of `1.00` in the deterministic synthetic CI set.

| Field | Positive gold cases | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| `sleepSchedule` | 4 | 1.00 | 1.00 | 1.00 |
| `cleanlinessLevel` | 3 | 1.00 | 1.00 | 1.00 |
| `noisePreference` | 3 | 1.00 | 1.00 | 1.00 |
| `smokingEnvironment` | 2 | 1.00 | 1.00 | 1.00 |
| `petEnvironment` | 3 | 1.00 | 1.00 | 1.00 |
| `preferredAreaKeys` | 3 | 1.00 | 1.00 | 1.00 |
| `budgetMinPerPerson` | 2 | 1.00 | 1.00 | 1.00 |
| `budgetMaxPerPerson` | 3 | 1.00 | 1.00 | 1.00 |
| `moveInFrom` | 2 | 1.00 | 1.00 | 1.00 |
| `moveInUntil` | 1 | 1.00 | 1.00 | 1.00 |

## Final engineering gate table

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

## Adversarial and security evidence

- Parser rejects protected/unknown proposal fields and does not force ambiguous, conflicting, missing, or protected-only text into a proposal.
- Recommendation rejects unknown tokens, concepts, fields, ranges, and attempted provider-controlled ranking fields. Final order remains the frozen server tuple and stays unchanged when only protected counterfactual text changes.
- Explanation rejects fabricated evidence, omitted important differences, invalid caution dimensions, unknown fields, and oversized Unicode output. Provider input contains only recomputed V2 evidence and locale.
- Safety rejects unknown signals, unknown/duplicate evidence tokens, duplicate signals, and any attempted provider-owned `outcome`. Severity remains application-owned.
- Safety context is same-Interest, chronological, at most five previous plus current, at most six messages, and at most 6,000 Unicode code points. Opaque tokens are `M0..M5`; roles are `SENDER`/`COUNTERPART`.
- Synthetic redaction cases cover email, phone, URL, OTP, account-like numbers, secret-like values, spaces, dashes, punctuation, Vietnamese/English text, and adjacent emoji.
- `OFF` performs no work. `SHADOW` never exposes tenant warnings. `TENANT` uses a stable server-side percentage cohort.
- Sender classification remains hidden. Recipient projection requires `TENANT` mode and cohort membership. Admin AI evidence remains exact-message-only within an authorized `ROOMMATE_MESSAGE` report; profile/request reports remain `null`.
- Existing authorization regression covers sender, recipient, unrelated tenant, blocked participant, inactive tenant, landlord, admin, and anonymous boundaries without a new public endpoint.
- Gemini outbound access is one fixed `generateContent` path. No tool, grounding, web, Files API, cache, stateful session, model-output URL fetch, or autonomous follow-up exists.
- `candidateCount = 1`, structured JSON schema, independent validation, bounded output tokens, and bounded timeouts remain enforced.
- Capability lookup has no provider dependency and performs zero Gemini calls.
- `NEXT_PUBLIC_GEMINI_API_KEY` is rejected; frontend source has no Gemini key reference; `.env.example` contains only an empty server-side key placeholder.
- Provider errors become bounded application categories. Worker logs retain aggregate counts/error types only; they do not log raw message, prompt, response, secret, provider text, message ID, or tenant ID.
- Safety retention remains 180 days. The product table stores bounded work/audit metadata only; no raw chat, prompt, or provider response is stored.
- Aggregate invalid-schema and provider-failure rates can be derived from bounded `status` and `last_error_code` metadata without raw content or high-cardinality labels.

## Provider and feature classifications

| Feature | CI/fake-provider | Real Gemini staging |
| --- | --- | --- |
| V3-01 provider/config | PASS | NOT_RUN_REAL_PROVIDER |
| V3-02 preference parser | PASS | NOT_RUN_REAL_PROVIDER |
| V3-03 recommendation | PASS | NOT_RUN_REAL_PROVIDER |
| V3-04 explanation | PASS | NOT_RUN_REAL_PROVIDER |
| V3-05 safety worker | PASS | NOT_RUN_REAL_PROVIDER |
| V3-06 tenant/admin projection | PASS | Not provider-backed at read time |

`REAL_PROVIDER_STAGING_NOT_RUN`

No real Gemini request was made by V3-07. An approved manual staging run must use only this synthetic/irreversibly redacted class of data and separately report schema rate, timeout/error rate, and latency p50/p95.

## Production rollout gate table

No approved production SHADOW observation or governance evidence was present in the repository at this checkpoint. Absence of evidence is not treated as zero incidents or a passing metric.

| Gate | Required | Evidence | Status |
| --- | --- | --- | --- |
| SHADOW duration | >= 14 days | No approved production observation window | NOT_MET |
| Safety analyses | >= 500 | No approved production count | NOT_MET |
| Invalid schema | < 1% | No approved production-window rate | NOT_MET |
| Timeout/unavailable | < 5% | No approved production-window rate | NOT_MET |
| End-to-warning p95 | <= 15 s | No production end-to-warning measurement | NOT_MET |
| Privacy incidents | 0 | No approved incident attestation | NOT_MET |
| Disclosure published | yes | No published disclosure evidence | NOT_MET |
| Explicit rollout approval | yes | No approval artifact | NOT_MET |
| Paid/commercial Gemini project | yes | No approved commercial-project evidence | NOT_MET |
| Privacy/DPA review | complete | No completed review artifact | NOT_MET |

The local tests verify a six-second safety timeout and frontend polling every five seconds within a bounded 30-second window. Those are implementation checks, not production p95 latency evidence.

`SHADOW_TO_TENANT_PRODUCTION_ROLLOUT = NOT YET APPROVED`

`PRODUCTION_PRIVATE_CHAT_AI_ROLLOUT = BLOCKED_PENDING_GOVERNANCE`

`PRODUCTION_TENANT_AI_ROLLOUT = NOT APPROVED`

## Controlled rollout sequence

The required sequence remains:

1. Fake provider / CI.
2. Offline real-provider synthetic evaluation.
3. Internal/admin testing.
4. `SHADOW` observation.
5. Limited stable `TENANT` cohort.
6. Broader tenant rollout.

This checkpoint completes only step 1 engineering evidence. It does not authorize skipping from `SHADOW` to 100% tenant rollout.

## Regression evidence

| Check | Result |
| --- | --- |
| V3-01 provider/config | 11/11 PASS |
| V3-02 parser | 3/3 PASS |
| V3-03 recommendation | 3/3 PASS |
| V3-04 explanation | 6/6 PASS |
| V3-05 safety worker/migration | 12/12 PASS |
| V3-06 safety projection/admin | 5/5 PASS |
| V3-07 evaluation/security | 13/13 PASS |
| Engagement full | 158/158 PASS |
| Engagement TypeScript | PASS |
| Evaluation test TypeScript | PASS |
| Shared TypeScript | PASS |
| Identity full | Not run; no Identity/shared contract changed |
| PostgreSQL Roommate suites | 30/30 PASS on disposable test database using isolated temporary schemas |
| Gateway full | 10/10 PASS |
| Frontend Roommate focused | 74/74 PASS |
| Frontend full | 711/711 PASS across 115 files; normal exit |
| Frontend TypeScript | PASS |
| Frontend lint | PASS |
| Frontend production build | PASS |
| Scoped Prettier | PASS |
| `git diff --check` | PASS |

## Database and scope audit

- New product migration: None.
- New table: None.
- New column: None.
- Production evaluation persistence: None.
- New product AI feature: No.
- New public endpoint: No.
- New provider capability: No.
- New safety signal/outcome: No.
- New automatic enforcement or moderation mutation: No.
- V2 compatibility/risk change: No.
- V3-03 ranking contract change: No.
- V3-04 grounding contract change: No.
- V3-05 worker contract change: No.
- V3-06 privacy contract change: No.
- V3-08 started: No.

## Limitations and required future evidence

- A real Gemini staging benchmark remains mandatory before model-quality or production claims.
- The synthetic benchmark is small and must grow through reviewed, synthetic/irreversibly redacted cases rather than production chat copies.
- Production SHADOW duration, volume, error rates, end-to-warning latency, privacy incidents, disclosure, commercial eligibility, DPA/retention review, and explicit approval remain unproven.
- Zero provider retention is not claimed.
- Production private-chat Gemini processing remains blocked until governance and rollout evidence is independently approved.
