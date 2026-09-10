# RentMate — Kế hoạch tính năng AI hậu MVP

> Trạng thái: kế hoạch triển khai chi tiết; chưa tích hợp AI provider.
>
> Mục tiêu: dùng AI để giảm công sức tìm phòng, nhưng mọi dữ liệu nghiệp vụ cuối cùng vẫn lấy từ API và database hiện tại của RentMate.

## 1. Định hướng sản phẩm

RentMate không cần bắt đầu bằng một chatbot tổng quát. AI nên xuất hiện đúng nơi người dùng cần:

```text
Tenant tìm phòng      → panel trợ lý AI
Tenant xem listing    → điểm phù hợp và lý do
Admin duyệt tin       → cảnh báo rủi ro
```

AI không được tự nhận là landlord, tự hứa hẹn về phòng, tự quyết định duyệt hồ sơ hoặc tự tạo dữ liệu không có trong listing.

## 2. Thứ tự ưu tiên

### P0 — Trợ lý tìm phòng bằng ngôn ngữ tự nhiên

Tenant có thể nhập:

> Mình cần phòng dưới 5 triệu, gần HUTECH, ở 2 người, có máy lạnh và chỗ để xe.

AI chuyển nội dung thành các bộ lọc được phép:

```json
{
  "area": "gần HUTECH",
  "maxPrice": 5000000,
  "minOccupants": 2,
  "amenities": ["AIR_CONDITIONING", "PARKING"]
}
```

Luồng bắt buộc:

1. Tenant mở nút `Tìm phòng bằng AI` trong trang tìm kiếm.
2. AI hiển thị các tiêu chí đã hiểu dưới dạng chip hoặc form có thể sửa.
3. Tenant xác nhận.
4. Frontend gọi search API hiện tại bằng query đã được kiểm tra.
5. Kết quả hiển thị bằng giao diện danh sách và bản đồ hiện tại.

AI không được gọi SQL trực tiếp, tự bỏ qua authorization, tự sửa query ngoài allowlist hoặc tự trả về listing không tồn tại.

### P1 — Điểm phù hợp và giải thích

Hiển thị trên card hoặc trang chi tiết:

```text
Phù hợp 88%

✓ Đúng ngân sách
✓ Đúng khu vực
✓ Có máy lạnh
⚠ Diện tích thấp hơn yêu cầu
```

Giai đoạn đầu nên tính điểm bằng quy tắc xác định dựa trên bộ lọc và dữ liệu listing. AI chỉ hỗ trợ tạo câu giải thích nếu cần; không dùng câu trả lời tự do để thay thế dữ liệu chính xác.

### P1 — Cảnh báo listing đáng ngờ cho admin

AI có thể đánh dấu để admin kiểm tra:

- Giá thấp bất thường so với các listing tương tự.
- Mô tả trùng hoặc gần trùng nhiều tin khác.
- Ảnh có khả năng được dùng lại.
- Nội dung yêu cầu chuyển tiền hoặc có dấu hiệu lừa đảo.
- Thông tin trong tiêu đề và mô tả mâu thuẫn.

Kết quả chỉ là tín hiệu hỗ trợ, không phải kết luận. Admin vẫn là người điều tra và quyết định xử lý report hoặc moderation.

## 3. Hình dung giao diện

### Tenant

```text
[Bộ lọc]  [Tìm phòng bằng AI]

┌─────────────────────────────────────┐
│ Bạn đang cần tìm phòng như thế nào? │
│ [Nhập nhu cầu bằng tiếng Việt...]   │
│                                     │
│ AI hiểu:                            │
│ [Dưới 5 triệu] [Gần HUTECH] [2 người]│
│                                     │
│        [Sửa lại] [Dùng bộ lọc này]  │
└─────────────────────────────────────┘
```

Đây là panel hoặc modal ngắn, không phải trang chatbot riêng và không dùng chung với chat landlord.

### Admin

Cảnh báo AI nằm trong hàng đợi moderation/report, có nhãn `Cần kiểm tra`, lý do và nút mở dữ liệu public liên quan.

## 4. Ranh giới kỹ thuật, bảo mật và privacy

