# Roommate V2 Implementation Roadmap

| Thuộc tính | Giá trị |
| --- | --- |
| Trạng thái | **PLANNED — READY FOR IMPLEMENTATION** |
| Phạm vi | Roommate Matching V2 Core |
| Số milestone | **Đúng 6 milestone** |
| Hợp đồng sản phẩm | `docs/requirements/ROOMMATE_V2_SPECIFICATION.md` |
| Kiến trúc | API Gateway + Identity Service + Listing Service + Engagement Service + Next.js frontend |

## 1. Purpose and authority

Roadmap này chuyển Roommate V2 Specification đã đóng băng thành sáu milestone lớn, độc lập để triển khai, kiểm thử, review và tạo checkpoint commit. Roadmap chỉ bao phủ V2 Core; không diễn giải lại Roommate V1 và không thay đổi lịch sử RM-001 đến RM-055 hoặc ROOMMATE-V1-01 đến ROOMMATE-V1-06.

Thứ tự thẩm quyền khi triển khai:

1. Yêu cầu hiện tại của người dùng cho đúng milestone được chọn.
2. `AGENTS.md`.
3. `docs/requirements/ROOMMATE_V2_SPECIFICATION.md`.
4. Roommate V1 specification và block-management addendum cho behavior V1 được giữ lại.
5. Roadmap này.
6. Implementation patterns hiện có nếu không xung đột các nguồn trên.

Mỗi lần triển khai chỉ chọn đúng một `ROOMMATE-V2-*` milestone. Không tự động bắt đầu milestone tiếp theo.

## 2. Frozen boundaries

Mọi milestone phải giữ các quyết định sau:

- compatibility chỉ dùng năm profile fields và ba effective request-intent dimensions đã đóng băng;
- output là dimension outcomes + categorical summary hoặc `null`, không score/percentage;
- missing data là `NOT_EVALUATED`, không suy luận;
- không automatic hard mismatch hoặc compatibility ranking trong Core;
- discovery vẫn `createdAt DESC`, `requestId DESC`;
- compatibility và risk flags compute on read, không tạo persistence table;
- Identity là nguồn sự thật duy nhất cho verification; email/phone channel độc lập;
- risk flags admin-only và chỉ hỗ trợ triage/evidence;
- heuristic không tự punishment hoặc thay đổi V1 lifecycle;
- không schema/API/state cho `RoommateGroup`;
- không landlord confirmation, listing-aware suggestions, additional lifestyle fields hoặc V2.x ranking;
- không AI, embeddings, vector search, LLM provider hoặc semantic behavior;
- giữ `/api/v1`, microservice ownership và không cross-service FK.

Nếu implementation phát hiện một material conflict với các boundary này, dừng phần xung đột và báo người dùng; không sửa specification hoặc mở rộng milestone để tự giải quyết.

## 3. Milestone summary

| Task | Milestone | Main result | Dependency | Checkpoint |
| --- | --- | --- | --- | --- |
| `ROOMMATE-V2-01` | Compatibility foundation & contract | Pure deterministic engine và complete matrix tests | None | `xay dung nen tang tuong thich roommate v2` |
| `ROOMMATE-V2-02` | Compatibility API & discovery integration | Additive compatibility DTO trên discovery/detail, giữ ordering V1 | 01 | `tich hop tuong thich vao roommate` |
| `ROOMMATE-V2-03` | Tenant verification & factual badges | Tenant verification backend, independent channels và safe Roommate facts | 02 | `them xac minh lien he cho tenant` |
| `ROOMMATE-V2-04` | Risk heuristics & admin review | Finite admin-only flags, evidence và priority queue | 03 | `them uu tien rui ro bao cao roommate` |
| `ROOMMATE-V2-05` | Frontend integration & UX | Tenant/admin V2 surfaces hoàn chỉnh, accessible và privacy-safe | 02–04 | `hoan thien giao dien roommate v2` |
| `ROOMMATE-V2-06` | Integration, security & release | E2E, regression và release gates đạt | 01–05 | `hoan thien tich hop roommate v2` |

## 4. Checkpoint and Git protocol

Sau khi một milestone đạt toàn bộ done condition:

