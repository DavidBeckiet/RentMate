# Roommate Matching V2 Specification

## 1. Status and authority

| Thuộc tính | Giá trị |
| --- | --- |
| Trạng thái | **APPROVED — FROZEN FOR IMPLEMENTATION** |
| Phạm vi | Post-release Roommate Matching V2 |
| Kiến trúc đích | API Gateway + Identity Service + Listing Service + Engagement Service + Next.js frontend |
| Chủ sở hữu nghiệp vụ | Engagement Service |
| Hợp đồng nền | `ROOMMATE_V1_SPECIFICATION.md` và `ROOMMATE_BLOCK_MANAGEMENT_API_ADDENDUM.md` |

Tài liệu này là hợp đồng sản phẩm, an toàn, API, dữ liệu và hành vi đã được phê duyệt cho Roommate V2 Core. Tài liệu không phải mã nguồn và không tự cho phép triển khai nhiều milestone cùng lúc.

Thứ tự ưu tiên khi giải thích V2 là: yêu cầu triển khai hiện tại của người dùng, tài liệu này, hợp đồng Roommate V1, rồi mới tới implementation hiện tại. V2 là phần mở rộng tương thích; mọi hành vi V1 không được tài liệu này thay đổi vẫn giữ nguyên. Nếu implementation phát hiện xung đột sản phẩm thực sự, phải dừng phần xung đột và xin quyết định thay vì tự sửa hợp đồng đã đóng băng.

## 2. Goals

V2 phải giúp tenant đánh giá một roommate candidate rõ ràng và an toàn hơn mà không tạo cảm giác RentMate biết chắc hai người sẽ sống hợp nhau. Mục tiêu cụ thể:

- giải thích mức độ phù hợp bằng quy tắc có cấu trúc, xác định và kiểm thử được;
- đưa ra các sự kiện xác minh đúng nghĩa, không biến chúng thành “trust score”;
- hỗ trợ admin ưu tiên report Roommate bằng cờ rủi ro có bằng chứng;
- giữ nguyên quyền riêng tư, block hai chiều, moderation và vòng đời V1;
- không phụ thuộc AI và không biến Roommate thành booking, payment hoặc lease workflow.

## 3. V1 baseline

V2 tái sử dụng nguyên trạng các nền tảng sau:

- một `RoommateProfile` hoàn chỉnh cho mỗi tenant với `intro`, `sleepSchedule`, `cleanlinessLevel`, `noisePreference`, `smokingEnvironment`, `petEnvironment`;
- `RoommateRequest` cho đúng một roommate, có area, budget, move-in window và optional listing;
- `RoommateInterest`, connection suy ra từ interest `ACCEPTED`, conversation theo interest;
- request/interest/message lifecycle, active-commitment invariant và locking V1;
- block, unblock, report, moderation, notifications, anti-spam và rate limit V1;
- public-safe Identity projection và Listing public-summary/eligibility projection;
- `/api/v1` là namespace API hiện hành, kể cả capability Roommate post-MVP.

V2 không diễn giải lại lịch sử V1 và không sửa các state hiện có.

## 4. Scope

| Capability | Decision | Lý do |
| --- | --- | --- |
| Deterministic compatibility | `CORE V2` | Dùng được tám dimension có cấu trúc hiện có và kiểm thử tái lập được. |
| Compatibility explanation | `CORE V2` | Giúp tenant hiểu từng điểm phù hợp/khác biệt mà không cần score hoặc AI. |
| Tenant factual verification badges | `CORE V2` | Identity đã có source columns/challenge foundation; cần mở flow tenant và public-safe booleans. |
| Rule-based scam/risk heuristics | `CORE V2` | Dữ liệu message/interest/report/block hiện có đủ cho bounded admin-only flags. |
| Risk-prioritized admin review | `CORE V2` | Cải thiện triage mà không tự động xử phạt hoặc lộ risk data. |
| Landlord confirmation | `V2.x CANDIDATE` | Có giá trị tiềm năng nhưng cần lifecycle riêng và dễ bị hiểu sai thành booking. |
| Listing-aware suggestions | `V2.x CANDIDATE` | Có thể compose bằng deterministic filters, nhưng joint intent sau match chưa được mô hình hóa. |
| Compatibility-based ranking | `V2.x CANDIDATE` | Cần product/performance evidence và pagination contract trước khi đổi ordering. |
| Additional lifestyle fields | `V2.x CANDIDATE` | Chỉ thêm sau research; V1 chưa có work/study hoặc guest-frequency fields. |
| `RoommateGroup` | `DEFERRED` | Giá trị chưa được chứng minh trong khi lifecycle, concurrency và safety phức tạp đáng kể. |
| AI/semantic capabilities | `DEFERRED` | Thuộc V3 và cần evaluation/privacy/fallback contract riêng. |
| Numeric/percentage compatibility hoặc trust/risk score | `REJECTED` | Tạo cảm giác chính xác/quyền lực mà dữ liệu hiện tại không chứng minh. |

### 4.1 V2 Core

1. Compatibility có tính xác định từ đúng các field V1 hiện có.
2. Compatibility category và giải thích theo từng dimension, không có điểm hoặc phần trăm.
3. Tenant-facing email/phone verification flow và factual public-safe badges.
4. Rule-based Roommate risk flags chỉ phục vụ admin review.
5. Admin report priority và evidence summary có tính xác định.
6. UX giải thích “vì sao phù hợp/cần trao đổi” và nhắc an toàn không mang tính phán quyết.

### 4.2 V2.x candidates

- landlord confirmation cho một accepted connection gắn với listing;
- deterministic listing suggestions dựa trên Roommate request;
- compatibility-based discovery ordering sau khi có bằng chứng về quy mô và hiệu quả;
- bổ sung structured lifestyle fields như work/study pattern hoặc guest frequency chỉ sau product research và privacy review.

Các mục V2.x không phải done condition của V2 Core.

### 4.3 Deferred to V3

- natural-language preference parsing;
- semantic roommate hoặc listing recommendation;
- AI-generated match explanation;
- AI message scam classification;
- AI admin review assistance hoặc moderation suggestion.

## 5. Non-goals

V2 Core không gồm:

- compatibility score, phần trăm, “perfect match”, “safe roommate” hoặc “trusted user”;
- protected-class matching, suy luận giới tính, tôn giáo, dân tộc, sức khỏe, thu nhập hoặc đặc điểm nhạy cảm;
- tự động reject, block, hide, suspend hoặc deactivate account dựa trên heuristic;
- booking, reservation, deposit, payment, lease hoặc bảo đảm landlord chấp nhận;
- thay đổi V1 request/interest/connection states;
- group, group chat, group roles hoặc nhiều active commitments;
- service Roommate mới, shared database hoặc cross-service foreign key;
- lưu compatibility result, risk score hoặc bản sao Identity/Listing trong Engagement;
- đọc `intro`, `note` hoặc message bằng AI để tính compatibility.