- Chỉ gọi AI từ backend; API key không xuất hiện trong browser.
- Chỉ gửi dữ liệu tối thiểu cần thiết cho tác vụ.
- Không gửi OTP, verification token, JWT, cookie, API key, email đầy đủ, số điện thoại đầy đủ hoặc tọa độ chính xác.
- Kết quả AI phải được parse vào schema allowlist và validate trước khi dùng.
- Có timeout, giới hạn lượt gọi, giới hạn token và fallback về bộ lọc thủ công.
- Không log prompt có thông tin cá nhân hoặc raw provider response không cần thiết.
- Có cơ chế báo lỗi thân thiện khi AI không khả dụng; chức năng tìm phòng cơ bản vẫn hoạt động.
- Không dùng AI để thay thế authorization, moderation policy hoặc lifecycle policy.
- Chưa chốt provider, model, prompt production hay chi phí trong tài liệu này.

## 5. Checklist kiểm thử

- [ ] Câu tiếng Việt được chuyển thành query hợp lệ.
- [ ] Field ngoài allowlist bị loại bỏ hoặc báo lỗi an toàn.
- [ ] Tenant phải xác nhận trước khi gọi search API.
- [ ] AI timeout hoặc trả JSON sai định dạng vẫn có fallback.
- [ ] Không gửi hoặc ghi log dữ liệu nhạy cảm.
- [ ] Điểm phù hợp không vượt quá dữ liệu thực tế của listing.
- [ ] Cảnh báo rủi ro không tự động khóa hoặc xóa listing.
- [ ] Landlord phải duyệt nội dung trước khi chèn vào form.
- [ ] Prompt injection không thể làm AI bỏ qua quyền hoặc trả dữ liệu riêng tư.
- [ ] Có rate limit và giới hạn chi phí.
- [ ] UI hoạt động tại 375, 768, 1024 và 1440px.

## 6. Giai đoạn triển khai đề xuất

1. Chốt schema bộ lọc AI và UI panel.
2. Làm parser/validator ở backend với dữ liệu mô phỏng, chưa cần provider thật.
3. Kết nối parser với search API hiện tại và bổ sung fallback.
4. Thêm điểm phù hợp bằng rule-based để kiểm chứng nhu cầu.
5. Sau khi có dữ liệu sử dụng, mới cân nhắc mở rộng cảnh báo listing bằng AI.

## 7. Ngoài phạm vi hiện tại

- Chatbot tổng quát trả lời mọi câu hỏi.
- AI tự thương lượng, tự đặt cọc hoặc tự ký hợp đồng.
- AI tự duyệt hoặc tự từ chối landlord/listing.
- AI tự quyết định tenant nào được thuê phòng.
- Gợi ý phòng hoàn toàn tự động khi chưa có dữ liệu hành vi đủ tin cậy.

## 8. Kết quả rà soát codebase hiện tại

Các seam có thể tái sử dụng:

- Public search hiện nhận đúng các field: `q`, `areaName`, khoảng giá, khoảng diện tích, `minOccupants`, `propertyType`, `amenities`, bounds/radius, pagination và sort.
- `frontend/features/listings/search-query.ts` đã có parser/serializer chặt chẽ và loại trừ bounds với radius.
- Listing Service sở hữu public search, lookup property type/amenity, owner listing và admin moderation.
- API Gateway đã route toàn bộ prefix `/api/v1/listings`, `/api/v1/landlord/listings` và `/api/v1/admin/listings` sang Listing Service.
- `PublicListingSummary` có đủ giá, diện tích, sức chứa, khu vực, property type và amenities để tính điểm phù hợp rule-based ở frontend.
- Owner editor đã có title/description, giới hạn mô tả 5.000 ký tự và lifecycle lưu rõ ràng.
- Admin listing queue đã có trust signals deterministic: tin stale, số report mở và khả năng trùng tiêu đề.
- Runtime đã có pattern config validation, rate limit, timeout provider, sanitized error và request ID để tái sử dụng.
- Hiện chưa có AI provider, AI table, AI endpoint hoặc secret AI trong repository.

Hệ quả thiết kế:

- Giai đoạn trợ lý tìm phòng không cần microservice mới và không cần database.
- Module AI đầu tiên nên nằm trong Listing Service vì nó sở hữu search schema và lookup codes.
- Điểm phù hợp nên bắt đầu bằng pure function, không gọi provider.
- Cảnh báo rủi ro phải mở rộng trust signals hiện có, không tạo một queue moderation thứ hai.

## 9. Kiến trúc đề xuất cho giai đoạn đầu