1. Chạy `git status --short`; phân biệt pre-existing/unrelated changes.
2. Chạy toàn bộ required checks của milestone.
3. Review diff theo từng file và `git diff --check`.
4. Stage bằng danh sách path cụ thể; không dùng `git add .`, `git add -A` hoặc glob rộng.
5. Không stage, sửa, restore hoặc discard unrelated changes, gồm `docs/implementation/POST_MVP_AI_FEATURES.md` và `frontend/next-env.d.ts` nếu chúng vẫn tồn tại.
6. Kiểm tra `git diff --cached --name-status`, staged diff và `git diff --cached --check`.
7. Tạo đúng một checkpoint commit bằng message tiếng Việt không dấu của milestone.
8. Kiểm tra lại status; không push.

Không sửa committed migration cũ. Nếu một migration mới thực sự cần thiết trái với baseline “Core không schema change”, phải dừng và báo conflict trước; không tự thêm migration.

Trong planning task tạo roadmap này: không stage, commit hoặc push.

## 5. `ROOMMATE-V2-01` — Compatibility foundation & contract

### Goal

Tạo pure deterministic compatibility engine đủ chính xác để hai implementation độc lập cho cùng structured inputs sẽ trả cùng outcomes, codes, category và dimension order.

### Dependencies

- Roommate V1 đã implemented/frozen.
- V2 Specification mục 8–9, 29–30 đã frozen.

### Scope

- Tạo typed compatibility inputs/outputs và constants trong Engagement Roommate domain.
- Implement effective intent representation cho budget interval, normalized area set và move-in window; chưa nối public route.
- Implement exact normalization và symmetric comparison matrices cho:
  - `sleepSchedule`;
  - `cleanlinessLevel`;
  - `noisePreference`;
  - `smokingEnvironment`;
  - `petEnvironment`;
  - budget, area và move-in overlap.
- Implement closed-set explanation codes, fixed dimension ordering, evaluated-count và overall reduction.
- `zero..three` evaluated dimensions không có important difference trả category `null`; known important difference vẫn thắng.
- Không đọc `intro`, note, message, report, block hoặc verification state.
- Không thêm route, frontend, ranking, cache hoặc database write.

### Expected files/areas

- `services/engagement-service/src/modules/roommate` cho pure compatibility module/types.
- `services/engagement-service/test` cho unit/matrix tests.
- Existing configuration/types chỉ khi trực tiếp cần compile; không tạo generic matching framework.

### API impact

None. Milestone này chưa thay đổi public/internal response.

### Database impact

None. Reuse structured values đã tồn tại; không migration, table, column hoặc index.

### Privacy impact

Engine chỉ nhận allowlisted structured inputs. Tests phải chứng minh free text/private/safety data không nằm trong input type hoặc output.

### Concurrency impact

None. Pure read-only computation, không lock và không mutation.

### Tests and checks

- Table-driven exhaustive enum-pair matrices, gồm symmetry A/B.
- Budget, area và move-in inclusive-overlap boundaries, one-sided query ranges/windows và missing values.
- Every closed explanation code và exact dimension order.
- Overall reduction cho 0, 1, 3, 4 và 8 evaluated dimensions; important-difference precedence; neutral/discuss/aligned counts.
- Determinism/property tests với same input + rules version.
- Negative assertion: không numeric score, percentage hoặc hard-exclusion output.
- Engagement focused unit tests, typecheck, lint/format cho scope và `git diff --check`.

### Done condition

- Pure engine khớp toàn bộ specification matrix và không phụ thuộc API/database.
- Required tests pass và diff chỉ thuộc milestone 01.
- One checkpoint commit: `xay dung nen tang tuong thich roommate v2`.

## 6. `ROOMMATE-V2-02` — Compatibility API & discovery integration

### Goal

Đưa compatibility vào current discovery/request-detail reads bằng additive DTO trong khi giữ nguyên eligibility, privacy, ordering và pagination V1.

### Dependencies

- `ROOMMATE-V2-01` complete và checkpointed.

### Scope

- Xây dựng effective caller intent theo precedence đã frozen:
  1. filter hiện diện trong discovery query;
  2. field từ caller-owned current `OPEN` request;
  3. missing → `NOT_EVALUATED`.
- Reuse current Roommate profile rows và Listing public-summary area cho linked request; fail closed theo V1 khi required dependency lỗi.
- Extend `GET /api/v1/roommate-requests` item bằng compatibility object hoặc `null`.
- Extend `GET /api/v1/roommate-requests/:requestId` bằng full eight-dimension object hoặc `null`.
- Discovery compact highlight selection phải deterministic; request detail giữ full fixed order.
- Caller thiếu complete visible profile vẫn dùng được discovery V1 với `compatibility: null`.
- Không thêm sort/filter compatibility, endpoint `/api/v2`, new route family hoặc state mutation.
- Không đưa factual verification badges vào task này; đó là milestone 03.