## 6. Actors

| Actor | Quyền trong V2 Core |
| --- | --- |
| Active tenant | Xác minh liên hệ của chính mình; xem compatibility và factual badges trong các Roommate surface được V1 cho phép. |
| Admin | Xem cờ rủi ro, evidence summary, report history và moderation events; quyết định moderation theo workflow hiện có. |
| Landlord | Không có actor flow mới trong Core. Landlord confirmation chỉ là V2.x candidate. |
| Anonymous/inactive/wrong-role user | Không có quyền dùng Roommate V2; giữ nguyên disclosure behavior V1. |
| Internal service | Chỉ dùng authenticated internal projections đúng owner; không được browser gọi trực tiếp. |

## 7. Core user flows

### 7.1 Compatibility discovery

1. Active tenant có visible, complete Roommate profile mở discovery.
2. Engagement lọc candidate theo toàn bộ eligibility, block, moderation và Listing rules V1 trước.
3. Engagement lấy public-safe profile/identity projections theo batch.
4. Compatibility engine so sánh profile của caller với profile của request owner; request intent chỉ được so sánh khi caller có nguồn intent hợp lệ.
5. Discovery vẫn sắp xếp newest như V1 và trả category cùng tối đa ba highlights quan trọng nhất.
6. Request detail trả toàn bộ evaluated dimensions để tenant tự cân nhắc trước khi gửi interest.

Nếu caller chưa có complete visible profile, discovery V1 vẫn hoạt động nhưng `compatibility` là `null`; UI hướng dẫn hoàn thiện profile. Không được suy đoán từ dữ liệu thiếu.

### 7.2 Tenant verification

1. Active tenant mở trạng thái xác minh riêng tư của chính mình.
2. Tenant yêu cầu challenge email hoặc phone qua Identity.
3. Identity áp dụng rate limit, challenge expiry, attempt limit và provider delivery hiện có.
4. Tenant confirm challenge; Identity ghi timestamp nguồn sự thật.
5. Public Roommate projection chỉ trả boolean tương ứng. Email, phone, token, code và timestamp chính xác không xuất hiện trong Roommate response.

Production release của badge yêu cầu delivery provider thật cho channel tương ứng hoạt động. Channel chưa có provider ổn định không được hiển thị như một capability hoàn tất.

### 7.3 Risk-assisted admin review

1. Tenant tạo report bằng workflow V1.
2. Khi admin đọc Roommate report queue/detail, Engagement tính các risk flags theo rule version hiện hành từ dữ liệu nguồn sự thật.
3. Queue chia `ELEVATED` và `STANDARD`, không trả numeric score.
4. Admin xem evidence summary, report events và nội dung được V1 cho phép trước khi hành động.
5. Chỉ quyết định admin rõ ràng mới thay đổi report/moderation state; heuristic không tự xử phạt.

## 8. Compatibility model

### 8.1 Inputs

Compatibility Core chỉ được dùng các input sau:

| Dimension | Caller input | Candidate input |
| --- | --- | --- |
| Sleep schedule | `RoommateProfile.sleepSchedule` | cùng field |
| Cleanliness | `RoommateProfile.cleanlinessLevel` | cùng field |
| Noise/social environment | `RoommateProfile.noisePreference` | cùng field |
| Smoking environment | `RoommateProfile.smokingEnvironment` | cùng field |
| Pet environment | `RoommateProfile.petEnvironment` | cùng field |
| Budget | effective caller intent | `RoommateRequest.budgetMinPerPerson` / `budgetMaxPerPerson` |
| Area | effective caller intent | linked listing `areaName` hoặc unlinked `preferredAreaKeys` |
| Move-in | effective caller intent | `RoommateRequest.moveInFrom` / `moveInUntil` |

`intro`, request `note`, message body, report, block và verification state không được dùng để tính compatibility.

Effective caller intent được chọn độc lập theo từng request dimension:

1. filter hiện diện trong discovery query;
2. nếu filter thiếu, field tương ứng từ caller-owned current `OPEN` request;
3. nếu cả hai thiếu, dimension là `NOT_EVALUATED`.

Một linked caller request lấy area từ current Listing public summary. Nếu Listing không còn public hoặc dependency không xác nhận được thì áp dụng đúng fail-closed behavior V1: candidate bị loại hoặc request detail trả dependency error. Không hạ dependency failure thành `NOT_EVALUATED`, không dùng snapshot hoặc exact address.

### 8.2 Normalization

- Enum phải là canonical uppercase value đã được validation V1 chấp nhận.
- Text area dùng NFC, trim, collapse internal whitespace và Unicode case folding theo AreaKey/`areaName` hiện hành; hai tập area tương thích khi giao khác rỗng. Không fuzzy-match, tọa độ, bán kính hoặc tự suy luận địa giới.
- Budget dùng integer VND và inclusive range overlap. Query chỉ có lower hoặc upper bound được xem là interval mở ở phía còn thiếu theo đúng filter semantics V1; không suy ra một con số preference mới.
- Move-in dùng calendar date `YYYY-MM-DD` và inclusive date-window overlap. Query chỉ có một bound được xem là window mở ở phía còn thiếu theo đúng filter semantics V1.
- Missing hoặc unavailable input không được thay bằng default giả.
- Rule output phải kèm `rulesVersion`; phiên bản Core đầu tiên là `ROOMMATE_COMPAT_V2_1`.

### 8.3 Dimension outcomes

Mỗi dimension trả đúng một outcome:

```text
ALIGNED
NEUTRAL
DISCUSS
IMPORTANT_DIFFERENCE
NOT_EVALUATED
```

Quy tắc lifestyle và explanation code là closed set sau. “Một bên” là đối xứng, vì vậy đổi vị trí caller/candidate không đổi outcome/code.