```text
Frontend AI panel
      ↓ POST qua Gateway
Listing Service / AI search-intent module
      ├── request validation
      ├── lookup allowlist
      ├── redaction + prompt builder
      ├── provider client có timeout
      └── output schema validation
      ↓
Frontend review chips/form
      ↓ tenant xác nhận
Public search API hiện tại
```

Không cho model:

- Gọi database hoặc service khác.
- Chọn listing thay người dùng.
- Sinh tọa độ, ID listing, contact hoặc dữ liệu moderation.
- Trả JSON trực tiếp ra browser trước khi Listing Service validate.

### 9.1 Boundary module

Module dự kiến:

```text
services/listing-service/src/modules/ai-search/
├── controllers/ai-search-controller.ts
├── services/ai-search-service.ts
├── validations/ai-search-validation.ts
├── providers/ai-search-provider.ts
├── providers/remote-ai-search-provider.ts
├── ai-search-prompt.ts
└── routes.ts
```

Tên file có thể điều chỉnh theo convention khi code, nhưng boundary phải giữ nhỏ và chỉ xử lý search intent. Không tạo generic “AI framework” cho mọi module.

### 9.2 Endpoint đề xuất

#### Capability

```text
GET /api/v1/listings/ai/capabilities
```

Response tối thiểu:

```json
{
  "data": {
    "searchIntent": true
  }
}
```

Không trả provider name, model, API key, quota hoặc thông tin nội bộ. Endpoint giúp frontend ẩn CTA khi AI bị tắt mà không cần copy feature flag vào hai môi trường.

#### Parse search intent

```text
POST /api/v1/listings/ai/search-intent
```

Request:

```json
{
  "prompt": "Mình cần phòng dưới 5 triệu, ở 2 người, có máy lạnh"
}
```

Quy tắc request:

- Chỉ chấp nhận field `prompt`; reject unknown fields.
- Trim Unicode whitespace.
- Giới hạn đề xuất 10–500 ký tự.
- Không chấp nhận body array/null hoặc content type không hợp lệ.
- Anonymous được dùng vì public search hiện cho phép anonymous, nhưng phải có Origin guard và rate limit theo IP.

Response sau khi provider và service validation thành công:

```json
{
  "data": {
    "filters": {
      "maxMonthlyRent": 5000000,
      "minOccupants": 2,
      "amenities": ["AIR_CONDITIONING"]
    },
    "recognized": [
      "Ngân sách tối đa 5 triệu đồng",
      "Ít nhất 2 người",
      "Có máy lạnh"
    ],
    "unresolvedTerms": [],
    "confidence": "HIGH"
  }
}
```

Allowlist output:

- `q`
- `areaName`
- `minMonthlyRent`, `maxMonthlyRent`
- `minRoomAreaSqm`, `maxRoomAreaSqm`
- `minOccupants`
- `propertyType`
- `amenities`
- `sort` cho ordinary search

Không cho AI sinh:

- `page`, `pageSize`
- `north`, `south`, `east`, `west`
- `centerLat`, `centerLng`, `radiusKm`
- listing ID, landlord ID hoặc user ID

Nếu tenant nói “gần HUTECH”, AI chỉ được trả text search/area term. Việc biến POI thành tọa độ hoặc thời gian di chuyển nằm ngoài P0 và không được tự suy đoán.

### 9.3 Merge với query hiện tại

AI response là một filter proposal, không phải query đã commit.

Frontend thực hiện:

1. Hiển thị proposal bằng chip/form.
2. Cho tenant sửa hoặc bỏ từng tiêu chí.
3. Merge các field đã xác nhận với filter hiện tại.
4. Giữ bounds/radius hiện tại nếu tenant không chủ động xóa.
5. Nếu mode radius, ép sort về `distance_asc` theo contract hiện có.
6. Reset page về 1.
7. Dùng `serializeSearchState` và điều hướng tới URL search bình thường.

Không lưu prompt vào URL, localStorage hoặc saved search. Saved search chỉ lưu query đã được tenant xác nhận.

### 9.4 Mã lỗi đề xuất

| Trường hợp | HTTP | Code công khai | Hành vi frontend |
|---|---:|---|---|
| Prompt/body sai | 422 | `VALIDATION_ERROR` | Hiển thị lỗi tại field |
| Quá giới hạn | 429 | `RATE_LIMITED` | Giữ prompt, yêu cầu thử sau |
| AI bị tắt | 503 | `AI_ASSISTANT_UNAVAILABLE` | Đóng CTA và dùng bộ lọc thường |
| Provider timeout | 504 | `AI_PROVIDER_TIMEOUT` | Giữ prompt, cho thử lại thủ công |
| Provider từ chối/5xx/output sai | 502 | `AI_PROVIDER_ERROR` | Thông báo an toàn, không lộ raw response |