### Expected files/areas

- Engagement Roommate service/repository/controller/validation/mapping.
- Existing Listing internal client usage nếu cần assemble effective area.
- Engagement HTTP/service/PostgreSQL tests.
- Gateway không cần route mới; chỉ test regression nếu response proxy behavior bị chạm.

### API impact

Additive fields trên hai existing `/api/v1/roommate-requests` reads. Request query không có field mới. Error envelope/status giữ nguyên.

### Database impact

None. Có thể thêm bounded read query/repository method; không schema hoặc persisted compatibility.

### Privacy impact

- Không echo caller hidden request hoặc raw comparison values ngoài fields V1 đã public-safe.
- Compatibility phải được tính sau self/block/moderation/account/listing exclusions.
- Dependency không được fallback stale hoặc làm lộ hidden candidate.

### Concurrency impact

Read-only snapshots; không sửa V1 locking. Result có thể phản ánh profile/request update ở request kế tiếp.

### Tests and checks

- HTTP/service tests cho object/null contract, all explanation codes và dependency errors.
- Discovery privacy tests cho self, blocked pair, hidden/inactive owner và ineligible linked listing.
- Regression chứng minh exact order `createdAt DESC`, `requestId DESC`, page boundaries và `hasNextPage` không đổi.
- Current OPEN request/filter precedence tests, linked/unlinked area tests và incomplete caller UX contract.
- No score/percentage/raw private field response assertions.
- Engagement focused tests, relevant PostgreSQL tests, typecheck, lint/format, `git diff --check`.

### Done condition

- Hai V1 read endpoints trả compatibility đúng frozen contract mà không đổi discovery results/order.
- Existing Roommate lifecycle/safety suites liên quan vẫn pass.
- Diff chỉ thuộc milestone 02.
- One checkpoint commit: `tich hop tuong thich vao roommate`.

## 7. `ROOMMATE-V2-03` — Identity tenant verification & factual badges

### Goal

Mở contact verification hiện có cho active tenant theo role-safe routes, hỗ trợ email/phone channel độc lập và chiếu đúng factual booleans vào Roommate responses.

### Dependencies

- `ROOMMATE-V2-02` complete và checkpointed.
- Identity contact verification schema/service/provider foundation hiện có.

### Scope

- Refactor nhỏ contact-verification service để dùng cho tenant mà không nới landlord/admin authorization.
- Add owner-only tenant routes:
  - status;
  - email request/confirm;
  - phone request/confirm.
- Status trả exact owner-private contact DTO và channel `available`; không trả landlord profile trên tenant route.
- Giữ email lifetime 30 phút, phone lifetime 5 phút, maximum 5 failed attempts và shared 5 operations/15 minutes account+IP limit.
- Serialize request/resend theo account+channel; revoke prior challenge và chỉ để một usable challenge.
- Preserve idempotent already-verified/double-confirm behavior, destination-change invalidation và provider-unavailable semantics.
- Add independent production capability configuration cho email và phone; không gọi external provider trong normal unit tests.
- Extend Identity internal Roommate projection bằng đúng `emailVerified`, `phoneVerified`; giữ `tenantId`, `role`, `displayName`, `isActive`, `memberSince`.
- Update shared Identity client/Engagement `RoommateProfileView` mapping bằng factual booleans; không thêm compatibility vào interest/conversation/current-connection DTO trong Core.
- Add Gateway routing cho exact `/api/v1/tenant/verifications` prefix trước fallback routes.
- Không lưu verification truth trong Engagement và không tạo trust/safety badge semantics.

### Expected files/areas

- `services/identity-service/src/modules/verifications`, users projection, config/server và tests.
- `services/shared/identity-account-client.ts` hoặc current shared internal client contract.
- Engagement Roommate identity decoration/DTO và tests.
- `services/api-gateway/server.mjs` và gateway tests.
- Verification delivery adapter tests/config chỉ khi cần chứng minh independent channel capability.

### API impact

- Năm additive `/api/v1/tenant/verifications/*` endpoints.
- Add two booleans to internal and public-safe Roommate identity projection.
- Existing landlord verification routes/DTO giữ tương thích.

### Database impact

Reuse `users.email_verified_at`, `users.phone_verified_at`, `contact_verification_challenges`. No migration or table modification. Challenge concurrency phải giải quyết bằng current transaction/locking capability.

### Privacy impact