| Dimension | Điều kiện chính xác | Outcome | Explanation code |
| --- | --- | --- | --- |
| Sleep | Một input thiếu | `NOT_EVALUATED` | `SLEEP_NOT_EVALUATED` |
| Sleep | Hai giá trị giống nhau | `ALIGNED` | `SLEEP_ALIGNED_SAME` |
| Sleep | Một bên `FLEXIBLE`, sau rule giống nhau | `NEUTRAL` | `SLEEP_NEUTRAL_FLEXIBLE` |
| Sleep | Mọi cặp khác | `DISCUSS` | `SLEEP_DISCUSS_DIFFERENT` |
| Cleanliness | Một input thiếu | `NOT_EVALUATED` | `CLEANLINESS_NOT_EVALUATED` |
| Cleanliness | Hai giá trị giống nhau | `ALIGNED` | `CLEANLINESS_ALIGNED_SAME` |
| Cleanliness | Một bên `BALANCED`, sau rule giống nhau | `NEUTRAL` | `CLEANLINESS_NEUTRAL_BALANCED` |
| Cleanliness | `RELAXED` đối `TIDY` | `DISCUSS` | `CLEANLINESS_DISCUSS_DIFFERENT` |
| Noise | Một input thiếu | `NOT_EVALUATED` | `NOISE_NOT_EVALUATED` |
| Noise | Hai giá trị giống nhau | `ALIGNED` | `NOISE_ALIGNED_SAME` |
| Noise | Một bên `BALANCED`, sau rule giống nhau | `NEUTRAL` | `NOISE_NEUTRAL_BALANCED` |
| Noise | `QUIET` đối `SOCIAL` | `DISCUSS` | `NOISE_DISCUSS_DIFFERENT` |
| Smoking | Một input thiếu | `NOT_EVALUATED` | `SMOKING_NOT_EVALUATED` |
| Smoking | Hai giá trị giống nhau | `ALIGNED` | `SMOKING_ALIGNED_SAME` |
| Smoking | Một bên `NO_PREFERENCE`, sau rule giống nhau | `NEUTRAL` | `SMOKING_NEUTRAL_NO_PREFERENCE` |
| Smoking | `SMOKE_FREE` đối `OUTDOOR_ONLY` | `IMPORTANT_DIFFERENCE` | `SMOKING_IMPORTANT_DIFFERENCE_SMOKE_FREE_OUTDOOR` |
| Pets | Một input thiếu | `NOT_EVALUATED` | `PETS_NOT_EVALUATED` |
| Pets | Hai giá trị giống nhau | `ALIGNED` | `PETS_ALIGNED_SAME` |
| Pets | Một bên `OK_WITH_PETS`, sau rule giống nhau | `NEUTRAL` | `PETS_NEUTRAL_OK_WITH_PETS` |
| Pets | `NO_PETS` đối `HAS_PET` | `IMPORTANT_DIFFERENCE` | `PETS_IMPORTANT_DIFFERENCE_NO_PETS_HAS_PET` |

Quy tắc request intent:

| Dimension | Input A | Input B | Điều kiện | Outcome | Explanation code |
| --- | --- | --- | --- | --- | --- |
| Budget | Effective caller budget interval | Candidate min/max interval | Một interval thiếu | `NOT_EVALUATED` | `BUDGET_NOT_EVALUATED` |
| Budget | như trên | như trên | Inclusive overlap | `ALIGNED` | `BUDGET_ALIGNED_OVERLAP` |
| Budget | như trên | như trên | Không overlap | `IMPORTANT_DIFFERENCE` | `BUDGET_IMPORTANT_DIFFERENCE_NO_OVERLAP` |
| Area | Effective caller normalized area set | Candidate effective normalized area set | Một set thiếu/rỗng | `NOT_EVALUATED` | `AREA_NOT_EVALUATED` |
| Area | như trên | như trên | Giao khác rỗng | `ALIGNED` | `AREA_ALIGNED_OVERLAP` |
| Area | như trên | như trên | Hai set đầy đủ nhưng giao rỗng | `IMPORTANT_DIFFERENCE` | `AREA_IMPORTANT_DIFFERENCE_NO_OVERLAP` |
| Move-in | Effective caller date window | Candidate date window | Một window thiếu | `NOT_EVALUATED` | `MOVE_IN_NOT_EVALUATED` |
| Move-in | như trên | như trên | Inclusive overlap | `ALIGNED` | `MOVE_IN_ALIGNED_OVERLAP` |
| Move-in | như trên | như trên | Không overlap | `IMPORTANT_DIFFERENCE` | `MOVE_IN_IMPORTANT_DIFFERENCE_NO_OVERLAP` |

`NEUTRAL` không có nghĩa là phù hợp hoặc không phù hợp; nó chỉ nói một lựa chọn có tính linh hoạt. `IMPORTANT_DIFFERENCE` là lời nhắc phải trao đổi, không phải quyết định cấm tương tác.

### 8.4 Hard mismatch

**Core không có hard mismatch tự động.** V1 không có field `nonNegotiable`, vì vậy ngay cả `NO_PETS` đối `HAS_PET` hoặc `SMOKE_FREE` đối `OUTDOOR_ONLY` cũng chỉ là `IMPORTANT_DIFFERENCE`. Chúng không được tự loại candidate, từ chối interest hoặc thay đổi lifecycle.

Các discovery filters do caller nhập vẫn là filters như V1; đó là lựa chọn tìm kiếm của caller, không phải compatibility punishment.

### 8.5 Overall category

Output category là:

```text
HIGH_ALIGNMENT
MIXED
IMPORTANT_DIFFERENCE
```

Quy tắc chính xác:

1. Có ít nhất một dimension `IMPORTANT_DIFFERENCE` → `IMPORTANT_DIFFERENCE`, kể cả khi đó là dimension duy nhất đánh giá được.
2. Nếu không có important difference và chỉ có từ zero đến ba dimension được đánh giá → overall category là `null`; UI dùng trạng thái “Chưa đủ dữ liệu để tổng hợp”, không gọi đây là một category mới.
3. Nếu có ít nhất bốn dimension được đánh giá, ít nhất ba `ALIGNED` và không quá một `DISCUSS` → `HIGH_ALIGNMENT`.
4. Mọi trường hợp còn lại có ít nhất bốn dimension được đánh giá → `MIXED`.

`evaluatedCount` đếm mọi outcome trừ `NOT_EVALUATED`. `NEUTRAL` được tính là đã đánh giá nhưng không tăng số `ALIGNED`. `NOT_EVALUATED` không thưởng và không phạt. Không chuyển category thành số hoặc phần trăm.

### 8.6 Sorting and persistence

V2 Core **không đổi discovery ordering**. Thứ tự vẫn `createdAt DESC`, rồi `requestId DESC` sau khi áp dụng eligibility/filtering V1. Điều này tránh tạo ranking có vẻ chính xác quá mức và giữ pagination tương thích.

Compatibility được tính khi đọc từ source-of-truth hiện tại, không lưu database, không cache/materialize và không tạo `CompatibilityScore` table. Compatibility ordering là V2.x candidate cần performance/product evidence và một hợp đồng pagination riêng.

## 9. Compatibility explanation

DTO compatibility dùng stable code thay vì câu văn backend:

```text
compatibility: {
  rulesVersion: "ROOMMATE_COMPAT_V2_1",
  category: "HIGH_ALIGNMENT" | "MIXED" | "IMPORTANT_DIFFERENCE" | null,
  evaluatedCount: number,
  dimensions: [{
    dimension: "SLEEP" | "CLEANLINESS" | "NOISE" | "SMOKING" |
               "PETS" | "BUDGET" | "AREA" | "MOVE_IN",
    outcome: "ALIGNED" | "NEUTRAL" | "DISCUSS" |
             "IMPORTANT_DIFFERENCE" | "NOT_EVALUATED",
    explanationCode: string
  }]
}
```

`explanationCode` phải là đúng một code đã đóng băng trong bảng mục 8.3. Frontend ánh xạ code sang copy đã review; backend không trả prose động và frontend không tự suy luận outcome từ raw values.

Surface rules:

- discovery card: category và tối đa ba dimensions đã đánh giá, ưu tiên `IMPORTANT_DIFFERENCE`, rồi `ALIGNED`, `DISCUSS`, `NEUTRAL`; không hiển thị `NOT_EVALUATED` trong compact highlights; tie theo thứ tự `PETS`, `SMOKING`, `BUDGET`, `MOVE_IN`, `AREA`, `SLEEP`, `CLEANLINESS`, `NOISE`;
- request detail: toàn bộ eight dimensions theo thứ tự cố định trên;
- interest composer: tái sử dụng summary đã tải từ request detail, không thay đổi first-message contract;
- conversation/current connection: không cần compatibility badge trong Core; đây là công cụ cân nhắc trước khi kết nối, không phải phán xét mối quan hệ đang diễn ra.

Copy tiếng Việt chuẩn cho overall state: `HIGH_ALIGNMENT` → “Nhiều điểm phù hợp”, `MIXED` → “Có điểm cần trao đổi”, `IMPORTANT_DIFFERENCE` → “Có khác biệt quan trọng”, `null` → “Chưa đủ dữ liệu để tổng hợp”. Không dùng “hoàn hảo”, “an toàn”, “đáng tin” hoặc ngôn ngữ hẹn hò/gamification.

## 10. Verification and factual trust signals

### 10.1 Approved facts

| Fact | Owner | Public Roommate output | Meaning |
| --- | --- | --- | --- |
| Email verified | Identity | `emailVerified: boolean` | Identity đã hoàn tất challenge cho email hiện tại. |
| Phone verified | Identity | `phoneVerified: boolean` | Identity đã hoàn tất challenge cho phone hiện tại. |
| Member since | Identity | `memberSince: YYYY-MM` | Tháng tạo account, đã có từ V1. |

Badge độc lập theo từng fact; không yêu cầu cả email và phone mới được dùng Roommate. Contact verification không bảo đảm danh tính pháp lý, hành vi tương lai, khả năng chi trả hoặc độ an toàn.

### 10.2 Projection rules

Identity projection hiện có đúng `tenantId`, `role`, `displayName`, `isActive`, `memberSince`. V2 mở rộng projection này bằng đúng `emailVerified` và `phoneVerified`; không trả contact value hoặc timestamp. Engagement không lưu hai boolean này. Public Roommate DTO chỉ nhận boolean từ current Identity response và fail closed theo V1 nếu Identity projection bắt buộc không sẵn sàng.

Tenant self-service verification response là owner-private và trả current contact giống contact-verification DTO hiện có; tuyệt đối không đi qua Roommate DTO. Tenant response không có landlord `profile` field.

### 10.3 Tenant verification lifecycle

- Email challenge hết hạn sau 30 phút; phone challenge hết hạn sau 5 phút; mỗi challenge cho phép tối đa 5 lần confirm sai, đúng behavior Identity hiện có.
- Request và confirm dùng shared contact-verification rate limit hiện có: 5 operations trong 15 phút theo account + IP. Implementation có thể thêm resend cooldown chặt hơn nhưng không được nới limit này.
- Mỗi account/channel chỉ có một challenge dùng được. Request/resend phải serialize theo account + channel, revoke challenge cũ rồi tạo challenge mới trong cùng transaction trước khi delivery.
- Resend làm challenge cũ không còn dùng được. Provider delivery thất bại trả `503 PROVIDER_UNAVAILABLE`, không set verified timestamp và không tạo badge; lần resend sau có thể thay challenge chưa delivery.
- Confirm kiểm tra current destination, expiry, attempt count và secret bằng constant-time comparison. Challenge cho contact cũ không xác minh contact mới.
- Request trên channel đã verified và confirm lặp sau thành công là idempotent no-op, trả current status và không gọi provider.
- Hai confirm concurrent chỉ có một transition ghi timestamp; request còn lại nhận current verified state. Hai resend concurrent không được để lại hai challenge dùng được.
- Email và phone có cấu hình capability độc lập. Channel chưa được cấu hình production provider trả `available: false` trong owner status và từ chối start/resend bằng `503`; channel còn lại vẫn hoạt động.
- Badge public chỉ hiển thị khi boolean verified thật là `true`; `available` không phải badge. Verified fact đã hoàn tất vẫn là fact khi provider bị gián đoạn tạm thời.

## 11. Safety and risk rules

Risk rules Core chỉ chạy cho admin report queue/detail. Chúng không xuất hiện trong public/participant DTO và không dùng để tính compatibility. Core có đúng finite signal set sau; thêm signal mới là product-contract change.

| Flag code | Điều kiện xác định | Cấu hình bắt buộc | Dữ liệu hiện có | Effect |
| --- | --- | --- | --- | --- |
| `REPEATED_MESSAGE_ACROSS_THREADS` | Cùng normalized body được subject gửi tới số counterpart khác nhau đạt threshold trong window. | `repeatedMessageWindowMs`, `repeatedMessageCounterpartThreshold` | `roommate_messages`, `roommate_interests`, `roommate_requests` | Admin triage only |
| `RAPID_INTEREST_ACTIVITY` | Số interests subject tạo đạt threshold trong window. | `rapidInterestWindowMs`, `rapidInterestCountThreshold` | `roommate_interests` | Admin triage only |
| `HIGH_MESSAGE_VOLUME` | Message count và distinct-interest count của subject đồng thời đạt threshold trong window. | `highMessageWindowMs`, `highMessageCountThreshold`, `highMessageThreadThreshold` | `roommate_messages` | Admin triage only |
| `REPEATED_EXTERNAL_CONTACT_SOLICITATION` | Versioned pattern set phát hiện URL ngoài, phone/account-number-like token, chuyển tiền hoặc OTP trong messages gửi tới số counterpart khác nhau đạt threshold trong window. Một message đơn lẻ không đủ tạo flag này. | `solicitationWindowMs`, `solicitationCounterpartThreshold`, `solicitationPatternVersion` | `roommate_messages`, `roommate_interests` | Admin triage only |
| `REPEATED_REPORT_PATTERN` | Active Roommate report count và distinct-reporter count nhắm subject đồng thời đạt threshold trong window. | `reportWindowMs`, `reportCountThreshold`, `reporterCountThreshold` | `contact_reports` | Admin triage only |
| `MULTIPLE_CURRENT_BLOCKERS` | Số tenant khác có current block row nhắm subject, được tạo trong window, đạt threshold. | `currentBlockWindowMs`, `currentBlockerThreshold` | `contact_blocks` | Admin triage only |
| `NEW_ACCOUNT_WITH_UNUSUAL_ACTIVITY` | Account age nhỏ hơn configured window và đồng thời có ít nhất một trong ba flag repetition/interest/message-volume đầu tiên. | `newAccountWindowMs` | Identity internal exact `createdAt` + Engagement data | Admin triage only |

