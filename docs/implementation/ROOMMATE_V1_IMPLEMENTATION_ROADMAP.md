# Roommate V1 Implementation Roadmap

| Thuộc tính | Giá trị |
|---|---|
| Trạng thái | **PLANNED — chưa triển khai** |
| Phạm vi | Roommate Matching V1 hậu-MVP |
| Số implementation task | **Đúng 6 task** |
| Kiến trúc đích | API Gateway + Identity Service + Listing Service + Engagement Service + Next.js frontend |
| Hợp đồng sản phẩm | `docs/requirements/ROOMMATE_V1_SPECIFICATION.md` |

## 1. Mục đích và thẩm quyền

Roadmap này chuyển Roommate V1 Specification đã được phê duyệt thành sáu milestone triển khai lớn, có thể kiểm tra và commit độc lập. Đây là planning artifact hậu-MVP; không sửa hoặc diễn giải lại lịch sử `RM-001` đến `RM-055` trong `IMPLEMENTATION_ROADMAP.md`.

Thứ tự thẩm quyền khi triển khai:

1. Yêu cầu hiện tại của người dùng cho task đang chọn.
2. `AGENTS.md`.
3. `docs/requirements/ROOMMATE_V1_SPECIFICATION.md`.
4. Roadmap này.
5. Các contract microservice/API/database hiện hành mà specification dẫn chiếu.
6. Pattern implementation hiện có, nếu không xung đột các nguồn trên.

Roadmap không mở lại product, privacy, safety, lifecycle hoặc service-ownership decisions. Nếu implementation phát hiện mâu thuẫn thực sự trong specification, dừng phần xung đột và xin quyết định; không tự đổi contract để hoàn tất task.

## 2. Quy tắc granularity

- Chỉ có các task ID `ROOMMATE-V1-01` đến `ROOMMATE-V1-06`.
- Checklist bên trong một task là substep của cùng milestone, không phải task mới và không được cấp ID riêng.
- Không tách migration, endpoint, repository, frontend page hoặc nhóm test thành task ID độc lập.
- Mỗi lần triển khai chọn đúng một `ROOMMATE-V1-*` task, hoàn tất toàn bộ done condition, kiểm tra, review và tạo đúng một checkpoint commit.
- Không tự động bắt đầu task tiếp theo sau checkpoint commit, trừ khi yêu cầu triển khai hiện tại nói rõ tiếp tục.
- Defect ngoài Roommate V1 chỉ được ghi nhận. Chỉ sửa defect trực tiếp chặn done condition của task hiện tại, trong phạm vi nhỏ nhất.

Chuỗi phụ thuộc chuẩn:

```text
ROOMMATE-V1-01
  -> ROOMMATE-V1-02
  -> ROOMMATE-V1-03
  -> ROOMMATE-V1-04
  -> ROOMMATE-V1-05
  -> ROOMMATE-V1-06
```

## 3. Tổng quan sáu milestone

| Task | Milestone | Kết quả chính | Phụ thuộc | Checkpoint commit |
|---|---|---|---|---|
| `ROOMMATE-V1-01` | Foundation & Data | Contract liên service và nền dữ liệu Roommate sẵn sàng | Không | `xay dung nen tang du lieu roommate v1` |
| `ROOMMATE-V1-02` | Profile, Request & Discovery | Flow tạo nhu cầu và khám phá request hoàn chỉnh ở Engagement | 01 | `them ho so yeu cau va tim kiem roommate` |
| `ROOMMATE-V1-03` | Interest & Connection | Interest/connection state machine và concurrency contract hoàn chỉnh | 02 | `them luong quan tam va ket noi roommate` |
| `ROOMMATE-V1-04` | Messaging & Safety | Chat, notification, block/report/moderation và anti-spam hoàn chỉnh | 03 | `them nhan tin va an toan roommate` |
| `ROOMMATE-V1-05` | Gateway & Frontend | Toàn bộ surface người dùng và Gateway routing hoàn chỉnh | 04 | `them giao dien va dinh tuyen roommate` |
| `ROOMMATE-V1-06` | Integration & Release | Hai flow E2E và release verification đạt | 05 | `hoan thien tich hop va san sang phat hanh roommate v1` |