- Self status là `OWNER_PRIVATE`; public Roommate chỉ có booleans và `memberSince`.
- Không public email, phone, timestamps, secret/hash, attempts, provider hoặc capability internals.
- Badge chỉ render khi verified boolean thật; availability không phải trust fact.

### Concurrency impact

- Test resend/resend, resend/confirm, confirm/confirm và contact-change/confirm races.
- Một checked-out Identity client từ `BEGIN` đến `COMMIT/ROLLBACK`.
- Provider call ngoài transaction theo pattern hiện có; failure không ghi verified timestamp.

### Tests and checks

- Identity service/HTTP tests cho active tenant, wrong role, inactive/missing auth, unknown fields.
- Challenge lifecycle: expiry, attempts, resend invalidation, already verified, double confirm và destination change.
- Independent channel configuration/provider unavailable tests.
- PostgreSQL concurrency tests trên disposable Identity database.
- Exact allowlist tests cho internal/public Roommate projection và no-contact leakage.
- Gateway routing/body proxy tests.
- Engagement projection/dependency-failure tests.
- Focused service suites, typecheck, lint/format, `git diff --check`.

### Done condition

- Active tenant xác minh từng channel độc lập; public Roommate facts phản ánh Identity truth.
- Provider/channel failure không tạo false badge; landlord flow không regression.
- Không schema change hoặc Engagement verification copy.
- Diff chỉ thuộc milestone 03.
- One checkpoint commit: `them xac minh lien he cho tenant`.

## 8. `ROOMMATE-V2-04` — Risk heuristics & admin review

### Goal

Thêm finite deterministic risk signals và priority/evidence cho existing Roommate report review mà không tự enforcement hoặc thay đổi report lifecycle.

### Dependencies

- `ROOMMATE-V2-03` complete và checkpointed.
- Existing Roommate message/interest/block/report/moderation data và append-only events.

### Scope

- Implement đúng bảy frozen signal codes; không generic plugin/rule framework và không signal ngoài spec.
- Add validated bounded configuration cho windows/thresholds và versioned solicitation pattern set; document defaults trong service config.
- Normalize repeated messages đúng NFC/line endings/whitespace/Unicode case folding mà không log body.
- Add bounded repository queries/evidence assembly từ current Engagement data.
- Add bounded internal Identity projection/client cho exact account `createdAt` chỉ phục vụ risk evaluation.
- Compute risk on read; `rulesVersion` nhận diện thresholds/pattern set; không persist score/flag.
- Extend existing admin report queue/detail with `riskSummary`, `partialEvaluation`, bounded evidence summary và optional `reviewPriority` filter.
- Apply `ELEVATED`/`STANDARD` ordering trước pagination, rồi `createdAt ASC`, `reportId ASC`.
- Preserve explicit admin moderation/status actions, required notes và append-only action events.
- Không thêm user notification, account action, automatic hide/block/termination hoặc tenant risk DTO.

### Expected files/areas

- Engagement Roommate safety validation/repository/service/controller/routes/config and tests.
- Identity internal risk projection and shared client, narrowly scoped to exact account age.
- Existing admin contact-report DTO/route tests.
- Gateway route không mới; regression tests nếu query/response handling bị chạm.

### API impact

- Additive `riskSummary` on existing admin Roommate report queue/detail.
- Optional `reviewPriority=ELEVATED|STANDARD` query.
- Không tenant/public API change.

### Database impact

None. Reuse `roommate_messages`, `roommate_interests`, `contact_blocks`, `contact_reports`, `contact_report_events`; no risk table, score column hoặc evidence event schema.

Nếu query plan evidence cho thấy index là release blocker, dừng và báo conflict vì frozen Core baseline không phê duyệt schema change; không tự thêm migration.

### Privacy impact

- Flags/priority/evidence là `ADMIN_ONLY`; exact account age và config internals là `INTERNAL_ONLY`.
- Evidence chỉ chứa bounded IDs/count/window trong authorized report context.
- Không thêm reporter identity hoặc reverse-block detail ngoài V1 admin authorization.
- Message body chỉ được xem trong existing authorized moderation context, không log/metric label.

### Concurrency impact

Risk reads không mutate report. Concurrent admin status/moderation action tiếp tục dùng current row locks, stale-transition handling và append event atomically.

### Tests and checks