Normalized repeated-message body dùng NFC, trim, line-ending normalization, collapse whitespace và Unicode case folding. Nội dung không được ghi vào log; evidence chỉ trỏ tới message IDs mà admin đã được phép xem.

`MULTIPLE_CURRENT_BLOCKERS` không tuyên bố lịch sử unblock vì hiện tại unblock xóa block row. Không được suy diễn dữ liệu lịch sử không tồn tại.

Mọi threshold/window phải là positive bounded configuration, được startup validation, có default được ghi trong implementation configuration và có boundary tests. Product specification không đóng đinh con số chưa có evidence. `rulesVersion` phải nhận diện cả rule meaning, threshold set và pattern version; Core baseline dùng prefix `ROOMMATE_RISK_V2_1`. Thay meaning, default threshold hoặc pattern set phải đổi version và regression tests.

Risk flags được compute on read cho queue/detail; không lưu score, không tạo risk table và không cập nhật `contact_reports.evidence_snapshot`. Evidence summary chỉ chứa bounded IDs/count/window mà admin hiện tại được phép truy cập. Nếu admin hành động, report/moderation state và append-only event kèm required admin note hiện có là lịch sử có thẩm quyền; computed flag không thay thế quyết định đó.

## 12. Admin review

Mỗi Roommate admin report trả thêm:

```text
riskSummary: {
  rulesVersion: "ROOMMATE_RISK_V2_1",
  reviewPriority: "ELEVATED" | "STANDARD",
  partialEvaluation: boolean,
  flags: [{ code, observedCount, windowStartedAt, evidenceSummary }],
  evaluatedAt
}
```

`observedCount` và `windowStartedAt` có thể `null` khi rule không thể mô tả bằng một count/window an toàn. Không trả numeric risk score.

`evidenceSummary` là object theo flag, chỉ dùng các field cần thiết trong closed allowlist: `messageIds`, `interestIds`, `reportIds`, `distinctCounterpartCount`, `distinctReporterCount`, `currentBlockerCount`, `accountCreatedAt`. ID arrays tối đa 20 items, sort `createdAt DESC` rồi `id DESC`; field không liên quan phải bỏ, không trả `null` hàng loạt. Không thêm raw message/report text hoặc reporter/blocker identity vào summary; admin mở existing authorized resource để xem context đầy đủ.

Priority rule:

1. `ELEVATED` nếu có ít nhất hai independent flags;
2. hoặc có `REPEATED_REPORT_PATTERN`;
3. hoặc report category là `FRAUD`/`PAYMENT_SCAM` đồng thời có `REPEATED_EXTERNAL_CONTACT_SOLICITATION`;
4. còn lại `STANDARD`.

Queue sort phải được áp dụng trước pagination: `ELEVATED` trước `STANDARD`, trong cùng tier dùng `createdAt ASC`, rồi `reportId ASC` để tránh report cũ bị đói. Filter status/category V1 vẫn giữ nguyên.

False-positive handling:

- flag chỉ là context cho admin, không phải kết luận;
- admin phải xem evidence trước hành động;
- `DISMISSED` và resolution note V1 ghi nhận quyết định;
- report events tiếp tục append-only;
- không gửi thông báo cho subject về flag hoặc priority;
- không tự động thay đổi Identity account, block, request, interest, message hoặc moderation state.

## 13. Landlord confirmation (V2.x candidate)

Landlord confirmation không thuộc Core. Nếu được phê duyệt cho V2.x, hợp đồng tối thiểu phải là một entity riêng:

- chỉ một participant của current accepted connection có linked request mới được yêu cầu;
- listing phải current eligible và landlord phải là active owner;
- landlord có thể `CONFIRM` hoặc `DECLINE`; requester có thể `CANCEL` khi pending;
- listing không còn eligible trước quyết định làm confirmation `LAPSED`;
- states riêng: `PENDING`, `CONFIRMED`, `DECLINED`, `CANCELLED`, `LAPSED`;
- confirmation là optional fact, không reopen/close request, không restore interest, không giữ listing và không chứng minh lease/payment/reservation;
- không tiết lộ exact address hoặc contact ngoài authorization hiện có.

Mục này cần product approval và threat review riêng trước khi trở thành hợp đồng triển khai.

## 14. Listing-aware recommendations (V2.x candidate)

Không thuộc Core. Candidate design chỉ dùng Listing public search/eligibility truth:

- area từ request;
- `monthlyRent <= 2 × budgetMaxPerPerson` cho một cặp hai người;
- public/available listing và `maxOccupants >= 2`;
- move-in không được suy ra thành listing availability nếu Listing không có field tương ứng;
- kết quả phải ghi rõ “dựa trên yêu cầu của chủ request”, không gọi là joint preference;
- không lưu listing snapshot trong Engagement và không có cross-service FK.

Một recommendation cho accepted connection cần product decision về cách thu thập ý định của cả hai người; Core không tự hợp nhất hai profile/note.

## 15. ROOMMATEGROUP DECISION

**DEFER UNTIL PRODUCT EVIDENCE**

User value có thể có cho ba người tìm cùng nhau hoặc một cặp tìm người thứ ba, nhưng repository hiện chỉ chứng minh workflow một-một. Group sẽ bắt buộc thiết kế mới cho invitation, membership roles, capacity, multiple commitments, concurrent accept/leave, group chat, block direction, report/moderation, listing capacity và landlord interaction. Nó cũng phá giả định connection suy ra từ đúng một accepted interest.

Không có bằng chứng sử dụng, limit nhóm hoặc ownership model được phê duyệt đủ để biện minh cho độ phức tạp đó. Vì vậy Core và V2.x hiện không tạo `RoommateGroup`, `GroupMember`, group states, group endpoints hoặc UI affordance. Quyết định chỉ được mở lại sau discovery định lượng/định tính và một specification riêng.

