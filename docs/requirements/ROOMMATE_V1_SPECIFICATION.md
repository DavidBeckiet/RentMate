# Roommate Matching V1 Specification

| Thuộc tính | Giá trị |
|---|---|
| Trạng thái | **APPROVED — implementation-ready** |
| Phiên bản | 1.0 |
| Ngày chốt | 2026-08-27 |
| Phạm vi | Post-MVP Roommate Matching V1 |
| Kiến trúc đích | Gateway + Identity Service + Listing Service + Engagement Service |
| Chủ sở hữu nghiệp vụ | Engagement Service |

Tài liệu này là hợp đồng sản phẩm, an toàn, API, dữ liệu và hành vi chuẩn cho Roommate Matching V1. Các tên bảng, index và endpoint bên dưới là thiết kế khái niệm để lập kế hoạch triển khai; tài liệu này không phải migration hoặc mã nguồn.

## 1. Mục đích tính năng và vấn đề cần giải quyết

Roommate Matching giúp một tenant đang hoạt động tìm **đúng một** tenant khác để cân nhắc cùng thuê nhà. V1 hỗ trợ hai tình huống:

- Tenant đã thấy một listing phù hợp và muốn tìm một người cùng cân nhắc thuê listing đó.
- Tenant chưa chọn listing, nhưng đã có khu vực, ngân sách và thời gian chuyển vào dự kiến; hai bên kết nối trước rồi tự tìm listing hiện có trên RentMate.

Tính năng chỉ tạo kênh khám phá, bày tỏ quan tâm và trao đổi. RentMate không xác nhận quan hệ thuê, không giữ chỗ, không thu tiền, không bảo đảm giao dịch và không xác nhận landlord đã đồng ý với hai tenant.

## 2. Phạm vi V1

V1 bao gồm:

- Hồ sơ roommate có cấu trúc, tối thiểu và an toàn.
- Một loại roommate request, có thể có hoặc không có `listingId`.
- Discovery bằng bộ lọc xác định, không chấm điểm.
- Interest hai bên, chat gắn với interest, accept để hình thành connection và leave để kết thúc.
- Liên kết hoặc gỡ listing khi request còn `OPEN`.
- Block, report, moderation, cảnh báo lừa đảo và rate limit.
- Hết hạn request, gia hạn, thông báo và các hợp đồng đồng thời bắt buộc.

V1 chỉ hỗ trợ cặp `Tenant A <-> Tenant B`. Không có nhóm nhiều thành viên.

## 3. Tác nhân

| Tác nhân | Mô tả |
|---|---|
| Anonymous | Người chưa đăng nhập; không được dùng Roommate V1. |
| Active tenant | Tài khoản `TENANT`, `isActive = true`; tác nhân sản phẩm chính. |
| Inactive tenant | Tenant đã bị vô hiệu hóa; không được đọc hoặc ghi dữ liệu roommate. |
| Landlord | Không được dùng tính năng roommate với tư cách người tìm ở ghép. |
| Admin/moderator | Xem và xử lý report, ẩn nội dung theo quyền quản trị hiện có. |
| Gateway | Xác thực biên, định tuyến và áp dụng chính sách HTTP dùng chung; không sở hữu trạng thái roommate. |
| Identity Service | Nguồn sự thật cho tài khoản, vai trò, trạng thái hoạt động và public-safe identity projection. |
| Listing Service | Nguồn sự thật cho listing, trạng thái, tính công khai, landlord eligibility và `maxOccupants`. |
| Engagement Service | Nguồn sự thật cho toàn bộ miền roommate, message, notification, block và report liên quan. |

## 4. Thuật ngữ

| Thuật ngữ | Định nghĩa chuẩn |
|---|---|
| Roommate profile | Hồ sơ lối sống của một tenant, tách khỏi identity profile. |
| Request | Bài đăng của một tenant đang tìm đúng một roommate. |
| Linked request | Request có `listingId` khác `null`. |
| Unlinked request | Request có `listingId = null`. |
| Effective suspension | Request vẫn lưu `OPEN`, nhưng bị loại khỏi discovery và không nhận interest/accept vì linked listing không còn hợp lệ hoặc nội dung bị moderation ẩn. Đây không phải trạng thái persisted mới. |
| Interest | Ý định của một tenant muốn kết nối với chủ request. |
| Connection | Quan hệ được suy ra từ một interest có trạng thái `ACCEPTED`; không có bảng Match/Connection riêng. |
| Participant | Chủ request hoặc tenant đã tạo interest tương ứng. |
| Business date | Ngày lịch theo múi giờ `Asia/Ho_Chi_Minh`. |
| Area key | Chuỗi tên khu vực công khai đã chuẩn hóa để hiển thị và so khớp; không phải mã hành chính chính thức. |
| Public-safe projection | Tập trường tối thiểu được service sở hữu dữ liệu cho phép service khác hoặc client nhận. |

## 5. Ma trận tác nhân, xác thực và quyền

| Khả năng | Anonymous | Active tenant | Inactive tenant | Landlord | Admin |
|---|---:|---:|---:|---:|---:|
| Xem discovery/detail roommate | Không | Có | Không | Không | Chỉ qua công cụ moderation |
| Tạo/sửa hồ sơ roommate | Không | Chính mình | Không | Không | Không |
| Tạo/sửa/cancel/renew request | Không | Request của mình | Không | Không | Không |
| Link/unlink listing | Không | Request `OPEN` của mình | Không | Không | Không |
| Tạo interest | Không | Request của tenant khác | Không | Không | Không |
| Accept/reject interest | Không | Chủ request | Không | Không | Không |
| Withdraw interest | Không | Người gửi interest | Không | Không | Không |
| Leave connection | Không | Một trong hai participant | Không | Không | Không |
| Đọc/gửi roommate message | Không | Participant hợp lệ | Không | Không | Theo quy trình safety có kiểm soát |
| Block/report | Không | Có quan hệ/ngữ cảnh hợp lệ | Không | Không | Xử lý report |

Mọi endpoint tenant yêu cầu session hợp lệ, kiểm tra tài khoản hiện tại còn active và role là `TENANT`. Thứ tự lỗi dùng chính sách chung: thiếu/sai/hết hạn session hoặc inactive trả `401`; role không đúng trả `403`; resource không thuộc hoặc không được phép thấy trả `404` khi cần chống lộ dữ liệu.

Frontend guard chỉ phục vụ điều hướng. Authorization ở Gateway và service vẫn là thẩm quyền cuối cùng.

## 6. Quyền sở hữu theo service

### 6.1 Engagement Service

Engagement Service sở hữu:

- `RoommateProfile`, `RoommateRequest`, `RoommateInterest`, `RoommateMessage`.
- State machine, invariant, transaction, expiration và connection projection.
- Discovery roommate sau khi ghép public-safe projections từ service khác.
- Notification, block, report và moderation cho miền roommate.

### 6.2 Identity Service

Identity Service tiếp tục sở hữu account, role, activity, `displayName`, ngày tạo tài khoản và trạng thái contact verification. Engagement chỉ lưu logical tenant ID, không có foreign key hoặc bản sao email/phone.

Identity phải cung cấp internal batch projection tối thiểu cho roommate:

```json
{
  "tenantId": 42,
  "role": "TENANT",
  "isActive": true,
  "displayName": "Minh Anh",
  "memberSince": "2025-11"
}
```

`tenantId`, `role` và `isActive` chỉ dùng nội bộ. Client chỉ nhận `displayName` và `memberSince`. `displayName` là tên tự khai, không phải danh tính pháp lý đã xác minh.

### 6.3 Listing Service

Listing Service sở hữu mọi thuộc tính và vòng đời listing. Engagement chỉ lưu logical `listingId`, không có cross-service foreign key và không sao chép title, rent, address, coordinates hoặc contact.

Listing Service phải cung cấp internal single/batch eligibility projection gồm tối thiểu:

- `listingId`.
- `isPublic`.
- business eligibility hiện tại.
- trạng thái active/visibility hiện tại của landlord.
- `maxOccupants`.
- public listing card/detail projection đã có, gồm `areaName` công khai.

V1 tái sử dụng `GET /internal/v1/listings/public-summaries?ids=...` hiện có. Endpoint này đã loại listing không `APPROVED`, business status ngoài `AVAILABLE|UNKNOWN` và landlord inactive; Engagement áp dụng thêm `maxOccupants >= 2`. Không tạo bản sao listing trong Engagement.

### 6.4 Gateway

Gateway định tuyến `/api/v1/roommate-*` tới Engagement, chuyển trusted caller context theo cơ chế hiện có và áp dụng CORS/origin, body limit, request ID và lỗi chuẩn. Gateway không lưu hoặc quyết định state roommate.

### 6.5 Quy tắc tích hợp