Thông điệp lỗi không chứa prompt, provider body, model, API key hoặc stack trace.

## 10. Cấu hình và provider boundary

Biến môi trường dự kiến, chỉ thêm placeholder vào `.env.example` khi triển khai:

```text
AI_SEARCH_ENABLED=false
AI_PROVIDER_BASE_URL=
AI_PROVIDER_API_KEY=
AI_PROVIDER_MODEL=
AI_PROVIDER_TIMEOUT_MS=5000
AI_SEARCH_RATE_LIMIT_PER_15_MINUTES=10
```

Quy tắc config:

- Khi `AI_SEARCH_ENABLED=false`, Listing Service vẫn khởi động và search thường hoạt động.
- Khi bật AI, base URL, API key và model là bắt buộc.
- Production chỉ chấp nhận HTTPS, không chấp nhận placeholder hoặc credential trong URL.
- API key không trim/mutate ngoài validation cần thiết và không bao giờ log.
- Timeout phải bounded, đề xuất 1.000–15.000 ms.
- Readiness kiểm tra config nội bộ; không gọi provider ở mỗi health request.
- Không retry tự động ở phiên bản đầu để tránh tăng chi phí và độ trễ ngoài dự kiến.

Provider interface chỉ nhận input đã redaction và trả structured candidate. Provider implementation không nhận Express request, database pool hoặc JWT.

## 11. Kế hoạch triển khai theo giai đoạn

### Giai đoạn 0 — Chốt contract và threat model

Mục tiêu: khóa dữ liệu nào được phép đi vào/đi ra trước khi gọi model thật.

Công việc:

1. Chốt request/response và error codes ở trên.
2. Chốt danh sách từ nhạy cảm cần redaction: email, số điện thoại, URL có token, OTP và chuỗi giống secret.
3. Chốt behavior với prompt injection, JSON sai schema, lookup code không tồn tại và provider timeout.
4. Chốt quota anonymous và cách lấy IP đáng tin cậy sau Gateway.
5. Tạo provider interface cùng fake provider deterministic cho test; chưa cần credential thật.

File dự kiến:

- `services/listing-service/src/modules/ai-search/validations/ai-search-validation.ts`
- `services/listing-service/src/modules/ai-search/providers/ai-search-provider.ts`
- `services/listing-service/test/ai-search-validation.test.ts`
- Tài liệu API hậu MVP nếu repository tách API contract riêng khi triển khai.

Điều kiện hoàn thành:

- Unknown fields bị reject.
- Test chứng minh output ngoài allowlist không đi qua service.
- Chưa có network call hoặc secret.

Commit dự kiến: `chot contract tro ly ai tim phong`

### Giai đoạn 1 — Backend search-intent với provider giả lập

Mục tiêu: hoàn thiện toàn bộ validation/service/controller trước khi kết nối provider thật.

Công việc:

1. Tạo module `ai-search` trong Listing Service.
2. Tạo capability và search-intent endpoint.
3. Tái sử dụng lookup repository để cung cấp property type/amenity allowlist.
4. Validate lần hai bằng các giới hạn của public search.
5. Thêm rate limiter riêng, không dùng chung bucket geocoding.
6. Đăng ký route trong Listing Service.
7. Xác nhận Gateway route đúng prefix và bổ sung gateway contract test.
8. Không ghi database và không tạo migration.

File dự kiến sửa/tạo:

- `services/listing-service/src/modules/ai-search/**`
- `services/listing-service/src/server.ts`
- `services/listing-service/src/modules/listings/routes.ts` hoặc route module riêng được đăng ký cạnh listings.
- `services/listing-service/test/ai-search-service.test.ts`
- `services/listing-service/test/ai-search-http.test.ts` nếu harness hiện tại hỗ trợ.
- `services/api-gateway/test/gateway.test.mjs`

Test bắt buộc:

- Prompt hợp lệ.
- Prompt rỗng/quá dài/unknown field.
- Provider trả field lạ, mã amenity sai, range giá sai hoặc JSON không hợp lệ.
- Rate limit.
- Capability bật/tắt.
- Không log prompt hoặc output raw.