Các commit message trên là tiếng Việt không dấu và là mặc định. Chỉ đổi câu chữ khi nội dung checkpoint thực tế cần mô tả chính xác hơn; vẫn phải dùng tiếng Việt không dấu.

## 4. Quy trình checkpoint commit bắt buộc

Sau khi toàn bộ substep và done condition của một task đã đạt:

1. Chạy `git status --short` và ghi nhận mọi thay đổi có sẵn.
2. Chạy các focused/full checks bắt buộc của task; không commit khi required check còn fail do implementation.
3. Rà diff theo từng file và xác nhận không có secret, generated artifact ngoài dự kiến hoặc thay đổi ngoài scope.
4. Stage bằng danh sách path cụ thể thuộc task hiện tại. Không dùng `git add .`, `git add -A` hoặc glob rộng.
5. Nếu một file chứa cả thay đổi Roommate và thay đổi không liên quan, không stage cả file một cách mù quáng; tách hunk an toàn hoặc dừng để phối hợp với người dùng.
6. Kiểm tra `git diff --cached --name-status`, `git diff --cached --check` và nội dung staged diff.
7. Tạo đúng một checkpoint commit bằng message của task.
8. Chạy `git status --short` lần nữa để xác nhận các thay đổi không liên quan vẫn còn nguyên và chưa bị stage.

Không push. Không reset, clean hoặc restore file không liên quan. Không amend/rebase checkpoint đã tạo nếu chưa có yêu cầu rõ ràng.

Trong planning task tạo roadmap này, **không tạo commit**.

## 5. Baseline repository tại thời điểm lập kế hoạch

- Runtime hiện tại là microservices: `services/api-gateway`, `services/identity-service`, `services/listing-service`, `services/engagement-service`, cùng Next.js trong `frontend`.
- Engagement đang có migration đến `0017_support_requests.sql`; migration Roommate foundation dự kiến dùng version kế tiếp còn trống tại thời điểm bắt đầu task 01. Không đổi migration đã có để ép số thứ tự.
- Listing đã có `GET /internal/v1/listings/public-summaries?ids=...`, current public/business filtering và `maxOccupants`; task 01 phải kiểm chứng trước khi quyết định có cần sửa contract.
- Identity chưa có public-safe roommate projection riêng; endpoint hiện có `/internal/v1/profiles` chứa contact fields và không được dùng làm roommate public-safe projection.
- Engagement đã có notification, pair block, contact report và append-only report-event patterns; mở rộng các capability này thay vì tạo Roommate Service hoặc generic messaging refactor.

Working tree khi roadmap được lập có hai thay đổi không liên quan phải được giữ ngoài mọi Roommate checkpoint trừ khi người dùng xác nhận khác:

- `docs/implementation/POST_MVP_AI_FEATURES.md`.
- `frontend/next-env.d.ts`.

`docs/requirements/ROOMMATE_V1_SPECIFICATION.md` và roadmap này là tài liệu Roommate có liên quan. Nếu chúng vẫn untracked khi task 01 được triển khai, task 01 checkpoint có thể stage chúng sau khi review chính xác nội dung.

## 6. `ROOMMATE-V1-01` — Foundation & Data

### Mục tiêu

Khóa nền liên service và tạo toàn bộ schema cần thiết để các task nghiệp vụ sau không phải tự quyết định lại data model, privacy projection hoặc safety storage.

### Phạm vi và checklist nội bộ

- Rà lại specification lần cuối theo code hiện hành; chỉ sửa lỗi diễn đạt, mismatch tên/kiểu hoặc chi tiết implementation-blocking. Mọi thay đổi product contract thực sự cần người dùng phê duyệt trước.
- Identity Service:
  - Thêm internal public-safe roommate tenant projection đúng field/authorization/batch limit trong specification.
  - Không trả email, phone, verification internals hoặc raw account row.
  - Thêm client contract/types cần thiết để Engagement sử dụng sau này.
- Listing Service:
  - Kiểm chứng endpoint public summaries thực sự chỉ trả listing `APPROVED`, `AVAILABLE|UNKNOWN`, active-landlord-visible và có `maxOccupants` public-safe.
  - Bổ sung thay đổi nhỏ và test contract chỉ khi behavior hiện tại chưa đáp ứng specification.
  - Không tạo roommate listing snapshot hoặc cross-service write.