- Pure deterministic test cho từng flag, configured thresholds/windows, versioning và false-positive boundaries.
- PostgreSQL/service tests cho source queries, current-block limitation, normalized repeated message và bounded evidence.
- Priority calculation và global ordering-before-pagination tests, gồm stable tie-breaking.
- `partialEvaluation` khi Identity unavailable; other proven flags vẫn giữ đúng.
- Authorization/privacy tests: tenant không thể đọc flags, evidence không vượt report context.
- Explicit no-auto-enforcement assertions cho users/profile/request/interest/message/block/report/moderation state.
- Existing report status/moderation append-only tests.
- Focused Identity/Engagement/Gateway suites, typecheck, lint/format, `git diff --check`.

### Done condition

- Admin queue/detail có deterministic risk assistance đúng frozen finite set.
- Không state nào tự đổi vì heuristic; no risk data tenant leakage.
- Config/defaults/rules version được document và test; no schema change.
- Diff chỉ thuộc milestone 04.
- One checkpoint commit: `them uu tien rui ro bao cao roommate`.

## 9. `ROOMMATE-V2-05` — Frontend integration & UX

### Goal

Hoàn thiện Roommate V2 Core surfaces cho tenant/admin với wording factual, neutral, responsive và accessible, không thay đổi business behavior V1.

### Dependencies

- `ROOMMATE-V2-02`, `ROOMMATE-V2-03`, `ROOMMATE-V2-04` complete và checkpointed.

### Scope

- Trước khi frontend work bắt đầu, đọc `.codex/skills/ui-ux-pro-max/SKILL.md` và guidance liên quan trong `.codex/skills`; skill không được override frozen specification.
- Extend frontend API types/client cho compatibility, verification owner status/actions và admin risk summary.
- Discovery card:
  - overall label hoặc insufficient-data state;
  - tối đa ba deterministic highlights;
  - important-difference indicator;
  - factual email/phone/member-since signals.
- Request detail:
  - full ordered dimension breakdown;
  - neutral discussion-oriented copy;
  - interest composer giữ free-form first-message behavior V1.
- Profile/self surface:
  - email/phone status và independent start/confirm/resend UX;
  - channel unavailable, provider error, expiry, attempts/rate limit và already-verified states;
  - không show badge chỉ vì feature available.
- Admin Roommate reports:
  - priority tier, flag labels, partial evaluation và bounded evidence disclosure;
  - existing report detail/status/moderation actions giữ nguyên.
- Không đưa compatibility vào conversation/current connection trong Core.
- Không V2.x controls, Group affordance, AI language, score, percentage hoặc trust/safe-person wording.

### Expected files/areas

- `frontend/lib/api/roommates.ts`, verification API/client types và tests.
- `frontend/features/roommate` discovery, detail, profile/verification và admin-report surfaces.
- Relevant shared presentational components/styles only when directly needed.
- Frontend component/page/accessibility tests.

### API impact

Consumes milestone 02–04 contracts; no new frontend-only backend assumption or workaround.

### Database impact

None.

### Privacy impact

- Render only allowlisted public/participant/admin fields for the active surface.
- Never render raw contact on candidate surfaces or risk data on tenant surfaces.
- Owner verification contact remains confined to self profile/status.

### Concurrency impact

UI disables duplicate submit while pending but backend remains authoritative. Resend/confirm/admin conflict responses must be rendered without optimistic state fabrication.

### Tests and checks

- API transport/types tests for exact paths, bodies, nullable category and privacy allowlists.
- Discovery/detail component tests for all categories/outcomes, highlight order, null/empty/loading/error/retry states.
- Verification tests for independent channels, unavailable provider, verified/no-badge-before-complete, rate limit and sanitized errors.
- Admin tests for priority, flags, partial evaluation, evidence disclosure and unchanged moderation actions.
- Accessibility: text not color-only, semantic lists/status, keyboard disclosure, focus, 44px targets, reduced motion.
- Responsive checks for compact/mobile/tablet/desktop Roommate surfaces.
- Frontend focused tests, typecheck, lint, scoped Prettier and production build if shared production rendering is affected.
- `git diff --check`.

### Done condition

- Tenant/admin có usable end-to-end UI cho toàn bộ Core contracts.
- Privacy/accessibility wording và interaction tests pass; V1 flows không regression.
- Diff chỉ thuộc milestone 05.
- One checkpoint commit: `hoan thien giao dien roommate v2`.

## 10. `ROOMMATE-V2-06` — Integration, security & release verification

### Goal

Chứng minh Roommate V2 Core hoạt động xuyên Gateway/microservices/frontend, giữ V1 compatibility và đạt release gate trong phạm vi code, test và build.