Điều kiện hoàn thành:

- Endpoint chạy qua Gateway với fake provider.
- Search API hiện tại chưa thay đổi.
- Listing/Identity/Engagement không phát sinh migration.

Commit dự kiến: `them backend tro ly ai tim phong`

### Giai đoạn 2 — Kết nối provider thật có kiểm soát

Mục tiêu: thay fake provider bằng remote adapter nhưng giữ nguyên contract nội bộ.

Công việc:

1. Mở rộng runtime config với validation bật/tắt theo channel AI.
2. Tạo remote provider client dùng `fetch`, `AbortController` và timeout bounded.
3. Ép structured output/schema ở provider nếu provider hỗ trợ.
4. Parse và validate output độc lập với SDK/provider response type.
5. Sanitize tất cả provider errors.
6. Thêm placeholder `.env.example` và wiring cho container Listing Service trong Docker Compose.
7. Không in hoặc đọc giá trị `.env` thật trong test/log.

File dự kiến:

- `services/listing-service/src/modules/ai-search/providers/remote-ai-search-provider.ts`
- `services/listing-service/src/modules/ai-search/ai-search-prompt.ts`
- `services/shared/src/runtime/config/env.ts`
- `services/shared/test` hoặc test config hiện có.
- `.env.example`
- `docker-compose.microservices.yml`
- `services/listing-service/src/server.ts`
- Test provider mock HTTP tương ứng.

Test bắt buộc:

- Provider chấp nhận response.
- Timeout.
- 4xx, 5xx, body rỗng, JSON sai và schema sai.
- API key/prompt không xuất hiện trong error/log.
- Production từ chối HTTP, placeholder và config thiếu khi feature bật.
- Service khởi động bình thường khi AI tắt.

Điều kiện hoàn thành:

- Listing Service chỉ trả 200 sau khi provider output qua validation.
- Provider lỗi không ảnh hưởng public search thường.
- Docker config và health/readiness pass.

Commit dự kiến: `ket noi provider cho tro ly ai`

### Giai đoạn 3 — UI trợ lý AI tìm phòng

Mục tiêu: thêm panel ngắn trong trang search, không tạo chatbot toàn trang.

State UI:

```text
CLOSED → EDITING → PARSING → REVIEW → APPLYING → CLOSED
                    └──────→ ERROR → EDITING
```

Công việc:

1. Tạo CTA `Tìm phòng bằng AI` cạnh filter/search actions.
2. Tải capability; ẩn CTA khi AI tắt.
3. Mở modal trên desktop và sheet/panel phù hợp trên mobile.
4. Giữ prompt khi request lỗi để tenant không phải nhập lại.
5. Hiển thị recognized filters, unresolved terms và confidence bằng text, không chỉ màu.
6. Cho sửa/xóa proposal trước khi apply.
7. Khi apply, gọi helper merge và điều hướng qua URL search hiện tại.
8. Không lưu prompt và không trộn với inquiry chat.

File dự kiến:

- `frontend/features/ai-search/ai-search-assistant.tsx`
- `frontend/features/ai-search/ai-search-assistant.test.tsx`
- `frontend/features/ai-search/ai-search-query.ts`
- `frontend/features/ai-search/ai-search-query.test.ts`
- `frontend/lib/api/ai-search.ts`
- `frontend/lib/api/client.ts`
- `frontend/types/api.ts`
- `frontend/features/listings/search-page.tsx`
- `frontend/features/listings/search-page.module.css`
- `frontend/features/listings/search-page.test.tsx`

Test bắt buộc:

- Capability disabled không hiện CTA.
- Submit hợp lệ và chống double-submit.
- 422/429/502/504/503 có thông báo riêng, giữ prompt.
- Review proposal, xóa chip, sửa field và apply.
- Merge giữ bounds/radius, reset page và giữ sort hợp lệ.
- Keyboard focus được giữ/trả đúng khi mở/đóng modal.
- Không có horizontal overflow ở bốn breakpoint.

Điều kiện hoàn thành:

- Tenant luôn nhìn thấy và chỉnh được filter trước khi search.
- Không có route chatbot mới.
- Search thường hoạt động đầy đủ khi AI lỗi hoặc bị tắt.

Commit dự kiến: `them giao dien tim phong bang ai`

### Giai đoạn 4 — Điểm phù hợp rule-based

Mục tiêu: giải thích kết quả bằng dữ liệu xác định, chưa gọi AI provider.