- Không service nào đọc database của service khác.
- Không thêm shared database hoặc distributed foreign key.
- Không có distributed transaction giữa Engagement, Identity và Listing.
- Dependency call phải có timeout hữu hạn, log đã sanitize và lỗi `503 DEPENDENCY_UNAVAILABLE` khi kết quả là điều kiện để quyết định an toàn.

## 7. Mô hình miền

V1 có đúng bốn entity roommate:

1. `RoommateProfile`: một hồ sơ cho mỗi tenant.
2. `RoommateRequest`: một yêu cầu tìm đúng một roommate.
3. `RoommateInterest`: ý định của một tenant đối với một request.
4. `RoommateMessage`: tin nhắn trong thread của một interest.

Không tạo `Match`, `Connection`, `Group`, `GroupMember`, bảng preference riêng hoặc bảng score. Current connection được suy ra bằng join `RoommateInterest(status = ACCEPTED)` với request tương ứng.

Moderation, block, report và notification mở rộng các capability hiện có của Engagement; chúng không tạo thêm entity roommate cốt lõi.

## 8. Hợp đồng trường chính xác

### 8.1 Chuẩn hóa văn bản dùng chung

Trước validation, server:

1. Yêu cầu JSON đúng kiểu; từ chối field lạ.
2. Chuẩn hóa Unicode NFC.
3. Trim khoảng trắng đầu/cuối.
4. Với field một dòng, gộp chuỗi whitespace liên tiếp thành một dấu cách.
5. `intro`, `note`, message body và report details là multiline: chuẩn hóa CRLF/CR thành LF, trim whitespace hai đầu toàn chuỗi và cho phép LF; từ chối TAB và mọi control character khác.
6. Tính giới hạn theo Unicode code point, không theo byte hoặc UTF-16 code unit.

Chuỗi trở thành rỗng sau chuẩn hóa không được xem là giá trị hợp lệ.

### 8.2 `RoommateProfile`

| Field | Kiểu | Bắt buộc | Hợp đồng |
|---|---|---:|---|
| `tenantId` | positive 32-bit integer | Có, internal | Khóa logic từ Identity; không public. |
| `intro` | string | Có | Một hoặc nhiều dòng; 20–500 code point. |
| `sleepSchedule` | enum | Có | Theo mục 9. |
| `cleanlinessLevel` | enum | Có | Theo mục 9. |
| `noisePreference` | enum | Có | Theo mục 9. |
| `smokingEnvironment` | enum | Có | Theo mục 9. |
| `petEnvironment` | enum | Có | Theo mục 9. |
| `moderationState` | enum | Server | Mặc định `VISIBLE`; tenant không tự ghi. |
| `createdAt` | UTC timestamp | Server | Bất biến. |
| `updatedAt` | UTC timestamp | Server | Chỉ đổi khi nội dung thực sự đổi hoặc moderation thay đổi. |

Một profile được coi là complete khi tồn tại, `moderationState = VISIBLE` và cả sáu field sản phẩm hợp lệ. Public roommate profile trả đúng sáu field trên, `displayName`, `memberSince` và signal `profileCompleted: true`; không trả `tenantId` hoặc moderation internals.

`PUT` profile là upsert toàn bộ sáu field. Payload normalized giống state hiện tại là no-op: không đổi `updatedAt`.

### 8.3 `RoommateRequest`

| Field | Kiểu | Bắt buộc | Hợp đồng |
|---|---|---:|---|
| `id` | positive 32-bit integer | Server | Public identifier của request. |
| `ownerTenantId` | positive 32-bit integer | Internal | Không public. |
| `listingId` | positive 32-bit integer hoặc `null` | Có | Logical reference; không cross-service FK. |
| `preferredAreaKeys` | string[] | Có điều kiện | 0–5 phần tử; quy tắc mục 10. |
| `budgetMinPerPerson` | integer VND | Có | Từ 1 đến 999,999,999,999. |
| `budgetMaxPerPerson` | integer VND | Có | Cùng miền; phải `>= budgetMinPerPerson`. |
| `moveInFrom` | date | Có | ISO `YYYY-MM-DD`; từ business date hiện tại đến +365 ngày. |
| `moveInUntil` | date | Có | `>= moveInFrom`, cửa sổ tối đa 90 ngày và không quá +365 ngày. |
| `note` | string hoặc `null` | Không | 1–500 code point sau chuẩn hóa; null nếu bỏ trống. |
| `status` | enum | Server | `OPEN`, `MATCHED`, `CANCELLED`, `EXPIRED`. |
| `expiresAt` | UTC timestamp | Server | Khi create/renew: thời điểm transaction + 30 ngày. |
| `listingLinkedAt` | UTC timestamp hoặc `null` | Server | Ghi thời điểm link hiện tại; null khi unlink. Dùng để audit ngữ cảnh, không chứng minh đặt chỗ. |
| `moderationState` | enum | Server | `VISIBLE` hoặc `HIDDEN`; độc lập với `status`. |
| `createdAt` | UTC timestamp | Server | Bất biến; dùng sort newest. |
| `updatedAt` | UTC timestamp | Server | Chỉ đổi khi có mutation thật. |

Không lưu title, rent, address, coordinates, landlord identity/contact hoặc snapshot listing trong request. Một update normalized no-op không đổi `updatedAt` và không làm request nổi lên đầu discovery.

### 8.4 `RoommateInterest`

| Field | Kiểu | Bắt buộc | Hợp đồng |
|---|---|---:|---|
| `id` | positive 32-bit integer | Server | Chỉ participant được truy cập. |
| `requestId` | positive 32-bit integer | Có | Cùng Engagement DB. |
| `interestedTenantId` | positive 32-bit integer | Internal | Không public. |
| `status` | enum | Server | Theo mục 9 và state machine. |
| `acceptedAt` | UTC timestamp hoặc `null` | Server | Chỉ đặt khi chuyển sang `ACCEPTED`. |
| `endedAt` | UTC timestamp hoặc `null` | Server | Đặt ở terminal status hoặc `LEFT`. |
| `endedByTenantId` | positive 32-bit integer hoặc `null` | Internal | Actor kết thúc, nếu có. |
| `terminalReason` | internal enum hoặc `null` | Server | Lý do hệ thống/an toàn; không public trực tiếp. |
| `createdAt` | UTC timestamp | Server | Bất biến. |
| `updatedAt` | UTC timestamp | Server | Đổi theo transition thật. |

Tạo interest và message mở đầu phải atomic. Cùng một tenant có tối đa một interest active (`PENDING` hoặc `ACCEPTED`) trên một request; các interest terminal lịch sử không bị xóa và một chu kỳ request đã renew có thể nhận interest mới.

### 8.5 `RoommateMessage`

| Field | Kiểu | Bắt buộc | Hợp đồng |
|---|---|---:|---|
| `id` | positive 32-bit integer | Server | Chỉ participant và moderation workflow được dùng. |
| `interestId` | positive 32-bit integer | Có | Thread scope duy nhất. |
| `senderTenantId` | positive 32-bit integer | Internal | Phải là một participant. |
| `body` | string | Có | Plain text, 1–2.000 code point. Không HTML/Markdown rendering. |
| `moderationState` | enum | Server | `VISIBLE` hoặc `HIDDEN`. |
| `createdAt` | UTC timestamp | Server | Bất biến. |
| `readAt` | UTC timestamp hoặc `null` | Server | Chỉ recipient đánh dấu; idempotent. |

V1 không edit hoặc delete message. Message bị ẩn hiển thị placeholder trung tính cho participant; bằng chứng gốc được giữ cho moderation theo chính sách retention hiện có.

## 9. Enum và hợp đồng giá trị

### 9.1 Profile enums

| Field | Giá trị | Ý nghĩa hiển thị |
|---|---|---|
| `sleepSchedule` | `EARLY` | Thường ngủ/dậy sớm |
|  | `STANDARD` | Giờ sinh hoạt phổ biến |
|  | `LATE` | Thường ngủ/dậy muộn |
|  | `FLEXIBLE` | Linh hoạt |
| `cleanlinessLevel` | `RELAXED` | Thoải mái |
|  | `BALANCED` | Cân bằng |
|  | `TIDY` | Ưu tiên gọn gàng |
| `noisePreference` | `QUIET` | Ưu tiên yên tĩnh |
|  | `BALANCED` | Cân bằng |
|  | `SOCIAL` | Thoải mái với không khí giao lưu |
| `smokingEnvironment` | `SMOKE_FREE` | Không gian không khói thuốc |
|  | `OUTDOOR_ONLY` | Chỉ hút ngoài nhà |
|  | `NO_PREFERENCE` | Không có ưu tiên |
| `petEnvironment` | `NO_PETS` | Không muốn có thú cưng |
|  | `OK_WITH_PETS` | Chấp nhận thú cưng |
|  | `HAS_PET` | Hiện có thú cưng |