- Engagement database foundation:
  - Tạo bốn bảng `roommate_profiles`, `roommate_requests`, `roommate_interests`, `roommate_messages`.
  - Thêm check/unique/foreign-key nội bộ/index/enum-value constraints theo specification.
  - Dùng `text[]` cho `preferred_area_keys`.
  - Mở rộng `contact_blocks`, `contact_reports`, `contact_report_events` và `notifications` theo typed Roommate context.
  - Giữ inquiry/contact/report/notification data và behavior hiện có tương thích.
  - Không tạo Match, Connection, Group, Preference, CompatibilityScore hoặc cross-service FK.
- Thêm các domain value types/constants tối thiểu cần để migration/schema tests dùng chung; chưa triển khai public Roommate handlers.
- Thêm migration runner/schema verification cần thiết cho clean database và existing deployment plan.

### Khu vực file dự kiến

- `docs/requirements/ROOMMATE_V1_SPECIFICATION.md` nếu thực sự cần cleanup.
- `docs/implementation/ROOMMATE_V1_IMPLEMENTATION_ROADMAP.md` nếu chỉ cần đồng bộ factual path/check.
- `services/identity-service/src`, `services/identity-service/test`.
- `services/listing-service/src`, `services/listing-service/test` chỉ khi contract verification yêu cầu.
- Migration version kế tiếp và test trong `services/engagement-service/migrations`, `services/engagement-service/src`, `services/engagement-service/test`.
- Shared internal DTO/client types nhỏ, tại vị trí microservice convention hiện có.

Không sửa monolith business modules để triển khai Roommate.

### Tests và checks bắt buộc

- Identity internal projection: auth, batch validation, active/inactive/role values, exact allowlisted fields và không contact leakage.
- Listing contract: public/business/landlord visibility, `maxOccupants`, batch validation và absence-as-ineligible behavior.
- Engagement migration tests trên disposable database:
  - clean migration chạy một lần đúng thứ tự;
  - existing deployment plan chỉ áp dụng migration mới;
  - bốn bảng, constraints, indexes và safety extensions đúng;
  - inquiry/report/notification schema hiện có vẫn dùng được;
  - không có cross-service FK hoặc bảng ngoài specification.
- Focused service tests và strict TypeScript checks cho ba service bị chạm.
- `git diff --check` cho file tracked và whitespace check tương đương cho file mới.

### Done condition

- Identity public-safe projection có contract test và không lộ contact.
- Listing eligibility contract đã được chứng minh bằng test; chỉ sửa khi cần.
- Engagement schema được tạo/migrate an toàn với đầy đủ defense-in-depth constraints.
- Không có Roommate endpoint nghiệp vụ public hoặc frontend được triển khai sớm.
- Tất cả required checks pass; diff chỉ thuộc milestone 01.
- Tạo một commit: `xay dung nen tang du lieu roommate v1`.

## 7. `ROOMMATE-V1-02` — Profile, Request & Discovery

### Mục tiêu

Hoàn thiện miền hồ sơ, request và discovery trong Engagement để active tenant có thể mô tả nhu cầu, quản lý vòng đời request và tìm request public-safe của tenant khác.

### Phạm vi và checklist nội bộ

- Tạo module Roommate trong Engagement theo pattern controller/service/repository/validation hiện có, không tạo abstraction chung suy đoán.
- `RoommateProfile`:
  - GET/PUT profile của chính tenant.
  - Exact normalization, enum, length, no-op timestamp và complete/visible eligibility.
- `RoommateRequest`:
  - Create linked/unlinked, detail, mine, update và cancel.
  - Enforce một request `OPEN`, no active connection, active tenant và profile complete.
  - `OPEN -> CANCELLED`, cleanup pending interest nếu có theo contract; code phải chịu được schema chưa có data nghiệp vụ.
  - Expiration 30 ngày, lazy correctness check, sweep/reminder, `OPEN -> EXPIRED` và renew.
  - Link/replace/unlink listing chỉ khi `OPEN`; validate area fallback trước unlink.
  - Listing effective suspension khi current listing không eligible; không thêm persisted `SUSPENDED`.
- Discovery:
  - Active authenticated tenant only.
  - Area/budget/move overlap, linked mode, newest sort, page/pageSize.
  - Exclude own, inactive owner, blocked pair, non-open, expired, hidden/incomplete và invalid linked listing.
  - Batch Identity/Listing projections, iterative eligible-result pagination và fail-closed dependency behavior.
  - Public-safe DTO không có contact, private tenant ID, exact location hoặc moderation internals.