Quy tắc đề xuất ban đầu:

- Chỉ hiển thị khi tenant đã xác nhận ít nhất hai tiêu chí có thể so sánh.
- Giá, diện tích, sức chứa và property type được chấm theo điều kiện rõ ràng.
- Amenity dùng tỷ lệ số tiện ích yêu cầu được đáp ứng.
- `maxOccupants=null` được ghi “chưa xác định”, không tự coi là đạt.
- Text `q`/`areaName` chỉ tạo lý do khi có match xác định từ dữ liệu public; không suy đoán khoảng cách.
- Điểm chỉ hỗ trợ sắp xếp nhận thức, không thay đổi thứ tự backend trong phiên bản đầu.

File dự kiến:

- `frontend/features/ai-search/listing-match-score.ts`
- `frontend/features/ai-search/listing-match-score.test.ts`
- `frontend/features/ai-search/listing-match-summary.tsx`
- `frontend/features/ai-search/listing-match-summary.test.tsx`
- `frontend/features/listings/listing-card.tsx`
- `frontend/features/listings/listing-detail.tsx`

Test bắt buộc:

- Cùng input luôn cho cùng score/reasons.
- Không NaN, không vượt 0–100.
- Missing data không bị mô tả thành dữ liệu thật.
- Không hiện score khi tiêu chí quá ít.
- Không làm thay đổi search sort/pagination.

Điều kiện hoàn thành:

- Mỗi score có lý do rõ, có thể kiểm tra lại.
- Không có network call AI.
- Không gắn nhãn “AI xác nhận” hoặc ngụ ý bảo đảm phòng phù hợp.

Commit dự kiến: `them diem phu hop cho phong`

### Giai đoạn 5 — Cảnh báo rủi ro hỗ trợ admin

Mục tiêu: mở rộng trust panel hiện có, không thay moderation decision.

Thứ tự an toàn:

1. Tái sử dụng stale/open report/possible duplicate hiện có làm baseline.
2. Thêm heuristic deterministic cho mâu thuẫn field trước khi gọi model.
3. Chỉ sau khi đo false positive mới thêm AI text/image analysis.
4. AI reason hiển thị tách biệt với tín hiệu hệ thống và gắn nhãn “gợi ý kiểm tra”.
5. Admin action vẫn đi qua moderation endpoint/lifecycle hiện tại.

Quyết định persistence phải được chốt trước khi code:

- Nếu chỉ phân tích on-demand và không ảnh hưởng quyết định, có thể không lưu ở spike.
- Nếu tín hiệu dùng trong moderation/audit, phải có forward migration, model version, timestamp và evidence tối thiểu; không sửa lịch sử cũ.
- Không lưu raw prompt, full provider response hoặc dữ liệu reporter.

File có khả năng liên quan:

- `services/listing-service/src/modules/listings/repositories/admin-listing-read-repository.ts`
- Module AI risk riêng trong Listing Service.
- `frontend/features/listings/admin-listing-card.tsx`
- `frontend/features/listings/admin-listing-detail.tsx`
- Test trust/admin hiện có.

Điều kiện hoàn thành:

- AI không tự approve/reject/hide.
- Tín hiệu không lộ ra public DTO.
- Admin thấy nguồn và lý do của từng cảnh báo.
- False positive có cách bỏ qua mà không sửa moderation history.

Commit chỉ chốt sau data design; chưa ấn định migration trong kế hoạch này.

### Giai đoạn 6 — Quality gate và đo hiệu quả

Kiểm tra tự động tối thiểu:

```text
listing-service: npm test
listing-service: TypeScript noEmit
gateway: npm test
frontend: focused AI/search tests
frontend: npm run typecheck
frontend: npm run lint
frontend: npm run format:check
frontend: npm run build
docker compose config --quiet
```

E2E qua Gateway:

1. AI disabled → search thường hoạt động, CTA ẩn.
2. AI enabled + valid prompt → review proposal → apply → URL/search kết quả đúng.
3. Prompt injection → output vẫn nằm trong allowlist.
4. Provider timeout/5xx → không mất prompt, không hỏng search thường.
5. Anonymous quota và authenticated quota không vượt giới hạn.
6. Log không chứa prompt, email, phone, exact coordinates, API key hoặc raw provider body.

Chỉ số cần ghi nhận sau release thử nghiệm:

- Tỷ lệ mở AI panel.
- Tỷ lệ proposal được apply.
- Tỷ lệ tenant sửa filter trước khi apply.
- Thời gian provider p50/p95.
- Tỷ lệ timeout/error.
- Chi phí trung bình mỗi proposal được apply.

Không ghi raw prompt để đo analytics. Event chỉ dùng category/count/timing tối thiểu.

## 12. Ma trận quyền và dữ liệu

| Use case | Anonymous | Tenant | Landlord | Admin | Dữ liệu gửi provider |
|---|---:|---:|---:|---:|---|
| Parse nhu cầu tìm phòng | Có, rate limit | Có | Có thể dùng search công khai | Có thể dùng search công khai | Prompt đã redaction + lookup allowlist |
| Điểm phù hợp | Có | Có | Không cần trong owner flow | Không cần | Không gọi provider |
| Cảnh báo rủi ro | Không | Không | Không | Có | Public/admin-safe listing fields đã chọn lọc |

Mọi endpoint protected vẫn phải kiểm tra current account active, role và unsafe Origin theo middleware hiện tại.

## 13. Ma trận thay đổi hệ thống

| Giai đoạn | Frontend | Listing Service | Gateway | Database | Provider |
|---|---|---|---|---|---|
| Search intent fake | Có | Module mới | Test route prefix | Không | Fake trong test |
| Provider thật | Có | Config/client | Không đổi route table | Không | Có |
| Match score | Có | Không | Không | Không | Không |
| Admin risk | Có | Có | Prefix hiện có | Có thể cần forward migration | Có thể có |

## 14. Rủi ro và cách kiểm soát

- Hallucination: chỉ nhận structured output, validate allowlist và yêu cầu tenant review.
- Prompt injection: model không có tool/database; system prompt không chứa secret; output schema là boundary cuối.
- Chi phí: rate limit, max prompt, max output token, capability flag và metrics tối thiểu.
- Độ trễ: timeout bounded, không retry mặc định, UI giữ prompt và fallback filter thường.
- PII leakage: redaction trước provider, không log raw prompt/response, test log sanitization.
- Config mismatch: capability endpoint phản ánh trạng thái Listing Service thay vì frontend tự đoán.
- Vendor lock-in: provider interface nhỏ, response nội bộ độc lập SDK.
- False confidence: luôn hiển thị filter/reasons cụ thể, không dùng câu “AI đảm bảo”.
- Moderation bias: AI risk chỉ là tín hiệu; admin action và history giữ nguyên.
- Regression: AI disabled phải là trạng thái được hỗ trợ đầy đủ, không phải lỗi startup.

## 15. Definition of done cho từng nhóm AI

### Trợ lý tìm phòng

- Contract request/response/error được test qua Gateway.
- Tenant review và chỉnh filter trước khi apply.
- AI không sinh coordinates, IDs hoặc field ngoài allowlist.
- Search thường hoạt động khi AI disabled/down.
- Secret/PII không xuất hiện ở browser, response hoặc log.
- Focused tests, typecheck, lint, build và E2E pass.

### Điểm phù hợp

- Rule deterministic, reason rõ và không thay backend sort.
- Missing data không bị diễn giải sai.
- Không gọi provider và không cần database.

### Admin risk

- Không thay moderation lifecycle.
- Không public AI signals.
- Persistence/audit được chốt trước khi migration.
- Admin là người ra quyết định cuối.

## 16. Thứ tự commit đề xuất

1. `chot contract tro ly ai tim phong`
2. `them backend tro ly ai tim phong`
3. `ket noi provider cho tro ly ai`
4. `them giao dien tim phong bang ai`
5. `them diem phu hop cho phong`
6. Chỉ triển khai admin risk sau khi chốt data design.
7. `bo sung regression tinh nang ai`

Mỗi commit phải có test tương ứng và không chứa secret/provider response hoặc thay đổi không liên quan.

## 17. Quy tắc thực hiện

- Mỗi chức năng độc lập hoàn tất phải được kiểm tra, review diff và commit riêng ngay sau đó.
- Không gộp backend, UI và một chức năng AI khác vào cùng commit nếu chúng có thể kiểm tra/chốt độc lập.
- Trên Windows, mọi script Python trong quá trình test, QA hoặc tooling phải chạy bằng lệnh `py`, không dùng lệnh `python`.
- Secret, prompt thật, provider response thật và artifact tạm không được đưa vào commit.