### Dependencies

- `ROOMMATE-V2-01` đến `ROOMMATE-V2-05` complete và checkpointed.

### Scope

- Không thêm feature. Chỉ bổ sung integration/E2E evidence và sửa defect trực tiếp chặn V2 Core release readiness.
- Chạy Flow A: discovery → compatibility card/detail → arbitrary free-text interest, giữ ordering V1.
- Chạy Flow B: tenant verification từng channel → factual badge projection → channel independence/provider unavailable behavior.
- Chạy Flow C: report → risk-prioritized admin queue/detail → explicit admin action; chứng minh không auto-enforcement và không tenant leakage.
- Verify important difference không loại candidate hoặc thay đổi request/interest.
- Verify incomplete profile, missing intent/category null, blocked pair, hidden/inactive account và listing unavailable behavior.
- Verify Gateway routing, cookies/origin/auth role boundaries, internal token, error sanitization và dependency failure.
- Verify existing V1 interest/connection/message/block/unblock/report flows và concurrency invariants không regression.
- Provider thật không được gọi trong normal automated suites; production provider/channel readiness là deployment checklist riêng.

### Expected files/areas

- Focused integration/browser fixtures và E2E tests trong existing service/frontend test structure.
- Gateway tests và minimal release documentation/config validation only if directly required.
- Production source chỉ được sửa khi một verified Core V2 release defect yêu cầu; không opportunistic refactor.

### API impact

None planned. Any new endpoint/field is a contract conflict and requires user approval.

### Database impact

None planned. Use disposable test databases; never drop/recreate development or production databases.

### Privacy impact

Full cross-surface audit cho contact, verification internals, caller intent, risk data, reporter/block direction, message/report evidence và logs.

### Concurrency impact

Run Identity resend/confirm races và existing Engagement Roommate PostgreSQL concurrency suites. No change to V1 active-commitment semantics.

### Tests and checks

- Gateway routing/integration tests cho Roommate and tenant verification paths.
- Identity verification focused HTTP/service/PostgreSQL tests.
- Engagement compatibility, lifecycle, interest, message/safety, risk/admin tests.
- Frontend focused tests và Roommate browser E2E critical flows.
- Privacy/security negative matrix cho anonymous, inactive, wrong role, blocked, hidden và admin-only fields.
- Typecheck tất cả services bị chạm và frontend.
- Lint, scoped/full relevant Prettier, `git diff --check`.
- Frontend production build và relevant service build/startup-config validation.
- Review final diff, status và frozen-spec/V2.x/V3 boundary audit.

### Done condition

- Core flows pass qua real local Gateway với mocked/local delivery adapter phù hợp.
- Required tests, typecheck, lint, format và build pass hoặc environment-only limitation được báo chính xác và không che implementation failure.
- V1 behavior, privacy, security, ordering và concurrency được chứng minh không regression.
- Không V2.x, Group, AI, schema change hoặc unrelated debt trong diff.
- Diff chỉ thuộc milestone 06.
- One checkpoint commit: `hoan thien tich hop roommate v2`.

## 11. Core data and migration strategy

| Area | Decision |
| --- | --- |
| Engagement tables | Reuse existing; no new/modified Core table |
| Identity tables | Reuse `users` verification timestamps và `contact_verification_challenges` |
| Compatibility | Compute on read; no persistence |
| Risk | Compute on read; no risk/evidence table |
| Verification projection | Extend DTO/query allowlist, not schema |
| Cross-service IDs | Logical IDs only; no cross-service FK |
| Old migrations | Immutable |

Nếu một milestone cho rằng schema change là bắt buộc, task đó remains open cho tới khi người dùng phê duyệt deliberate contract change. Không dùng implementation convenience làm lý do thêm schema.

## 12. Release boundary

V2 Core roadmap hoàn tất không tự phê duyệt V2.x hoặc V3. Sau `ROOMMATE-V2-06`:

- landlord confirmation vẫn là V2.x candidate;
- listing-aware suggestions vẫn là V2.x candidate;
- compatibility ranking vẫn là V2.x candidate;
- additional lifestyle fields vẫn là V2.x candidate;
- `RoommateGroup` vẫn `DEFER UNTIL PRODUCT EVIDENCE`;
- mọi AI functionality vẫn thuộc V3.

Implementation chỉ bắt đầu khi người dùng yêu cầu một milestone cụ thể. Không tự động bắt đầu `ROOMMATE-V2-01` từ planning task này.