- Thêm scheduler wiring và configuration default chỉ cho lifetime/reminder/rate limit thuộc milestone này; không thêm provider hoặc queue.
- Thêm focused API/service/repository/PostgreSQL tests.

### Specification coverage

Mục 5–11, 13, 15–18, 20–21, 27, 29–33 của Roommate V1 Specification, chỉ trong phạm vi profile/request/discovery.

### Khu vực file dự kiến

- `services/engagement-service/src/modules/roommate` và test tương ứng.
- Engagement server/router/config wiring.
- Internal Identity/Listing clients trong Engagement hoặc shared runtime theo pattern hiện có.
- Scheduler entrypoint và migration bổ sung chỉ nếu schema foundation có defect trực tiếp chặn task 02; không sửa migration task 01 đã commit.

### Tests và checks bắt buộc

- Validation/normalization/no-op tests cho toàn bộ profile/request fields.
- HTTP authorization tests cho anonymous, inactive, wrong role, owner/non-owner và unknown fields.
- PostgreSQL tests cho one-OPEN constraint, lifecycle, expiration/renew, cancellation cleanup và link concurrency cơ bản.
- Discovery tests cho mọi exclusion/filter, stable pagination, remote invalid listing, dependency `503` và privacy projection.
- Scheduler idempotency, expiration boundary và reminder dedupe tests.
- Engagement focused test suite và strict TypeScript check.

### Done condition

- Profile, request, listing-link lifecycle, expiration/renew và discovery endpoints hoạt động đúng specification khi gọi trực tiếp Engagement.
- Không triển khai interest transitions, roommate messaging hoặc frontend trong milestone này.
- Tests chứng minh invariants áp dụng cho scope task 02 và không làm regression capability Engagement hiện có.
- Tất cả required checks pass; diff chỉ thuộc milestone 02.
- Tạo một commit: `them ho so yeu cau va tim kiem roommate`.

## 8. `ROOMMATE-V1-03` — Interest & Connection

### Mục tiêu

Hoàn thiện `RoommateInterest`, derived connection và active-commitment transaction để accept luôn tuần tự hóa đúng dưới concurrent requests.

### Phạm vi và checklist nội bộ

- Create interest kèm initial non-empty message record atomically, nhưng chưa mở public messaging surface.
- Enforce no self-interest, one active interest per tenant/request, outgoing pending cap hook và pair block recheck.
- Implement incoming/outgoing/detail interest projections và current connection projection.
- Implement `accept`, `reject`, `withdraw`, `leave` theo exact state machine.
- Enforce Option C:
  - tenant được sở hữu request `OPEN` và gửi pending interests;
  - candidate có request `OPEN` không được accept;
  - không auto-close request của candidate.
- Accept transaction:
  - deterministic tenant lock ordering;
  - transaction-scoped advisory locks cùng namespace cho create/renew/accept/leave/block operations liên quan;
  - request/interest row locks;
  - active connection, active OPEN request, block, activity/profile và linked-listing eligibility rechecks;
  - target request `OPEN -> MATCHED` và target interest `PENDING -> ACCEPTED` atomic;
  - cleanup competing incoming/outgoing pending interactions;
  - deterministic conflict mapping.
- `LEFT` không reopen request; connection luôn derived từ `ACCEPTED` interest.
- Ghi transaction outcome đủ để milestone 04 nối notification mà không đổi state contract. Không tạo notification delivery hoặc message endpoints trong task 03.

### Specification coverage

Mục 11–16, 19 ở phần state precondition, 29, 31, 33–34 của Roommate V1 Specification.

### Khu vực file dự kiến

- Engagement Roommate interest/domain/service/repository/controller/validation/routes.
- Engagement transaction runner/advisory-lock helper nhỏ, chỉ nếu pattern hiện tại chưa có.
- Engagement HTTP, service và disposable-PostgreSQL tests.

### Tests và checks bắt buộc