## 16. State and lifecycle changes

V2 Core không thêm hoặc sửa state machine:

- `RoommateRequest`: giữ `OPEN`, `MATCHED`, `CANCELLED`, `EXPIRED`;
- `RoommateInterest`: giữ `PENDING`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`, `LEFT`;
- connection vẫn suy ra từ accepted interest;
- compatibility, verification badge và risk flag không thay đổi state;
- block/unblock không restore interest/connection/request;
- moderation và report states giữ nguyên.

Chỉ landlord confirmation V2.x, nếu phê duyệt, có lifecycle độc lập tại mục 13.

## 17. Privacy model

| V2 value | Classification | Được xem bởi |
| --- | --- | --- |
| Contact destination và exact verified timestamp trong self status | `OWNER_PRIVATE` | Chính account và Identity flow cần thiết |
| Challenge/token/code/hash, attempt count, provider config/payload | `INTERNAL_ONLY` | Identity verification runtime cần thiết |
| `emailVerified`, `phoneVerified`, `memberSince` | `PUBLIC_SAFE` | Active tenant trên Roommate surface hợp lệ |
| Compatibility category, evaluated count, dimension outcome/code | `PARTICIPANT_ONLY` | Active tenant được phép xem candidate/request |
| Caller effective intent | `OWNER_PRIVATE` | Caller; output chỉ nêu kết quả so sánh, không chiếu hidden caller request cho candidate |
| Risk flags, risk priority, evidence summary | `ADMIN_ONLY` | Active admin trong report review context |
| Risk configuration/rules version internals | `INTERNAL_ONLY` | Engagement runtime và authorized operations |
| Exact Identity `createdAt` cho risk | `INTERNAL_ONLY` | Identity → Engagement bounded internal call |
| Report identities, notes, events | `ADMIN_ONLY` theo V1 | Active admin |
| Block direction | `OWNER_PRIVATE`/`INTERNAL_ONLY` | Blocker; counterpart không được biết chiều block |

Compatibility chỉ dùng field đã được public Roommate projection cho phép. Không được đưa private note, email, phone, exact address/coordinates hoặc moderation metadata vào explanation.

## 18. Authorization

- Tất cả Roommate V2 browser endpoints yêu cầu cookie session, current active account và role tương ứng như V1.
- Compatibility discovery/detail chỉ dành cho active tenant và vẫn áp dụng self-exclusion, pair-block, profile/request moderation và current listing eligibility.
- Tenant verification endpoints chỉ thao tác account của principal; không nhận `tenantId` từ body/path.
- Admin risk summary chỉ có trên admin report routes và yêu cầu active `ADMIN`.
- Gateway origin/CORS, trusted caller context, request ID và body limit giữ nguyên.
- Internal projections yêu cầu internal service token; browser-provided token không được tin cậy.
- Dependency failure ở facts bắt buộc phải fail closed, không dùng stale badge hoặc fabricated compatibility.

## 19. Service ownership

| Capability | Owner |
| --- | --- |
| Account, role, activity, contact verification, exact account creation time | Identity Service |
| Public-safe identity verification projection | Identity Service |
| Listing lifecycle, public visibility, eligibility, area/rent/maxOccupants | Listing Service |
| Roommate profile/request/interest/message/block/report/notification | Engagement Service |
| Compatibility computation and explanation codes | Engagement Service |
| Risk rules, report priority and evidence summary | Engagement Service |
| Routing, origin/security boundary, internal token injection | API Gateway |
| Accessible labels, highlights and safety copy | Next.js frontend |

Không tạo Roommate Service. Không service nào truy cập database của service khác.

## 20. Data model requirements

### 20.1 Core

- Reuse `roommate_profiles`, `roommate_requests`, `roommate_interests`, `roommate_messages`.
- Reuse extended `contact_blocks`, `contact_reports`, `contact_report_events`, `notifications`.
- Reuse Identity `users.email_verified_at`, `users.phone_verified_at` và `contact_verification_challenges`.
- Không sửa table trong Core.
- Không tạo table mới trong Core.
- Không lưu compatibility result, risk flag, priority hoặc verification copy.
- Không tạo cross-service FK.

Query/index thay đổi chỉ được đề xuất ở roadmap/implementation sau khi có query plan evidence; tài liệu này không phê duyệt index speculative.

### 20.2 V2.x

Landlord confirmation, nếu được phê duyệt, cần một Engagement-owned table mới với logical listing/landlord IDs và local FK tới accepted interest/request phù hợp; không có Identity/Listing FK. Listing suggestions không cần table.

## 21. API contract requirements

V2 product features tiếp tục dùng `/api/v1`; repository không dùng API major version để biểu diễn marketing/product generation. Các thay đổi Core là additive.

### 21.1 Compatibility

| Endpoint | Intent |
| --- | --- |
| `GET /api/v1/roommate-requests` | Giữ query V1; mỗi item thêm `compatibility` object hoặc `null`; nested `profile` hiện có thêm `emailVerified`, `phoneVerified` bên cạnh `displayName`, `memberSince`. Không thêm sort Core. |
| `GET /api/v1/roommate-requests/:requestId` | Thêm full eight-dimension `compatibility` object hoặc `null`; nested `profile` thêm hai verification booleans. |

- Actor/auth: active tenant.
- Request: không có field mới bắt buộc; discovery filters hiện có là intent input khi được cung cấp.
- Response: DTO mục 9. `compatibility` object được trả khi caller có complete visible profile; thiếu request intent chỉ làm các dimension tương ứng `NOT_EVALUATED`. `compatibility` là `null` khi caller chưa có complete visible profile. Candidate profile/Identity/Listing dependency failure vẫn theo V1 exclusion hoặc `503`, không trở thành `null` giả.
- Privacy: candidate và caller data vẫn qua V1 projections; no private value echo.
- Errors: giữ V1 `401/403/404/422/429/503`; lỗi compatibility dependency bắt buộc là `503 DEPENDENCY_UNAVAILABLE`, không silently dùng stale values.
- Rate limit: read limits hiện hành; không tạo mutation limit.
- Idempotency: read-only, cùng inputs và `rulesVersion` phải cho cùng output.
- Interest, conversation và current-connection DTO không thêm compatibility trong Core. Hai verification booleans là phần additive của existing public-safe `profile` projection và có thể hiện diện nơi V1 đã nhúng profile; Core frontend chỉ bắt buộc render badges trên discovery/request detail để tránh lặp thông tin.

### 21.2 Tenant contact verification

Các endpoint additive, đối xứng với landlord flow hiện có:

| Endpoint | Request | Response/behavior |
| --- | --- | --- |
| `GET /api/v1/tenant/verifications/status` | none | Trả owner-private `{ email: { address, verified, verifiedAt, available }, phone: { number, verified, verifiedAt, available } }`; `number` có thể `null`. |
| `POST /api/v1/tenant/verifications/email/request` | `{}` | Tạo/no-op challenge theo current email; không trả secret; trả owner-private current status. |
| `POST /api/v1/tenant/verifications/email/confirm` | `{ token }` | Confirm current email challenge; trả owner-private current status. |
| `POST /api/v1/tenant/verifications/phone/request` | `{}` | Tạo/no-op challenge cho current phone; phone thiếu trả validation error; trả current status. |
| `POST /api/v1/tenant/verifications/phone/confirm` | `{ code }` | Confirm current phone challenge; trả owner-private current status. |

- Actor/auth: active tenant; landlord routes cũ giữ nguyên.
- Unknown fields: reject theo shared validation.
- Rate limit: tổng tối đa 5 request/confirm operations mỗi 15 phút theo tenant + IP, không yếu hơn landlord flow; delivery request có thể có cooldown chặt hơn.
- Idempotency: request trên channel đã verified và confirm lại challenge đã thành công trả current status, không tạo badge duplicate.
- Errors: `401`, `403`, `422 VALIDATION_FAILED`, `429 RATE_LIMITED`, `503 PROVIDER_UNAVAILABLE` theo error envelope hiện hành.

Internal Identity endpoint hiện có `GET /internal/v1/roommate-tenant-projections?ids=...` mở rộng từng item bằng `emailVerified` và `phoneVerified`. Internal-only exact `createdAt` phục vụ admin risk phải là một field chỉ trong bounded admin/risk projection, không public Roommate projection.

### 21.3 Admin review

| Endpoint | Additive intent |
| --- | --- |
| `GET /api/v1/admin/contact-reports?source=ROOMMATE...` | Thêm `riskSummary`; sort theo priority rule mục 12. Optional `reviewPriority` filter nhận `ELEVATED|STANDARD`. |
| `GET /api/v1/admin/contact-reports/:reportId` | Thêm risk summary, evidence summary và giữ full append-only events. |

- Actor/auth: active admin only.
- Privacy: không trả risk fields qua tenant endpoints.
- Rate limit: admin read limit hiện hành; bounded page size giữ nguyên.
- Idempotency: read-only; `evaluatedAt` có thể đổi, nhưng cùng source rows/rulesVersion phải cho cùng flags/priority.
- Dependency error: nếu Identity exact account-age projection không sẵn sàng, bỏ riêng flag account-age và ghi `partialEvaluation: true`; không hạ các flag Engagement đã chứng minh. Queue vẫn dùng tier từ evaluated flags và không giả dữ liệu.

## 22. Error model

Giữ shared error envelope và status mapping V1. V2 không trả SQL, stack, token, provider payload hoặc rule internals.

| Tình huống | Status/code |
| --- | --- |
| Missing/invalid/inactive auth | `401 AUTHENTICATION_REQUIRED` |
| Wrong role | `403 FORBIDDEN` |
| Candidate/request không visible theo V1 | `404 RESOURCE_NOT_FOUND` |
| Unknown/invalid verification input hoặc query | `422 VALIDATION_FAILED` |
| Challenge sai/hết hạn/quá attempts | `422 VALIDATION_FAILED` với message không tiết lộ trạng thái challenge |
| Rate limit | `429 RATE_LIMITED` |
| Verification delivery lỗi | `503 PROVIDER_UNAVAILABLE` |
| Required Identity/Listing projection lỗi | `503 DEPENDENCY_UNAVAILABLE` |

Compatibility category không bao giờ là error hoặc business-state transition.

## 23. Rate limits and abuse prevention

- Giữ toàn bộ create/renew, request mutation, interest, message, report và block limits V1.
- Tenant verification dùng limit mục 21.2; challenge có expiry và maximum attempts như Identity hiện có.
- Compatibility reads dùng authenticated read limit và batch-size bounds; endpoint không cho enumerate arbitrary tenant IDs.
- Admin evidence queries phải bounded theo report subject/time window và page size.
- Rule thresholds không được public API expose để giảm gaming; `rulesVersion` được expose cho auditability nhưng pattern internals là admin/internal.
- Risk rules không thay thế hard rate limits. Rate limit là enforcement; flag là review context.

## 24. Notifications

V2 Core không thêm Roommate notification event:

- compatibility là read-time explanation;
- verification request dùng provider delivery, confirm trả synchronous status;
- verification badge thay đổi không thông báo tenant khác;
- risk flag/priority không thông báo reporter hoặc subject.

Landlord confirmation V2.x sẽ cần notification contract riêng cho requester/landlord, nhưng không được triển khai từ tài liệu Core này.

## 25. UX requirements

- Compatibility phải xuất hiện như checklist cân nhắc, không như game/dating score.
- `IMPORTANT_DIFFERENCE` dùng màu, icon và text; không dựa vào màu duy nhất.
- Mỗi explanation nói đúng fact đã so sánh, ví dụ “Khung ngân sách có giao nhau” hoặc “Nên trao đổi về môi trường có thú cưng”.
- Badge ghi đúng “Email đã xác minh”, “Số điện thoại đã xác minh”, “Thành viên từ MM/YYYY”; có tooltip “Xác minh liên hệ không bảo đảm độ an toàn”.
- Không hiển thị badge khi boolean false; có thể hiển thị owner-only CTA xác minh trên profile của chính tenant.
- Conversation giữ safety checklist V1. Không gắn nhãn “nghi lừa đảo” lên participant/message từ heuristic Core.
- Empty/loading/error/retry states phải phân biệt dependency failure với “không có dữ liệu”.
- First interest message và subsequent chat tiếp tục là free-form plain text đúng V1.

## 26. Accessibility

- Category/outcome luôn có text label và semantic list, không chỉ icon/màu.
- Badge có accessible name nêu fact, không dùng tooltip làm nguồn thông tin duy nhất.
- Warning dùng `role=status` hoặc `role=alert` đúng mức, không lặp gây nhiễu screen reader.
- Keyboard focus order phải đi từ identity facts tới compatibility highlights rồi action.
- Disclosure/details và verification actions phải dùng được hoàn toàn bằng keyboard; interactive touch target tối thiểu 44 × 44 CSS pixels.
- Motion/transitions phải tôn trọng `prefers-reduced-motion`; không dùng chuyển động để truyền category/outcome.
- Copy ngắn, ngôn ngữ trung tính, không xấu hổ hóa người dùng.
- Dynamic compatibility load không làm mất focus hoặc thay đổi vị trí CTA bất ngờ.

## 27. Concurrency and idempotency

- Compatibility là pure computation trên snapshot đã đọc; không lock hoặc mutate V1 rows.
- Identity challenge create/confirm tiếp tục dùng một checked-out client cho transaction và row locking hiện có.
- Hai confirm concurrent chỉ có một challenge consumption/verification transition; request sau trả current verified state hoặc sanitized validation result.
- Risk evaluation không mutate report; admin status/moderation mutations vẫn dùng V1 locking và append event atomically.
- Không distributed transaction giữa Identity, Listing và Engagement.
- Verification projection và compatibility có thể phản ánh source update ở request tiếp theo; không hứa snapshot lâu dài.

## 28. Observability and logging privacy

Được log: request ID, route, actor role, latency, dependency status, rule version, số flags tổng hợp và error code.

Không được log: email/phone đầy đủ, challenge token/code/hash, message body, `intro`, request note, report details, exact address/coordinates, block direction, evidence content hoặc risk flags gắn với displayName.

Metric tối thiểu:

- compatibility evaluation success/null/dependency-failure counts;
- verification delivery/confirm success và sanitized failure theo channel;
- admin risk evaluation latency, partial-evaluation count và priority distribution;
- không dùng message text hoặc contact làm metric label.

## 29. Acceptance criteria

### Compatibility

1. Mapping mọi enum pair và request-overlap case có table-driven tests.
2. Cùng input + rules version luôn ra cùng category, dimension order và codes.
3. Không response nào có numeric score/percentage.
4. `NO_PETS`/`HAS_PET` và `SMOKE_FREE`/`OUTDOOR_ONLY` chỉ cảnh báo, không chặn.
5. Discovery ordering/pagination V1 không đổi.
6. Blocked, hidden, inactive, self hoặc listing-ineligible candidate không được compatibility làm lộ lại.
7. Zero đến ba evaluated dimensions và không có important difference trả category `null`; một important difference đã biết vẫn trả `IMPORTANT_DIFFERENCE`.
8. Missing input trả đúng `NOT_EVALUATED`, không thay đổi alignment count.

### Verification

9. Tenant có thể request/confirm từng channel có provider thật trong environment release; email và phone availability độc lập.
10. Wrong role, inactive account, concurrent resend/confirm, bad/expired challenge, attempts và rate limits được kiểm thử.
11. Public Roommate response chỉ có booleans; không có email, phone, timestamp, token/code hoặc provider data.
12. Thay đổi phone làm mất fact phone verified theo Identity source-of-truth behavior.
13. Provider unavailable không ghi verified timestamp hoặc tạo badge giả.

### Safety/admin

14. Mỗi risk rule, configured boundary time/count và priority rule có deterministic tests.
15. Admin queue/detail có bounded evidence summary và append-only action events; tenant response không có risk data.
16. Rule không tự mutate account, request, interest, message, block, report hoặc moderation.
17. Dismissed false positive được giữ trong report event history.
18. Existing Roommate PostgreSQL concurrency/safety tests tiếp tục pass.

## 30. Invariants

| ID | Invariant |
| --- | --- |
| `RM-V2-INV-001` | Compatibility không thay đổi eligibility hoặc lifecycle V1. |
| `RM-V2-INV-002` | Không numeric/percentage compatibility hoặc trust/risk score. |
| `RM-V2-INV-003` | Chỉ structured approved fields được dùng cho compatibility. |
| `RM-V2-INV-004` | Missing data không được suy đoán hoặc phạt. |
| `RM-V2-INV-005` | Identity là nguồn sự thật duy nhất cho verification. |
| `RM-V2-INV-006` | Public Roommate projection không lộ contact hoặc verification internals. |
| `RM-V2-INV-007` | Risk flags là admin-only và không tự enforcement. |
| `RM-V2-INV-008` | Block direction và report identities không lộ cho counterpart. |
| `RM-V2-INV-009` | Không cross-service FK, shared DB hoặc distributed transaction. |
| `RM-V2-INV-010` | V2 Core không tạo Group hoặc nhiều active commitments. |
| `RM-V2-INV-011` | Unblock không restore old interest/connection/request. |
| `RM-V2-INV-012` | Không AI dependency trong V2 Core. |

## 31. Migration and backward compatibility

- V2 Core không yêu cầu database migration.
- API thay đổi là additive fields/query option; V1 clients bỏ qua field mới vẫn hoạt động.
- `/api/v1` paths, error envelope và cookie/session contract giữ nguyên.
- Landlord verification routes hiện có không đổi; tenant routes mới dùng cùng Identity capability nhưng role boundary riêng.
- Existing rows không backfill compatibility/risk data vì các giá trị được compute on read.
- Rollout nên feature-flag presentation độc lập cho compatibility, verification badges và admin risk; tắt flag không làm mất dữ liệu V1.
- Nếu provider của một verification channel chưa production-ready, channel/badge đó không được bật; boolean nguồn sự thật vẫn không được giả lập.

## 32. Explicit V3 boundary

| Capability | V2 | V3 |
| --- | --- | --- |
| Structured deterministic compatibility | Yes | No dependency |
| Rule-based explanation codes | Yes | No dependency |
| Factual email/phone/member facts | Yes | No dependency |
| Rule-based admin risk flags | Yes | No dependency |
| Natural-language preference parsing | No | Candidate |
| Semantic roommate/listing recommendation | No | Candidate |
| AI match explanation | No | Candidate |
| AI message scam analysis | No | Candidate |
| AI admin assistance | No | Candidate |

AI về sau không được silently thay category/rule output V2. Bất kỳ AI feature nào cần contract, privacy, evaluation, fallback và human-review specification riêng.

V2 không thêm embedding/vector infrastructure, LLM provider, semantic database/search hoặc behavior AI trá hình.

## 33. Frozen decisions and implementation configuration

Không còn Core V2 product blocker. Các quyết định đã đóng băng:

1. V2 Core gồm đúng sáu capability tại mục 4.1 và không có score/ranking.
2. Tenant email và phone verification phát hành độc lập theo channel readiness.
3. Landlord confirmation, listing-aware suggestions, compatibility ranking và additional lifestyle fields chỉ là V2.x candidates, không phải Core blocker.
4. `RoommateGroup` defer cho tới khi có product evidence; AI thuộc V3.

Các giá trị còn phải chọn khi triển khai chỉ là technical configuration: validated risk thresholds/windows, channel enablement/configuration, provider deployment và localized presentation copy theo semantic đã đóng băng. Chúng không được thay đổi Core meaning, privacy hoặc enforcement rules.

---

**Specification status: APPROVED — FROZEN FOR IMPLEMENTATION**