Các nhãn là sở thích tự khai, không phải đánh giá con người. Không suy diễn hoặc hiển thị mức “tương thích”.

### 9.2 State enums

- Request: `OPEN`, `MATCHED`, `CANCELLED`, `EXPIRED`.
- Interest: `PENDING`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`, `LEFT`.
- Moderation: `VISIBLE`, `HIDDEN`.
- Listing mode filter: `ALL`, `LINKED`, `UNLINKED`.
- Interest direction filter: `INCOMING`, `OUTGOING`.
- Report target: `ROOMMATE_PROFILE`, `ROOMMATE_REQUEST`, `ROOMMATE_MESSAGE`.
- Report category: `FRAUD`, `PAYMENT_SCAM`, `SPAM`, `HARASSMENT`, `IMPERSONATION`, `INAPPROPRIATE_CONTENT`, `OTHER`.

### 9.3 Internal terminal reasons

Tối thiểu gồm `USER_ACTION`, `REQUEST_CANCELLED`, `REQUEST_EXPIRED`, `COMPETING_INTEREST_ACCEPTED`, `PARTICIPANT_MATCHED_ELSEWHERE`, `PARTICIPANT_BLOCKED`, `MODERATION_ACTION`. API có thể trả nhãn hành vi trung tính; không được lộ block hoặc moderation internals cho phía không có quyền.

## 10. Mô hình khu vực

V1 không tạo bảng district/ward, không hard-code tên đơn vị hành chính và không tuyên bố `AreaKey` là mã địa giới chính thức. Cách này phù hợp với public `areaName` hiện tại của Listing Service.

Hợp đồng `AreaKey`:

- Là string public-safe dài 1–120 code point.
- NFC, trim, gộp whitespace, từ chối control character.
- Dedupe và so khớp không phân biệt hoa/thường trên normalized comparison form; mảng được server sắp xếp ổn định theo comparison form.
- Tối đa 5 giá trị khác nhau.
- Deployment ban đầu chỉ phục vụ vùng sản phẩm Thành phố Hồ Chí Minh; phạm vi này là cấu hình sản phẩm, không biến danh sách tự do thành dữ liệu hành chính chính thức.

Quy tắc theo mode:

- Request không link listing phải có 1–5 `preferredAreaKeys`.
- Request đã link listing có thể có 0–5 giá trị; area hiệu lực để discovery là `areaName` công khai hiện tại của listing.
- Trước khi unlink, request phải đã có 1–5 area hợp lệ; nếu chưa có, owner `PATCH` area trước rồi mới gọi `DELETE` listing.
- Filter `area` dùng normalized case-insensitive substring trên từng preferred area của unlinked request hoặc trên current public `areaName` của linked request.

## 11. State machine của request

```text
CREATE -> OPEN
OPEN   -> MATCHED    (atomic khi accept interest)
OPEN   -> CANCELLED  (owner cancel)
OPEN   -> EXPIRED    (expiresAt <= now)
EXPIRED -> OPEN      (owner renew)
```

Quy tắc:

- `MATCHED` và `CANCELLED` là terminal; không renew hoặc reopen.
- Chỉ `OPEN` mới được link/unlink listing hoặc sửa nội dung.
- Cancel atomically chuyển request sang `CANCELLED`, chuyển toàn bộ incoming interest `PENDING` sang `REJECTED` với reason `REQUEST_CANCELLED`, làm các thread đó read-only và ghi notification phù hợp.
- `EXPIRED -> OPEN` giữ cùng request ID, revalidate toàn bộ dữ liệu và tạo chu kỳ 30 ngày mới.
- Request `MATCHED` không trở lại `OPEN` khi connection chuyển `LEFT`; tenant muốn tìm tiếp phải tạo request mới.
- Moderation `HIDDEN` không thay đổi state machine nhưng làm request không discoverable và không nhận interaction mới.
- Mọi transition phải dùng conditional mutation hoặc row lock; request stale trả conflict, không silently succeed.

## 12. State machine của interest

```text
PENDING -> ACCEPTED -> LEFT
PENDING -> REJECTED
PENDING -> WITHDRAWN
```

- Chỉ chủ request được `PENDING -> ACCEPTED` hoặc `PENDING -> REJECTED`.
- Chỉ người gửi được `PENDING -> WITHDRAWN`.
- Một trong hai participant được `ACCEPTED -> LEFT`.
- Terminal request/interest không nhận transition lặp; retry có cùng idempotency key có thể replay kết quả đã lưu, còn request stale trả `409`.
- Block không tạo trạng thái `BLOCKED`:
  - Với `ACCEPTED`, block trước hết chuyển interest sang `LEFT`.
  - Người gửi interest `PENDING` block chủ request: interest thành `WITHDRAWN`.
  - Chủ request block người gửi interest `PENDING`: interest thành `REJECTED`.
- Unblock không hồi sinh interest hoặc connection cũ.

## 13. Catalog invariant

Các ID dưới đây là ổn định và phải được dùng trong test/traceability:

| ID | Invariant bắt buộc |
|---|---|
| `RM-RM-INV-001` | Mỗi tenant có tối đa một request `OPEN`. Request effective-suspended vẫn tính là `OPEN`. |
| `RM-RM-INV-002` | Mỗi tenant tham gia tối đa một interest `ACCEPTED`, dù ở vai trò owner hay interested tenant. |
| `RM-RM-INV-003` | Mỗi request có tối đa một interest `ACCEPTED`. |
| `RM-RM-INV-004` | Tenant không thể tạo interest cho request của chính mình. |
| `RM-RM-INV-005` | Candidate đang sở hữu request `OPEN` không thể được accept; họ phải tự cancel trước. Hệ thống không auto-close. |
| `RM-RM-INV-006` | Accept thành công atomically chuyển request đích `OPEN -> MATCHED`. |
| `RM-RM-INV-007` | Nếu tồn tại block ở một trong hai chiều, cặp tenant không discover, message, tạo interest hoặc accept nhau. |
| `RM-RM-INV-008` | Linked request `OPEN` chỉ eligible khi current listing rules đều đạt. |
| `RM-RM-INV-009` | Listing mất eligibility sau accept không tự kết thúc connection. |
| `RM-RM-INV-010` | `LEFT` không reopen request cũ. |
| `RM-RM-INV-011` | Một request luôn tìm đúng một roommate. |
| `RM-RM-INV-012` | Chỉ account active với role `TENANT` được đọc/ghi miền roommate. |
| `RM-RM-INV-013` | Create request/interest và accept yêu cầu profile complete, visible ở thời điểm kiểm tra. |
| `RM-RM-INV-014` | Mỗi cặp `(request, interested tenant)` có tối đa một interest active; duplicate concurrent create không tạo hai thread. |
| `RM-RM-INV-015` | Chỉ hai participant được đọc thread; chỉ thread `PENDING` hoặc `ACCEPTED` được ghi. |
| `RM-RM-INV-016` | `REJECTED`, `WITHDRAWN` và `LEFT` là read-only; history không bị xóa. |
| `RM-RM-INV-017` | Accept không phải consent chia sẻ email, phone, social account, địa chỉ chính xác hoặc dữ liệu tài chính. |
| `RM-RM-INV-018` | `listingId` chỉ là reference ngữ cảnh; không chứng minh quyền thuê, landlord approval, reservation hoặc payment authority. |
| `RM-RM-INV-019` | Link/unlink listing chỉ hợp lệ khi request đang persisted `OPEN`; sau `MATCHED` không được thay listing. |
| `RM-RM-INV-020` | Profile/request/message `HIDDEN` không xuất hiện ở public participant projection như nội dung bình thường; evidence vẫn được bảo toàn cho moderation. |

## 14. Hợp đồng đồng thời cho active commitment

V1 dùng Option C: một tenant được đồng thời sở hữu một request `OPEN` và gửi các interest `PENDING` tới request khác. Tuy nhiên, khi request của họ còn `OPEN`, không owner nào được accept họ. Chính tenant đó phải cancel request trước; accept không bao giờ tự đóng request của người khác.

### 14.1 Khóa tenant thống nhất

Mọi operation có thể tạo hoặc giải phóng active commitment — create/renew request, accept, leave và block giữa participant — phải dùng cùng một namespace transaction-scoped advisory lock cho tenant ID. Khi có hai tenant, khóa theo thứ tự xác định tăng dần của canonical tenant ID để tránh deadlock.

Database constraints là lớp phòng vệ cho invariant nội bảng; advisory lock là lớp bắt buộc cho invariant xuyên hai vai trò owner/interested tenant mà một partial unique index đơn giản không biểu diễn được.

### 14.2 Accept transaction

Accept phải thực hiện theo hợp đồng sau:

1. Xác thực caller và lấy public-safe/current activity projection của cả hai tenant.
2. Bắt đầu một transaction trên đúng một checked-out Engagement database client.
3. Lock hai tenant theo thứ tự xác định bằng transaction-scoped advisory locks.
4. Lock row request và interest đích; xác minh interest thuộc request và caller là owner.
5. Recheck trong transaction:
   - Request là `OPEN`, `expiresAt > now`, `moderationState = VISIBLE`.
   - Interest là `PENDING`.
   - Hai profile complete và visible.
   - Không tenant nào đang ở một accepted connection trong bất kỳ vai trò nào.
   - Candidate không sở hữu request `OPEN`.
   - Không có block ở một trong hai chiều.
6. Nếu có `listingId`, gọi bounded internal Listing eligibility check trong transaction và fail closed nếu dependency lỗi. Recheck listing reference chưa đổi, listing đang public/business-eligible, landlord active/visible và `maxOccupants >= 2`.
7. Atomically:
   - Chuyển interest đích sang `ACCEPTED`, đặt `acceptedAt`.
   - Chuyển request `OPEN -> MATCHED`.
   - Chuyển các competing `PENDING` interest trên request đích thành `REJECTED`.
   - Chuyển mọi outgoing `PENDING` interest khác của cả hai participant thành `WITHDRAWN` với internal reason phù hợp.
   - Ghi notification/outbox-equivalent record theo pattern notification hiện có, cùng transaction.
8. Commit; sau commit mới phát side effect không giao dịch nếu có.

Không có distributed transaction với Listing. Eligibility check chỉ xác nhận một snapshot ngay trước commit; listing có thể đổi sau đó và theo `RM-RM-INV-009` không phá connection. Linked listing tuyệt đối không được mô tả như một reservation.

### 14.3 Conflict xác định

- Cùng một request, hai accept đồng thời: đúng một thành công; bên còn lại `409 ROOMMATE_REQUEST_NOT_OPEN` hoặc `409 ROOMMATE_INTEREST_NOT_PENDING` theo state đã commit.
- Hai request khác nhau cùng cố accept một tenant: đúng một thành công; bên còn lại `409 ROOMMATE_ACTIVE_CONNECTION_EXISTS`.
- Accept đối đầu A nhận B và B nhận A: tenant lock order bảo đảm không deadlock; đúng một connection có thể thắng.
- Candidate đồng thời create/renew request và được accept: cùng tenant lock quyết định thứ tự; nếu request `OPEN` thắng trước thì accept trả `409 ROOMMATE_CANDIDATE_OPEN_REQUEST`, nếu accept thắng thì create/renew trả `409 ROOMMATE_ACTIVE_CONNECTION_EXISTS`.
- Accept cạnh expiration: kiểm tra `expiresAt > now` trong locked transaction là chuẩn; request hết hạn không được accept.

## 15. Flow A — Từ listing đến roommate connection

1. Active tenant có profile complete mở một listing đang public và eligible.
2. Tenant chọn “Tìm người ở ghép cho listing này”. UI luôn hiển thị nghĩa an toàn của liên kết listing.
3. Engagement kiểm tra tenant chưa có request `OPEN`, chưa có accepted connection và listing đạt rule tại mục 17.
4. Request được tạo `OPEN`, `listingId` được lưu, `listingLinkedAt = now`, hết hạn sau 30 ngày.
5. Tenant khác discover request, xem public-safe roommate profile và current public listing card.
6. Candidate gửi interest kèm message mở đầu không rỗng.
7. Hai bên chat trong interest thread `PENDING`.
8. Owner có thể reject hoặc accept. Candidate có request `OPEN` phải tự cancel trước khi được accept.
9. Accept transaction tạo connection suy ra từ interest `ACCEPTED` và request `MATCHED`.
10. Hai bên tiếp tục chat; listing chỉ còn là historical/context reference. Hai bên tự kiểm tra phòng, landlord và điều kiện thuê.

## 16. Flow B — Từ nhu cầu đến tìm listing

1. Active tenant có profile complete tạo request không `listingId`.
2. Tenant cung cấp 1–5 khu vực, ngân sách mỗi người, cửa sổ chuyển vào và note tùy chọn.
3. Candidate discover request bằng area/budget/move-in overlap.
4. Interest, chat và accept diễn ra như Flow A.
5. Sau accept, request thành `MATCHED`; hai participant dùng search/listing hiện có của RentMate để tự tìm nơi phù hợp.
6. Không tự động tạo listing recommendation, group hoặc booking. Nếu hai bên quan tâm listing, họ xử lý qua các flow listing/contact hiện có và vẫn thấy cảnh báo an toàn.

## 17. Vòng đời liên kết listing

### 17.1 Điều kiện link, create linked và accept

Tại thời điểm create linked request, link vào request `OPEN`, và accept linked request, Listing Service phải xác nhận đồng thời:

- Listing có moderation/lifecycle `status = APPROVED`.
- Listing có `businessStatus` là `AVAILABLE` hoặc `UNKNOWN`; `PAUSED` và `RENTED` không eligible.
- Landlord sở hữu listing đang active và visible theo rule hiện hành.
- `maxOccupants >= 2`.

Tenant không cần và không được hiểu là owner của listing.

### 17.2 Listing mất eligibility khi request còn `OPEN`

- Request vẫn persisted `OPEN` và vẫn chiếm slot duy nhất của owner.
- Request bị effective-suspended: loại khỏi discovery; direct detail không trả nội dung cho non-owner; không nhận interest mới; không accept interest pending.
- Message trong interest `PENDING` hiện có vẫn được phép theo state thread, nhưng UI hiển thị listing không còn khả dụng và không cho accept.
- Owner có thể unlink để tiếp tục dưới Flow B, nếu request có 1–5 area hợp lệ, hoặc cancel.
- Không thêm state `SUSPENDED` vào database.

### 17.3 Sau `MATCHED`

- Không được link, unlink hoặc thay listing.
- `listingId` là ngữ cảnh lịch sử. Client chỉ hiển thị current public listing projection nếu Listing Service vẫn cho phép; nếu không, hiển thị “Listing không còn khả dụng”.
- Listing mất eligibility không chuyển interest sang `LEFT` và không reopen request.

### 17.4 Câu chữ an toàn bắt buộc

Ở create confirmation, request detail và connection context, dùng ý nghĩa:

> Tenant đang tìm một người để cân nhắc cùng thuê listing này.

Không được dùng câu chữ hàm ý tenant đang sở hữu/đã thuê phòng, landlord đã chấp thuận, listing đã được giữ chỗ, landlord chắc chắn nhận cả hai, hoặc tenant được thu tiền/đặt cọc.

## 18. Discovery và search

### 18.1 Eligibility

Chỉ active authenticated tenant được gọi discovery. Kết quả phải loại:

- Request của chính caller.
- Request không `OPEN`, đã hết hạn theo `expiresAt`, hoặc moderation-hidden.
- Request của tenant inactive/non-tenant hoặc profile incomplete/hidden.
- Cặp có block ở bất kỳ chiều nào.
- Linked request không còn đạt listing eligibility.

### 18.2 Filter

| Query | Hợp đồng |
|---|---|
| `area` | Tùy chọn, 1–120 code point; so khớp theo mục 10. |
| `budgetMinPerPerson` | Tùy chọn integer VND; cận dưới nhu cầu của caller. |
| `budgetMaxPerPerson` | Tùy chọn integer VND; cận trên nhu cầu của caller; phải `>= min` nếu cùng có. |
| `moveInFrom` | Tùy chọn ISO date. |
| `moveInUntil` | Tùy chọn ISO date; phải `>= from` nếu cùng có. |
| `listingMode` | `ALL` mặc định, `LINKED` hoặc `UNLINKED`. |
| `page` | Integer, mặc định 1, tối thiểu 1. |
| `pageSize` | Integer, mặc định 20, từ 1–50. |

Budget interval overlap khi `request.min <= filter.max` và `request.max >= filter.min`; cận bị bỏ trống là không giới hạn. Move-in interval dùng cùng semantics overlap.

### 18.3 Sort và pagination

- V1 chỉ có sort newest: `createdAt DESC`, rồi `id DESC` làm tie-breaker.
- Update không đổi `createdAt` và không bump vị trí.
- Dùng `pageSize + 1` để xác định `hasNextPage`; không yêu cầu total count.
- Response chỉ gồm public request DTO, public roommate profile, information signals và current public listing card khi linked.

Với `ALL` hoặc `LINKED`, Engagement đọc local candidates theo từng chunk ổn định tối đa 100 row, gọi Listing public-summaries theo batch, loại linked row không được trả về hoặc có `maxOccupants < 2`, rồi tiếp tục scan cho đến khi đã bỏ qua đủ số eligible row của các page trước và thu được `pageSize + 1` row hoặc hết candidate. Vì vậy page/`hasNextPage` được tính trên **eligible result sau remote filtering**, không phải trên local rows trước filtering. V1 chấp nhận chi phí scan này theo quy mô ban đầu; không lưu eligibility shadow hoặc listing snapshot.

Khi query có thể chứa linked request mà Listing dependency không thể xác nhận eligibility, trả `503`; không silently trả linked result stale. Query `UNLINKED` có thể hoàn thành mà không gọi Listing.

V1 không có map, distance/radius, compatibility score, semantic search, recommendation hoặc AI ranking.

## 19. Messaging

- Roommate conversation được scope bởi `RoommateInterest`, không dùng hoặc refactor `listing_inquiries`.
- Transport V1 là REST polling/pagination; không yêu cầu WebSocket hoặc SSE.
- Interest create bắt buộc `message` không rỗng và ghi interest + first message atomically.
- Cả hai participant được gửi khi interest là `PENDING` hoặc `ACCEPTED`.
- `REJECTED`, `WITHDRAWN`, `LEFT` là read-only.
- Block làm thread read-only ngay trong cùng transaction xử lý block.
- Message order: `createdAt ASC`, `id ASC`; page size mặc định 50, tối đa 100.
- Sender không thể sửa/xóa message. Duplicate message được hạn chế bằng participant authorization, bounded rate limit và UI khóa thao tác khi request đang gửi; V1 không thêm idempotency persistence ngoài bốn entity roommate.
- Read marking chỉ cho recipient, monotonic và idempotent.
- Frontend render plain text, linkify an toàn nếu có và không render HTML do người dùng cung cấp.

## 20. Privacy

### 20.1 Được hiển thị cho tenant eligible

- Sáu field roommate profile.
- `displayName` tự khai và `memberSince` dạng tháng/năm.
- Request fields public: request ID, area, budget, move window, note, status/open recency, linked mode và current public listing projection nếu hợp lệ.
- Message chỉ trong thread mà caller là participant.

### 20.2 Không tự động hiển thị

- Email, phone, social handles hoặc external account IDs.
- Exact address hoặc exact coordinates.
- Internal Identity tenant ID.
- Moderation state/reason, report, reporter, block record hoặc risk metadata.
- Thông tin tài chính, giấy tờ tùy thân hoặc contact verification internals.
- Landlord private identity/contact ngoài hợp đồng listing/contact riêng đã được cho phép.

Accept không phải contact-sharing consent. V1 không có hành động reveal contact. Người dùng không được khuyến khích đưa contact, OTP, số tài khoản hoặc giấy tờ vào profile/request/message.

Direct access của non-participant, blocked pair hoặc resource bị ẩn trả lỗi không tiết lộ sự tồn tại khi phù hợp.

## 21. Verification và information signals

### 21.1 Eligibility signal bắt buộc

Một tenant chỉ eligible khi:

- Identity xác nhận `role = TENANT`, `isActive = true`.
- Roommate profile complete và visible.

### 21.2 Signal V1 được hiển thị

- `Thành viên từ MM/YYYY`, lấy từ Identity `createdAt` và làm tròn đến tháng.
- `Hồ sơ ở ghép đã hoàn thành`.
- `Yêu cầu đang mở` và thời điểm cập nhật/mở phù hợp.
- Với linked request: `Listing hiện đang khả dụng` chỉ khi current listing eligibility check đạt.

Đây là information signals, không phải trust, safety hoặc identity-verification badges.

Mặc dù Identity hiện có dữ liệu `email_verified_at` và `phone_verified_at`, tenant contact verification flow/provider chưa được bảo đảm đầy đủ cho use case này. V1 không public nhãn “email/phone đã xác minh”. Chỉ thêm sau khi có tenant-facing flow ổn định, provider thật và public-safe boolean contract được phê duyệt. Contact verified về sau vẫn không đồng nghĩa “đáng tin”.

## 22. Safety và moderation

V1 bắt buộc có:

- Bounded/normalized text và unknown-field rejection.
- Block hai chiều về hiệu lực tương tác.
- Report có target/category cụ thể, snapshot bằng chứng tối thiểu và event history append-only theo capability hiện có.
- Moderation `VISIBLE/HIDDEN` độc lập với business state.
- Rate limit, active pending cap, idempotency và duplicate suppression.
- Generic error khi cần tránh tiết lộ block/report/moderation.
- Sanitized logs; không log message body, contact, token, report evidence hoặc dữ liệu tài chính.

Admin có thể xem report queue/detail và ẩn profile/request/message. Ẩn nội dung không tự động cấm tài khoản; account action vẫn do Identity/admin policy hiện có quyết định. Nếu profile bị ẩn, request của tenant đó effective-suspended. Nếu request bị ẩn, không có interaction mới. Nếu message bị ẩn, thread hiển thị placeholder.

## 23. Block

- Block record nằm trong Engagement và có blocker/blocked tenant IDs logic; hiệu lực nếu tồn tại record ở một trong hai chiều.
- Chỉ tenant có ngữ cảnh hợp lệ qua request/interest mới block được counterpart; API không cho dò tenant ID tùy ý.
- Create block idempotent. Unblock chỉ owner của block record thực hiện và cũng idempotent.
- Trong transaction block: khóa tenant theo thứ tự xác định, ghi block, chuyển active interest giữa cặp theo mục 12 và làm thread read-only nếu cần.
- Blocked pair bị loại khỏi discovery cho nhau, không thể direct-read content để tương tác, tạo interest, accept hoặc message.
- Unblock không phục hồi interest/request/connection cũ và không gửi notification cho người bị block.

## 24. Report

Report target đúng một trong:

- `ROOMMATE_PROFILE`: profile của counterpart trong request/interest context.
- `ROOMMATE_REQUEST`: request caller được phép xem.
- `ROOMMATE_MESSAGE`: message trong thread caller tham gia.

Payload gồm `category` bắt buộc và `details` tùy chọn 1–2.000 code point, phù hợp contact-report contract hiện có. Server ghi subject IDs nội bộ, reporter, context, snapshot nội dung tối thiểu, thời điểm và trạng thái xử lý; reporter không thể sửa/xóa report.

Các category chuẩn: `FRAUD`, `PAYMENT_SCAM`, `SPAM`, `HARASSMENT`, `IMPERSONATION`, `INAPPROPRIATE_CONTENT`, `OTHER`.

Duplicate report cùng reporter + target chỉ tạo tối đa một report đang mở; retry trả record hiện tại. Report không tự động block, accept/reject/leave hoặc kết luận vi phạm. UI đề xuất block riêng sau report nhưng không ép.

Không tái sử dụng semantics `listing_inquiry` cho report roommate. Engagement có thể mở rộng `contact_reports`/event history hiện có bằng typed subject references, với constraint mỗi report có đúng một target và giữ tương thích inquiry hiện có.

## 25. Cảnh báo thanh toán và lừa đảo

Thông báo dài bắt buộc:

> RentMate không giữ chỗ, thu tiền hoặc bảo đảm giao dịch giữa người ở ghép. Không chuyển tiền hoặc đặt cọc chỉ dựa vào yêu cầu ở ghép hay tin nhắn. Hãy kiểm tra phòng, người cho thuê và điều kiện thuê trước khi giao dịch.

Thông báo ngắn bắt buộc:

> Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính. Thận trọng với yêu cầu chuyển tiền hoặc đặt cọc.

Vị trí hiển thị:

- Thông báo dài trên request detail linked, màn hình xác nhận accept và current connection.
- Thông báo ngắn cố định trong conversation; nhắc lại khi người dùng nhập nội dung có dấu hiệu contact/payment bằng deterministic client-side hint nếu được triển khai, nhưng không chặn gửi chỉ dựa trên hint.
- Flow B detail cũng hiển thị thông báo dài trước accept vì rủi ro thanh toán không phụ thuộc listing link.

V1 không có fraud engine, không tự động kết luận scam và không đưa ra trust verdict.

### 25.1 Safety checklist bắt buộc

UI phải hiển thị checklist ngắn, nguyên nghĩa và dễ đọc:

- Trao đổi qua RentMate trước.
- Xem phòng thực tế khi có thể.
- Xác nhận listing và điều kiện thuê với người cho thuê.
- Không chuyển tiền hoặc đặt cọc chỉ dựa vào tin nhắn.
- Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính nhạy cảm.
- Báo cáo và ngừng tương tác nếu thấy hành vi đáng ngờ.

Checklist xuất hiện tại request detail, conversation, ngay trước `ACCEPT` và current connection. Có thể thu gọn sau lần xem đầu ở màn hình conversation, nhưng warning ngắn về OTP/thanh toán luôn phải nhìn thấy.

## 26. Chống spam và rate limit

Các giá trị là default bảo thủ, cấu hình được theo deployment nhưng không được nới vô hạn:

| Action | Default limit | Scope |
|---|---:|---|
| Create + renew request | 3 / 24 giờ | tenant + IP |
| Patch/link/unlink/cancel request | 20 / giờ | tenant + IP |
| Create interest | 10 / giờ | tenant + IP |
| Concurrent outgoing `PENDING` interests | Tối đa 5 | tenant, invariant giao dịch |
| Send message | 30 / phút | tenant + interest + IP |
| Create report | 5 / giờ | tenant + IP |
| Block/unblock | 10 / giờ | tenant + IP |

Yêu cầu bổ sung:

- Initial interest message luôn bắt buộc và không rỗng.
- Duplicate active interest bị chặn bằng database constraint và transaction.
- Duplicate create interest bị chặn bằng active-interest constraint; duplicate active report bị chặn bằng subject-scoped unique constraint. Các transition state dùng conditional update/lock để retry không tạo thêm side effect.
- Rate-limited request trả `429 RATE_LIMITED` cùng `Retry-After`.
- Multi-instance production phải dùng shared limiter hoặc gateway-level distributed limiter trước khi scale ngang; in-memory limiter chỉ phù hợp một instance và không được mô tả là bảo vệ toàn cụm.

## 27. Hết hạn và gia hạn

- Request `OPEN` hết hạn đúng 30 ngày sau create/renew bằng UTC timestamp.
- Mọi discovery/detail/mutation kiểm tra `expiresAt > now`; scheduler không phải nguồn bảo đảm correctness.
- Khi encounter request `OPEN` đã hết hạn, transaction materialize `EXPIRED` trước khi xử lý tiếp.
- Background sweep materialize các record còn lại và chuyển tất cả interest `PENDING` sang `REJECTED` với reason `REQUEST_EXPIRED`; thread trở thành read-only; notification được ghi idempotently.
- Message create trên interest `PENDING` cũng recheck parent request; nếu request đã hết hạn, cùng transaction materialize expiration rồi từ chối message.
- Gửi tối đa một reminder vào 3 ngày trước expiry cho mỗi chu kỳ, dùng dedupe key theo request + `expiresAt`.
- Renew chỉ dành cho owner của `EXPIRED`, yêu cầu active tenant, profile complete/visible, không accepted connection và không có request `OPEN` khác.
- Renew revalidate area/budget/move window theo business date hiện tại, đặt `expiresAt = transaction time + 30 days`, giữ history và không hồi sinh interest cũ.
- Linked request có listing invalid vẫn có thể renew thành `OPEN` nhưng effective-suspended; owner phải unlink hoặc cancel. UI phải cảnh báo rõ ngay khi renew.
- Request `MATCHED`, interest `ACCEPTED/LEFT` không bị thay đổi do `expiresAt` cũ.

## 28. Notification

Engagement mở rộng notification capability hiện có; không tạo notification service mới. Event tối thiểu:

- `ROOMMATE_INTEREST_RECEIVED` cho owner.
- `ROOMMATE_INTEREST_ACCEPTED` cho candidate.
- `ROOMMATE_INTEREST_REJECTED` và `ROOMMATE_INTEREST_WITHDRAWN` khi có giá trị cho người nhận.
- `ROOMMATE_MESSAGE_RECEIVED`, được dedupe/batch để không spam.
- `ROOMMATE_CONNECTION_LEFT` cho counterpart.
- `ROOMMATE_REQUEST_EXPIRING` và `ROOMMATE_REQUEST_EXPIRED` cho owner.

Không gửi notification về block, report hoặc moderation reason cho đối tượng bị tác động. Notification không chứa message body, email, phone, exact address hoặc moderation internals. Việc ghi notification bắt buộc cùng transaction với state change; delivery ngoài transaction phải retry-safe.

## 29. API khái niệm

Tất cả route dưới `/api/v1`, dùng cookie session, `credentials: include`, success envelope `{ "data": ... }` và error envelope chuẩn. Unknown body/query field bị từ chối. ID public là positive 32-bit integer theo convention hiện tại; thời gian response là ISO 8601 UTC, date là `YYYY-MM-DD`.

### 29.1 Profile

| Method/path | Actor | Hành vi |
|---|---|---|
| `GET /roommate-profiles/me` | Active tenant | Trả profile của caller; `404` nếu chưa tạo. |
| `PUT /roommate-profiles/me` | Active tenant | Upsert toàn bộ sáu field; `200`; no-op ổn định timestamp. |

Không có public profile-by-tenant-ID endpoint. Profile người khác chỉ xuất hiện trong request/interest projection đã authorize.

### 29.2 Request

| Method/path | Actor | Hành vi |
|---|---|---|
| `POST /roommate-requests` | Active tenant, profile complete | Tạo linked/unlinked request; `201`. |
| `GET /roommate-requests` | Active tenant | Discovery theo mục 18. |
| `GET /roommate-requests/mine` | Active tenant | Lịch sử request của caller, paginated. |
| `GET /roommate-requests/:requestId` | Eligible tenant/owner | Owner luôn xem được; non-owner chỉ xem request `OPEN` đang discoverable. Matched context đi qua current connection, terminal interest context đi qua interest detail. |
| `PATCH /roommate-requests/:requestId` | Owner | Sửa area/budget/move/note khi `OPEN`; không sửa listing qua route này. |
| `POST /roommate-requests/:requestId/cancel` | Owner | `OPEN -> CANCELLED`. |
| `POST /roommate-requests/:requestId/renew` | Owner | `EXPIRED -> OPEN`. |
| `PUT /roommate-requests/:requestId/listing` | Owner | Body đúng `{ "listingId": "..." }`; link/replace khi `OPEN`. |
| `DELETE /roommate-requests/:requestId/listing` | Owner | Unlink khi `OPEN` và area hợp lệ. |

Create body đúng các field: `listingId`, `preferredAreaKeys`, `budgetMinPerPerson`, `budgetMaxPerPerson`, `moveInFrom`, `moveInUntil`, `note`. `listingId` và `note` có thể null. Patch chỉ nhận subset không rỗng của bốn nhóm field nội dung; cặp min/max và from/until được validate trên merged state.

### 29.3 Interest và connection

| Method/path | Actor | Hành vi |
|---|---|---|
| `POST /roommate-requests/:requestId/interests` | Non-owner tenant | Body `{ "message": "..." }`; tạo interest + first message; `201`. |
| `GET /roommate-requests/:requestId/interests` | Owner | Incoming interests của request, paginated. |
| `GET /roommate-interests` | Active tenant | `direction`, optional `status`, pagination. |
| `GET /roommate-interests/:interestId` | Participant | Interest/thread summary. |
| `POST /roommate-interests/:interestId/accept` | Request owner | Thực hiện hợp đồng mục 14. |
| `POST /roommate-interests/:interestId/reject` | Request owner | `PENDING -> REJECTED`. |
| `POST /roommate-interests/:interestId/withdraw` | Interested tenant | `PENDING -> WITHDRAWN`. |
| `POST /roommate-interests/:interestId/leave` | Participant | `ACCEPTED -> LEFT`. |
| `GET /roommate-connections/current` | Active tenant | Trả derived active connection; `404` nếu không có. |

### 29.4 Message

| Method/path | Actor | Hành vi |
|---|---|---|
| `GET /roommate-interests/:interestId/messages` | Participant | Paginated thread. |
| `POST /roommate-interests/:interestId/messages` | Participant | Body `{ "body": "..." }`; `201`. |
| `POST /roommate-interests/:interestId/read` | Participant | Đánh dấu message phía counterpart đã đọc; idempotent. |

### 29.5 Block và report

| Method/path | Actor | Hành vi |
|---|---|---|
| `PUT /roommate-requests/:requestId/block` | Non-owner viewer | Block request owner. |
| `DELETE /roommate-requests/:requestId/block` | Block creator | Unblock request owner. |
| `PUT /roommate-interests/:interestId/block` | Participant | Block counterpart. |
| `DELETE /roommate-interests/:interestId/block` | Block creator | Unblock counterpart. |
| `POST /roommate-requests/:requestId/reports` | Eligible viewer | Body target `ROOMMATE_PROFILE` hoặc `ROOMMATE_REQUEST`, category, details. |
| `POST /roommate-interests/:interestId/reports` | Participant | Report counterpart `ROOMMATE_PROFILE`. |
| `POST /roommate-messages/:messageId/reports` | Participant | Report `ROOMMATE_MESSAGE`. |

Admin moderation API dùng chính convention hiện hành:

| Method/path | Hành vi |
|---|---|
| `GET /admin/contact-reports?source=ROOMMATE&status=&category=&page=&pageSize=` | List roommate reports newest-first; limit-plus-one. |
| `GET /admin/contact-reports/:reportId` | Detail, public-safe subject context, reporter projection và ordered event history. |
| `PATCH /admin/contact-reports/:reportId/status` | Body `{ "status": "...", "note": "..." }`; dùng state machine report hiện có. |
| `PATCH /admin/roommate-profiles/:tenantId/moderation` | Body `{ "state": "VISIBLE|HIDDEN", "note": "...", "reportId": 123 }`. |
| `PATCH /admin/roommate-requests/:requestId/moderation` | Cùng moderation body. |
| `PATCH /admin/roommate-messages/:messageId/moderation` | Cùng moderation body. |

Ba moderation endpoint yêu cầu report `OPEN|INVESTIGATING` cùng subject, `note` 1–2.000 code point khi state thực sự đổi và ghi audit event append-only. Không tạo generic moderation endpoint cho tenant.

### 29.6 Internal service API

| Method/path | Owner | Hợp đồng |
|---|---|---|
| `GET /internal/v1/roommate-tenant-projections?ids=1,2` | Identity | 1–100 unique positive integer IDs; trả đúng `tenantId`, `role`, `isActive`, `displayName`, `memberSince`; không trả email/phone/verification/contact. |
| `GET /internal/v1/listings/public-summaries?ids=1,2` | Listing, hiện có | 1–100 IDs; chỉ trả current public summaries. Engagement coi ID vắng mặt hoặc `maxOccupants < 2` là roommate-ineligible. |

Các internal endpoint dùng service authentication hiện có, không đi qua public client, có bounded timeout và không trả partial result khi dependency lỗi.

## 30. Thiết kế database khái niệm

Tất cả bảng mới nằm trong Engagement database. Tên bảng và representation dưới đây là hợp đồng V1; migration vẫn là một implementation task được review riêng.

### 30.1 Bảng mới

| Bảng | Dữ liệu chính | Constraint/index bắt buộc ở mức khái niệm |
|---|---|---|
| `roommate_profiles` | tenant logical ID, sáu field profile, moderation, timestamps | Một row/tenant; enum/check length; index moderation. |
| `roommate_requests` | owner logical ID, optional listing logical ID, area array, budget, dates, state, expiry, moderation, timestamps | Partial uniqueness một `OPEN`/owner; budget/date checks; indexes discovery newest/status/expiry/owner/listing. |
| `roommate_interests` | request FK nội bộ, interested tenant logical ID, state, accepted/ended metadata | Không self-interest qua service/transaction; partial unique active request+tenant; partial unique accepted/request; indexes theo participant/state. |
| `roommate_messages` | interest FK nội bộ, sender logical ID, body, moderation/read/time | Index thread `(interestId, createdAt, id)`; immutable content policy. |

`preferredAreaKeys` được lưu bằng PostgreSQL `text[]`, đồng nhất với convention array hiện có. Repository/query phải parameterized. V1 không thêm area-specific index cho substring search; discovery B-tree lọc `OPEN`/visible/unexpired và newest trước, sau đó `unnest` area trên candidate set. Query plan phải được kiểm tra trước production. Không thêm bảng area chỉ cho V1.

### 30.2 Capability hiện có được mở rộng

- `contact_blocks`: giữ unique pair `(blocker_id, blocked_id)` hiện có; đổi `inquiry_id` thành nullable và thêm nullable `roommate_request_id` FK nội bộ. Check constraint yêu cầu đúng một trong hai context. Block từ interest dùng request của interest làm context; không duplicate block theo thread.
- `contact_reports`: thêm `source` (`CONTACT_INQUIRY|ROOMMATE`), nullable `roommate_request_id`, `roommate_message_id`, `subject_tenant_id` và `target_type`. Với `ROOMMATE`, `inquiry_id` là null, `roommate_request_id` bắt buộc và target-specific field phải khớp đúng `ROOMMATE_PROFILE|ROOMMATE_REQUEST|ROOMMATE_MESSAGE`; với contact inquiry, các roommate field là null. Giữ report/event lịch sử hiện hữu.
- `contact_report_events`: tiếp tục append-only cho report status và thêm typed subject-moderation event (`SUBJECT_HIDDEN|SUBJECT_RESTORED`) gắn `report_id`; không có moderation action roommate ngoài report context.
- `notifications`: thêm nullable `roommate_request_id` và `roommate_interest_id`, roommate event types và dedupe keys; mỗi roommate notification phải có request hoặc interest context phù hợp với event.

Mọi logical Identity/Listing ID không có cross-service FK. Không lưu raw provider object, email/phone snapshot, exact listing address/coordinates hoặc compatibility score.

### 30.3 Transaction và constraint

- Mọi multi-write transaction dùng một checked-out client từ `BEGIN` tới `COMMIT/ROLLBACK`.
- Row lock request/interest ở transition; advisory tenant locks theo mục 14.
- Database unique/check constraints là defense in depth; lỗi constraint phải map về application error ổn định, không lộ SQL/constraint name.
- Expiration sweep và notification delivery cần deterministic dedupe key.
- Không trigger cross-domain, không ORM metadata và không migration bookkeeping table trong product schema.

## 31. Error model

Giữ error envelope chung:

```json
{
  "error": {
    "code": "ROOMMATE_OPEN_REQUEST_EXISTS",
    "message": "Bạn đã có một yêu cầu tìm người ở ghép đang mở.",
    "requestId": "...",
    "details": []
  }
}
```

| HTTP | Code | Khi dùng |
|---:|---|---|
| 401 | `AUTHENTICATION_REQUIRED` | Session thiếu/sai/hết hạn hoặc account inactive. |
| 403 | `FORBIDDEN` | Role không phải tenant; origin không hợp lệ ở unsafe method. |
| 404 | `RESOURCE_NOT_FOUND` | Không tồn tại, không sở hữu/không tham gia, blocked/hidden direct resource cần chống disclosure. |
| 409 | `ROOMMATE_OPEN_REQUEST_EXISTS` | Owner đã có request `OPEN`. |
| 409 | `ROOMMATE_ACTIVE_CONNECTION_EXISTS` | Một participant đã có accepted connection. |
| 409 | `ROOMMATE_CANDIDATE_OPEN_REQUEST` | Candidate cần tự cancel request `OPEN`. |
| 409 | `ROOMMATE_REQUEST_NOT_OPEN` | Mutation cần `OPEN` nhưng state đã đổi. |
| 409 | `ROOMMATE_REQUEST_EXPIRED` | Request đã qua `expiresAt`. |
| 409 | `ROOMMATE_INTEREST_NOT_PENDING` | Transition cần `PENDING` nhưng state đã đổi. |
| 409 | `ROOMMATE_LISTING_INELIGIBLE` | Current linked listing không đạt rule. |
| 409 | `ROOMMATE_PENDING_INTEREST_LIMIT` | Đã có 5 outgoing `PENDING`. |
| 409 | `CONCURRENT_MODIFICATION` | Conflict khác cần generic/retry-safe, gồm race hoặc block không nên lộ. |
| 422 | `VALIDATION_FAILED` | Sai field/type/range/enum/date/unknown field. |
| 429 | `RATE_LIMITED` | Vượt limit; trả `Retry-After`. |
| 503 | `DEPENDENCY_UNAVAILABLE` | Không thể xác nhận Identity/Listing condition bắt buộc. |

Không trả raw SQL, stack trace, internal ID, block direction, report/moderation reason hoặc dependency payload. Error message client-facing bằng tiếng Việt; `code` ổn định cho logic frontend.

## 32. Yêu cầu frontend

Frontend App Router cần tối thiểu:

- Trang thiết lập/chỉnh sửa roommate profile với giải thích enum trung tính.
- Discovery list + filter, loading/empty/error/retry và pagination.
- Create/edit/mine request; hai mode linked/unlinked; listing picker chỉ từ public eligible listings.
- Request detail với profile, information signals, linked listing context, interest CTA và safety warning.
- Inbox interest theo incoming/outgoing, thread chat và state action đúng vai trò.
- Current connection view với leave, block, report và listing unavailable state.
- Report dialog có target/category/details; block confirmation không gây hiểu nhầm là report.

Mọi API call dùng `credentials: "include"`; không đọc/lưu JWT trong JavaScript. UI phải xử lý rõ `401`, `403`, `404`, `409`, `422`, `429`, `503` và retry-safe states.

Các trạng thái UI bắt buộc:

- Profile chưa hoàn thành/đã bị ẩn.
- Đã có request `OPEN` hoặc active connection.
- Linked request effective-suspended vì listing invalid.
- Candidate cần cancel request của mình trước accept.
- Interest pending/accepted/terminal; terminal thread read-only.
- Blocked/hidden resource với thông điệp trung tính.
- Request sắp hết hạn/đã hết hạn/gia hạn thành công.

Không hiển thị compatibility percentage, “verified/trusted roommate”, booking/reserved/landlord-approved language hoặc contact reveal. Không dùng map cho discovery V1.

## 33. Tiêu chí nghiệm thu chức năng

1. Active tenant có profile complete tạo được đúng một request `OPEN`, linked hoặc unlinked.
2. Request thứ hai đồng thời hoặc tuần tự bị chặn bằng `RM-RM-INV-001`.
3. Tenant không active/non-tenant không đọc hoặc ghi roommate data.
4. Unlinked request bắt buộc area; linked request chỉ nhận listing eligible `maxOccupants >= 2`.
5. Discovery áp dụng đúng exclusion, overlap filters, newest sort và public-safe projection.
6. Initial interest và first message cùng commit hoặc cùng rollback; self-interest bị từ chối.
7. Hai participant chat được ở `PENDING`/`ACCEPTED`; terminal thread read-only.
8. Owner reject/accept, candidate withdraw và participant leave đúng state machine.
9. Accept chuyển request `MATCHED`, interest `ACCEPTED`, cleanup competing/outgoing pending và tạo notification atomic.
10. Candidate có request `OPEN` không được accept và hệ thống không tự cancel.
11. `LEFT` không reopen request; hai tenant có thể tạo request mới khi không còn active commitment khác.
12. Chỉ `OPEN` link/unlink; `MATCHED` giữ listing context không thay thế.
13. Listing invalid khi `OPEN` làm effective suspension; invalid sau `MATCHED` không phá connection.
14. Request hết hạn bị loại ngay cả khi scheduler chưa chạy; renew không hồi sinh interest cũ.
15. Block, report, moderation, warning và rate limits hoạt động theo mục tương ứng.
16. Không response nào lộ contact, internal tenant ID, exact location, report/block/moderation internals.

## 34. Tiêu chí nghiệm thu đồng thời

Các test PostgreSQL integration bắt buộc chạy trên disposable test database:

- Hai create request đồng thời cho cùng tenant: một success, một conflict; đúng một row `OPEN`.
- Create/renew request đua với accept cùng tenant: kết quả tuần tự hóa theo mục 14, không có cả `OPEN` và accepted commitment.
- Hai accept đồng thời trên cùng request: đúng một accepted interest/request matched.
- Hai accept ở hai request khác nhau nhắm cùng candidate: candidate chỉ thuộc một connection.
- Cross-accept A/B ngược chiều: không deadlock và chỉ một connection.
- Accept đua với expiry/sweep: không accept request có `expiresAt <= now`.
- Accept linked request đua với unlink/replace: row lock bảo đảm accept dùng đúng listing reference đã recheck hoặc trả conflict.
- Block đua với send message/accept: sau commit block không có message/accept mới lọt qua.
- Hai interest create đồng thời cùng request/candidate: đúng một active interest và một first-message thread.
- Leave đồng thời từ hai phía: đúng một `LEFT` transition, retry không làm reopen request.

Test phải khẳng định transaction rollback không để partial state hoặc notification mồ côi.

## 35. Tiêu chí nghiệm thu privacy và safety

- Anonymous, inactive tenant, landlord và non-participant bị từ chối đúng contract.
- Discovery/detail/message DTO không có email, phone, social, internal IDs, exact address/coordinates hoặc moderation metadata.
- Owner/admin projection không vô tình được dùng cho tenant discovery.
- Block hai chiều loại discovery và chặn direct interaction; response không xác nhận ai đã block ai.
- Report chỉ được tạo với target caller có ngữ cảnh hợp lệ; duplicate được dedupe; report event append-only.
- Hidden profile/request/message có projection đúng và evidence không bị mất.
- Warning dài/ngắn xuất hiện đúng vị trí; accept không hiện contact.
- Plain-text rendering chống stored XSS; control chars, oversized body và unknown fields bị reject.
- Rate limit và pending cap được test, gồm retry header và multi-request race.
- Log/error snapshot được kiểm tra không chứa token, contact, message body, payment data, raw SQL hoặc provider payload.
- Tenant-facing UI không dùng badge “verified”, “trusted”, “safe” hoặc lời khẳng định landlord/listing đã chấp thuận ngoài dữ kiện thực tế.

## 36. Ngoài phạm vi V1

- Nhóm từ ba người, group lifecycle, invitation hoặc group chat.
- `RoommateGroup`, member management hoặc service `Roommate Service` mới.
- Landlord xác nhận/chấp thuận roommate pair.
- Booking, reservation, hợp đồng thuê, thu tiền, split payment hoặc escrow.
- Chia sẻ/reveal email, phone, social account, giấy tờ hoặc thông tin tài chính.
- Contact verification badge cho tenant.
- Background check, legal identity verification hoặc trust/safety score.
- Compatibility score, weighted matching, recommendation, semantic search hoặc AI ranking.
- Saved roommate searches, automatic listing recommendation hoặc joint listing workspace.
- Joint application với landlord/listing.
- AI moderation/fraud verdict.
- Map/radius discovery cho roommate.
- WebSocket/SSE/realtime presence, typing indicator, attachment, image hoặc voice message.
- Edit/delete message.
- Listing snapshot/duplicate listing data trong Engagement.
- Thay listing sau `MATCHED` hoặc tự động terminate connection theo listing lifecycle.

## 37. Hướng V2

Chỉ xem xét sau khi V1 có dữ liệu vận hành và review riêng:

- Landlord confirmation với contract rõ, không đồng nghĩa booking.
- Tenant contact verification sau khi có provider thật và tenant-facing recovery/abuse flow.
- Badges chỉ phản ánh fact cụ thể, không gộp thành trust verdict.
- Deterministic matching/filter explanation có thể kiểm thử, opt-out và không dùng protected/sensitive attributes.
- Group flow nếu nghiên cứu chứng minh nhu cầu và có safety model riêng.
- Recommendation dựa trên preference minh bạch.
- Deterministic scam heuristics và quy trình review/appeal tốt hơn.
- Risk review tooling và evidence handling nâng cao.

## 38. Hướng V3 AI

AI chỉ là hỗ trợ, không là thẩm quyền tự động:

- Parse preference tự do thành filter có xác nhận của người dùng.
- Semantic recommendation và explanation có thể phản hồi/sửa.
- Cảnh báo message đáng ngờ, duplicate/scam pattern và ưu tiên review.
- Tóm tắt report cho moderator với trích dẫn evidence và audit trail.

AI không được tự động kết luận ai đáng tin, tự động accept/reject/ban, suy diễn thuộc tính nhạy cảm, tiết lộ dữ liệu private hoặc thay thế human review trong quyết định gây ảnh hưởng lớn.

## 39. Readiness review

### 39.1 Schema/API/lifecycle/service ownership

- Bốn entity cốt lõi, field, enum, state machine, invariant và transaction boundary đã được chốt.
- API public/internal, error model, pagination và authorization đã đủ để tách implementation tasks.
- Identity, Listing, Engagement và Gateway ownership không dùng shared DB/cross-service FK.
- Listing lifecycle trước/sau match và giới hạn eventual consistency đã được định nghĩa.

### 39.2 Privacy/safety

- Public-safe projection, block/report/moderation, payment warning, anti-spam và acceptance tests đã được chốt.
- Contact verification không bị quảng bá quá mức; accept không tạo contact consent.
- Không có trust verdict, booking implication hoặc automatic scam conclusion.

### 39.3 Feature-leak review

- Không có group, score, recommendation, AI, payment, contact reveal, realtime transport hoặc landlord confirmation trong V1.
- Không refactor inquiry chat thành generic messaging và không đưa listing-owned data vào Engagement.
- V2/V3 chỉ là hướng tương lai, không phải implementation scope ngầm.

### 39.4 Câu trả lời readiness bắt buộc

| Câu hỏi | Trả lời |
|---|---|
| Còn quyết định schema-changing chưa giải quyết? | **Không.** Bốn bảng roommate và các extension safety/notification ở mức khái niệm đã đủ để lập kế hoạch migration riêng. |
| Còn quyết định API-changing chưa giải quyết? | **Không.** Public/internal surfaces, actor, payload, state precondition và error mapping đã được chốt ở mức specification. |
| Còn quyết định lifecycle chưa giải quyết? | **Không.** Request, interest, listing link, expiration, block và leave lifecycle đã được chốt. |
| Còn quyết định service ownership chưa giải quyết? | **Không.** Engagement sở hữu roommate; Identity và Listing cung cấp projection; Gateway định tuyến. Không có Roommate Service. |
| Có tính năng V2/V3 nào lọt vào V1? | **Không.** Các mục V2/V3 chỉ là roadmap và đều bị loại khỏi acceptance/scope V1. |

Không còn blocker sản phẩm, safety, schema khái niệm, API khái niệm, lifecycle hoặc service ownership cần giải quyết trước khi lập kế hoạch triển khai.

**Roommate V1 Specification is ready for implementation planning.**