- Unit/service tests cho toàn bộ transition, actor, stale state và Option C.
- PostgreSQL integration tests cho các invariant `RM-RM-INV-001` đến `RM-RM-INV-019` có liên quan.
- Concurrency tests bắt buộc:
  - hai accept cùng request;
  - hai request cùng candidate;
  - cross-accept A/B;
  - create/renew đua accept;
  - accept đua expiration;
  - accept đua link/unlink;
  - duplicate interest create;
  - leave từ hai phía.
- Rollback tests bảo đảm không partial state hoặc cleanup thiếu.
- Deterministic `409` mapping và privacy-safe `404` tests.
- Engagement focused/full relevant tests và strict TypeScript check.

### Done condition

- Tất cả interest/connection endpoints hoạt động trực tiếp qua Engagement.
- Không thể tạo hai active connections cho một tenant trong bất kỳ vai trò nào, kể cả race.
- Không có Match/Connection table, auto-close hoặc old-request reopen.
- Notification/messaging/safety user surfaces vẫn được để đúng milestone 04.
- Tất cả required checks pass; diff chỉ thuộc milestone 03.
- Tạo một commit: `them luong quan tam va ket noi roommate`.

## 9. `ROOMMATE-V1-04` — Messaging & Safety

### Mục tiêu

Hoàn thiện interaction và safety envelope của Roommate V1 trước khi mở Gateway/frontend surface.

### Phạm vi và checklist nội bộ

- `RoommateMessage` REST list/create/read:
  - interest-scoped, participant-only;
  - writable ở `PENDING|ACCEPTED`, terminal read-only;
  - plain text, bounded normalization, immutable message body;
  - stable pagination/order và monotonic read state.
- Roommate notifications:
  - interest received/accepted/rejected/withdrawn;
  - message received;
  - connection left;
  - request expiring/expired;
  - state mutation + notification record atomic, delivery retry-safe và deduped.
- Pair block:
  - request/interest-context routes;
  - two-way effect, idempotent block/unblock;
  - exact `PENDING`/`ACCEPTED` terminal effects;
  - no unblock resurrection và no block notification.
- Reports:
  - exact Roommate target/category values;
  - context authorization, duplicate active report prevention, evidence snapshot/retention;
  - no `listing_inquiry_id` requirement for roommate report.
- Moderation:
  - admin report list/detail/status integration;
  - profile/request/message hide/restore with report context and append-only event;
  - effective discovery/message behavior without leaking reason.
- Anti-spam/rate limits:
  - request, interest, message, report, block limits;
  - configurable concurrent outgoing `PENDING` default 5;
  - unknown-field rejection, participant authorization và privacy-safe errors.
- Preserve existing listing inquiry messaging, block/report, notifications and admin flows; không generic-refactor hai miền chat.

### Specification coverage

Mục 12–14 cho block interaction, 19–20, 22–31, 33 và 35 của Roommate V1 Specification.

### Khu vực file dự kiến

- Engagement Roommate message/safety/service/repository/controller/validation/routes.
- Existing Engagement notification/contact-safety/admin modules chỉ tại extension points cần thiết.
- Gateway-independent service tests và disposable database tests.

### Tests và checks bắt buộc

- Message authorization/state/read/pagination/plain-text/length tests.
- Message create đua leave/block/reject/expiration; sau terminal/block không có write lọt qua.
- Notification atomicity, dedupe, content minimization và delivery retry tests.
- Block two-way discovery/direct interaction behavior và exact terminal transition tests.
- Report target/category/context/dedupe/evidence/event-history tests.
- Admin moderation authorization, hide/restore và append-only tests.
- Rate-limit/pending-cap/unknown-field/generic-error tests.
- Privacy tests khẳng định không contact, exact location, internal ID, block/report/moderation reason hoặc message body trong log/notification.
- Full Engagement test suite và strict TypeScript check.

### Done condition

- Engagement trực tiếp cung cấp đầy đủ backend contract Roommate V1, gồm interaction và safety.
- Inquiry/contact capability hiện có không regression.
- Business-critical privacy/safety/race cases có explicit tests.
- Không triển khai Gateway route hoặc frontend sớm.
- Tất cả required checks pass; diff chỉ thuộc milestone 04.
- Tạo một commit: `them nhan tin va an toan roommate`.

## 10. `ROOMMATE-V1-05` — Gateway & Frontend

### Mục tiêu

Đưa backend Roommate đã ổn định qua API Gateway và cung cấp toàn bộ tenant/admin frontend surfaces theo specification, responsive và privacy-safe.

### Bắt buộc dùng guidance trước frontend edit

Trước khi sửa frontend, agent triển khai phải inspect `.codex/skills` và đọc đầy đủ `SKILL.md` của skill được chọn. Tối thiểu phải đánh giá:

- `.codex/skills/ui-ux-pro-max/SKILL.md`.
- Các taste skill liên quan hiện có như `flow-patterns`, `hierarchy-principles`, `quality-checklist` và `visual-audit`.

Chỉ dùng các skill thực sự liên quan đến flow/surface đang làm và tuân thủ trigger/instruction của skill tại thời điểm đó. Skill giúp nâng chất lượng UI/UX nhưng không được đổi enum, lifecycle, privacy projection, wording an toàn hoặc bất kỳ contract nào trong Roommate V1 Specification.

### Phạm vi và checklist nội bộ

- API Gateway:
  - Route toàn bộ public/admin Roommate paths tới Engagement.
  - Giữ auth cookie, trusted caller context, origin/CORS, request ID, body limit, rate/error semantics.
  - Contract test route ownership, methods, query/body pass-through và no fallback-to-monolith.
- Frontend infrastructure:
  - Typed Roommate API client dùng `credentials: "include"`.
  - Query/form/error helpers trong phạm vi feature; không lưu/read JWT.
  - Tenant-only navigation và UX guards, backend authorization vẫn là thẩm quyền.
- Frontend surfaces:
  - Roommate profile create/edit.
  - Discovery/filter/pagination.
  - Create/edit/mine request, linked/unlinked modes, expiration/renew/link/unlink/cancel.
  - Request detail và initial interest.
  - Incoming/outgoing interests và state actions.
  - Conversation/read state.
  - Current connection và leave/block/report.
  - Listing Detail CTA `Tìm 1 người ở ghép` chỉ trong eligible context.
  - Admin roommate report/moderation surfaces trong admin patterns hiện có.
- Safety/UX:
  - Safe listing wording, long/short scam warnings và checklist ở đúng placements.
  - Không contact reveal, trust/verified badge, compatibility score, map, booking/reservation implication hoặc AI.
  - Loading, empty, validation, `401/403/404/409/422/429/503`, retry-safe và terminal read-only states.
  - Responsive, keyboard/focus, contrast, semantic labels, 44px touch targets và reduced motion phù hợp design system hiện tại.

### Specification coverage

Mục 5, 15–21, 23–29, 31–33 và 35 của Roommate V1 Specification ở Gateway/frontend layer.

### Khu vực file dự kiến

- `services/api-gateway` route table/proxy/tests.
- `frontend/app` Roommate routes và existing listing/admin integration points.
- `frontend/features/roommate`, `frontend/lib/api`, shared presentational components chỉ khi cần.
- Frontend Vitest/Testing Library tests; Playwright fixture/spec foundation cho milestone 06.

### Tests và checks bắt buộc

- Gateway contract tests cho toàn bộ Roommate route family và admin route protection.
- Frontend query/validation/component/page tests cho mọi surface và critical state.
- CTA eligibility/wording tests trên Listing Detail.
- Privacy tests không render contact/internal/moderation data; safety copy/checklist placement tests.
- Accessibility-focused component tests và responsive browser spot checks ở 375px, 768px, 1024px và desktop rộng.
- Frontend typecheck, lint, focused tests và production build.
- Existing listing/contact/admin frontend regression tests liên quan.

### Done condition

- Active tenant đi được toàn bộ UI paths của Flow A và Flow B tới trước bước release E2E.
- Gateway không route Roommate về monolith và giữ đúng security/error contracts.
- UI thống nhất RentMate, đạt responsive/accessibility states và không vượt specification.
- Tất cả required checks pass; diff chỉ thuộc milestone 05.
- Tạo một commit: `them giao dien va dinh tuyen roommate`.

## 11. `ROOMMATE-V1-06` — Integration & Release

### Mục tiêu

Chứng minh Roommate V1 hoạt động end-to-end qua Gateway trên kiến trúc microservices thật, xử lý đúng failure/race/privacy cases và sẵn sàng phát hành.

### Phạm vi và checklist nội bộ

- Flow A E2E: eligible listing -> linked request -> discovery -> interest/chat -> accept -> current connection.
- Flow B E2E: unlinked request -> filters -> interest/chat -> accept -> normal listing search continuation.
- Listing lifecycle integration:
  - invalid while `OPEN` -> effective suspension/no new interest/no accept/unlink-or-cancel;
  - invalid after `MATCHED` -> historical context/unavailable UI, connection không bị phá.
- Expiration/renew/reminder/pending-interest handling qua scheduler và direct request boundary.
- Block/report/moderation end-to-end qua tenant/admin UI và Gateway.
- Concurrency suite chạy lại trên PostgreSQL disposable database, gồm cross-role active commitment races.
- Privacy/security verification qua Gateway: auth/activity/role/origin, ownership, blocked/hidden disclosure, safe DTO/log/notification content.
- Gateway routing E2E, dependency unavailable behavior và recovery.
- Chạy typecheck, lint, format check, service/backend/frontend tests và frontend production build.
- Chỉ sửa defect trực tiếp cần cho Roommate V1 release readiness; không thêm V2/V3 feature hoặc refactor ngoài scope.
- Cập nhật tài liệu vận hành/test command chỉ khi implementation thực tế cần để người khác tái chạy release verification.

### Khu vực file dự kiến

- E2E/integration test fixtures và scripts tại service/Gateway/frontend locations hiện có.
- Roommate implementation files từ task 01–05 chỉ khi sửa release-blocking defect.
- README hoặc microservice runbook nhỏ nếu cần mô tả migration/start/test Roommate.
- Không thay đổi frozen MVP roadmap hoặc lịch sử RM task.

### Release checks bắt buộc

Các command chính xác có thể được bổ sung bằng focused script trong task 01–05, nhưng release gate tối thiểu phải bao gồm:

```text
npx.cmd tsc --noEmit -p services/identity-service/tsconfig.json
npx.cmd tsc --noEmit -p services/listing-service/tsconfig.json
npx.cmd tsc --noEmit -p services/engagement-service/tsconfig.json
npm.cmd --prefix services/identity-service test
npm.cmd --prefix services/listing-service test
npm.cmd --prefix services/engagement-service test
npm.cmd --prefix services/api-gateway test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run test
npm.cmd --prefix frontend run build
```

Ngoài ra phải chạy:

- Clean/existing migration verification trên disposable microservice databases.
- Focused Roommate PostgreSQL concurrency suite.
- Focused Roommate Gateway/Playwright E2E suite cho Flow A, Flow B và safety-critical paths.
- Existing contact/listing/admin regression suites bị ảnh hưởng.

Không claim pass cho command không chạy được. Mỗi failure phải được phân loại implementation hay environment; environment limitation ngăn chứng minh release gate thì task 06 vẫn mở.

### Done condition

- Flow A và Flow B pass end-to-end qua Gateway.
- Listing invalidity, expiration, block/report/moderation, concurrency, privacy và security acceptance pass.
- Không có unresolved Roommate V1 release blocker hoặc required check failure.
- Specification/roadmap chỉ được cập nhật để phản ánh implementation đã phê duyệt; không feature creep.
- Final diff chỉ gồm Roommate V1 hoặc fix trực tiếp bắt buộc cho release.
- Tạo một commit: `hoan thien tich hop va san sang phat hanh roommate v1`.

## 12. Definition of complete cho toàn Roommate V1

Roommate V1 chỉ hoàn tất khi cả sáu checkpoint commit tồn tại theo thứ tự, task 06 đạt release gate và:

- Bốn persisted Roommate entities đúng specification; không có Match/Group/score table.
- Identity/Listing/Engagement/Gateway ownership đúng microservice boundary.
- Invariants `RM-RM-INV-001` đến `RM-RM-INV-020` có test evidence phù hợp.
- Hai flow, listing lifecycle, expiration, messaging và safety hoạt động qua frontend/Gateway.
- Không contact/exact location/internal moderation leakage.
- Không V2/V3 feature leak.
- Các thay đổi không liên quan vẫn được giữ nguyên và không nằm trong sáu commits.
- Không push cho đến khi có yêu cầu riêng.

Roadmap này không cho phép tạo thêm implementation task ID chỉ để tách nhỏ checklist. Nếu một milestone gặp blocker thật, milestone đó vẫn mở cho đến khi được giải quyết hoặc người dùng thay đổi scope.
