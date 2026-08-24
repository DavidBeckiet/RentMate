# RentMate — Kế hoạch mở rộng chức năng hậu MVP

> Trạng thái: bản thiết kế và kế hoạch chuẩn bị triển khai
>
> Phạm vi: các chức năng V2 sau khi MVP RM-001 đến RM-055 đã hoàn tất.
>
> Tài liệu này không mở lại, không thay thế và không chỉnh sửa các quyết định frozen của MVP.

> Quyết định phạm vi hiện tại: V2 giai đoạn đầu ưu tiên gọi điện, inquiry và nhắn tin. Đặt lịch xem phòng chưa nằm
> trong scope triển khai; tenant và landlord tự thống nhất lịch qua các kênh liên hệ.

## 1. Mục tiêu sản phẩm V2

RentMate V2 phát triển từ một nền tảng tìm phòng thành nền tảng kết nối và hỗ trợ quy trình thuê phòng:

```text
Tìm phòng → Lưu phòng → Gửi yêu cầu → Gọi điện / nhắn tin → Theo dõi kết quả
```

Định vị ban đầu:

> Nền tảng tìm phòng và kết nối người thuê với chủ trọ, tập trung vào phòng thuê tháng tại TP.HCM.

V2 cần ưu tiên tạo ra giao dịch và tương tác thực tế giữa tenant và landlord. Không mở rộng đồng thời sang mọi chức năng của một hệ thống quản lý bất động sản.

## 2. Nguyên tắc và giới hạn

- Giữ nguyên các contract MVP đang hoạt động, trừ khi có quyết định V2 riêng được ghi nhận.
- Không tự động tạo hoặc diễn giải thành `RM-056` hay task ID tiếp theo.
- Không thay đổi lịch sử hoàn thành RM-001 đến RM-055.
- Dữ liệu, privacy projection, authorization và listing lifecycle của MVP vẫn là nền tảng.
- Các migration hậu MVP phải là migration mới; không sửa migration MVP đã áp dụng.
- Chức năng mới phải có boundary module rõ ràng trước khi chuyển sang microservices.
- Không triển khai thanh toán, hợp đồng hoặc quản lý tài sản trước khi core loop có dữ liệu sử dụng thực tế.
- Giai đoạn đầu ưu tiên REST, transaction rõ ràng và khả năng debug; chưa bắt buộc dùng message broker.

## 3. Thứ tự ưu tiên

### P0 — Cần triển khai trước

1. Card thông tin chủ trọ và hai kênh liên hệ.
2. Inquiry và tin nhắn bất đồng bộ.
3. Trạng thái kinh doanh của listing.
4. Thông báo trong ứng dụng.

### P1 — Tăng khả năng quay lại và độ tin cậy

5. Saved searches.
6. Báo cáo tin và xử lý an toàn.
7. Xác minh landlord.
8. Review sau khi có điều kiện đủ.

### P2 — Công cụ vận hành và tối ưu

9. Landlord lead management.
10. Thống kê cơ bản.
11. So sánh listing, ghi chú và chia sẻ.
12. Quản lý nhiều phòng trong cùng một tòa nhà.

### Để sau khi có bằng chứng nhu cầu

- Đặt cọc và thanh toán.
- Hợp đồng điện tử.
- Thu tiền thuê hàng tháng.
- Quản lý điện, nước và bảo trì.
- Đồng bộ Google Calendar.
- Chat realtime.
- Multi-city.
- Mobile native app.
- AI recommendation.

## 4. Thiết kế core contact flow và các chức năng liên quan

### 4.1 Card thông tin chủ trọ và liên hệ

Trên trang chi tiết listing, desktop hiển thị card thông tin chủ trọ ở cạnh phần nội dung phòng. Trên mobile, card nằm dưới thông tin listing và có thanh hành động cố định nếu phù hợp.

Card dự kiến gồm:

- Tên người đăng hoặc chủ trọ nếu được phép hiển thị.
- Số điện thoại.
- Email.
- Badge xác minh nếu V2 verification đã được triển khai.
- Nút `Gọi điện`.
- Nút `Nhắn tin`.

Quy tắc hiển thị:

- Người chưa đăng nhập không được xem contact; chỉ thấy lời nhắc đăng nhập.
- Tenant đã đăng nhập chỉ xem contact của listing public và landlord đang active.
- Bấm `Gọi điện` dùng `tel:` để mở ứng dụng gọi điện trên thiết bị; không xây VoIP ở P0.
- Bấm `Nhắn tin` mở flow inquiry trong hệ thống.
- Trang search và listing card không hiển thị số điện thoại hoặc email.
- Không tạo contact card cho listing không public hoặc landlord inactive.

Việc gọi điện không bắt buộc phải đi qua backend. Nếu cần đo hiệu quả sau này, có thể bổ sung contact-intent event riêng, nhưng không chặn luồng gọi điện P0.

### 4.2 Inquiry — yêu cầu liên hệ

Tenant đã đăng nhập có thể gửi yêu cầu từ trang listing public đang khả dụng.

Thông tin gửi lên dự kiến:

- `listingId`.
- Nội dung lời nhắn.
- Số điện thoại liên hệ hoặc dùng số đã lưu trong profile.
- Thời gian mong muốn được liên hệ.

Quy tắc nghiệp vụ:

- Mỗi tenant chỉ có một inquiry đang mở cho một listing.
- Tenant không được gửi inquiry cho listing không public hoặc landlord inactive.
- Landlord chỉ được xem inquiry của listing thuộc mình.
- Tenant chỉ được xem inquiry do mình tạo.
- Inquiry đã đóng không nhận message mới, trừ khi có quy tắc reopen được phê duyệt.
- Tạo inquiry và notification đầu tiên phải commit nhất quán.
- Có rate limit và chống spam theo user, listing và IP.

Trạng thái dự kiến:

```text
NEW → CONTACTED → CLOSED
```

### 4.3 Tin nhắn

MVP đầu tiên dùng hội thoại bất đồng bộ, không yêu cầu WebSocket.

- Một inquiry có nhiều message.
- Chỉ tenant và landlord liên quan được đọc hoặc gửi message.
- Có trạng thái đã đọc/chưa đọc.
- Giới hạn độ dài, tần suất và nội dung nguy hiểm.
- Không log nội dung nhạy cảm ở dạng không cần thiết.
- Có thể bổ sung realtime sau khi có số liệu tải thực tế.

### 4.4 Đặt lịch xem phòng — tạm hoãn

Đặt lịch xem phòng không thuộc scope V2 giai đoạn đầu. Tenant và landlord sẽ tự thống nhất thời gian qua điện thoại
hoặc tin nhắn sau khi inquiry được tạo.

Trong giai đoạn này không tạo UI, endpoint, bảng dữ liệu hoặc notification riêng cho viewing. Chỉ xem xét lại khi có
dữ liệu chứng minh người dùng cần quản lý lịch hẹn, tránh trùng lịch hoặc theo dõi nhiều cuộc hẹn.

### 4.5 Trạng thái kinh doanh listing

Trạng thái kinh doanh phải tách khỏi trạng thái moderation MVP.

Đề xuất:

```text
AVAILABLE
PAUSED
RENTED
UNKNOWN
```

- Admin vẫn quản lý trạng thái moderation như `APPROVED`, `HIDDEN`, `REJECTED`.
- Landlord quản lý tình trạng còn phòng.
- Listing `RENTED` không xuất hiện trong kết quả tìm phòng đang còn chỗ.
- Hệ thống nhắc landlord xác nhận lại listing lâu ngày không cập nhật.
- Việc thêm field, enum hoặc bảng mới phải được chốt trong V2 database design trước khi code.

### 4.6 Thông báo trong ứng dụng

Các sự kiện P0 cần tạo notification:

- Inquiry mới.
- Message mới.
- Listing được approve, reject hoặc cần cập nhật.
- Saved search có listing mới phù hợp.

Notification cần có:

- Trạng thái chưa đọc/đã đọc.
- Link đến resource liên quan.
- Thời gian tạo.
- Loại sự kiện ổn định để frontend render.

Email và push notification là lớp delivery sau, không phải điều kiện để hoàn tất P0.

## 5. Thiết kế chức năng P1 và P2

### 5.1 Saved searches

Tenant lưu bộ lọc gồm khu vực, giá, diện tích, tiện ích, loại phòng và bán kính.

- Có tên tùy chọn.
- Có thể bật/tắt.
- Có thể sửa hoặc xóa.
- Notification chỉ gửi listing mới hoặc listing thay đổi đáng kể.
- Không gửi lặp lại cùng một listing cho cùng một saved search.

### 5.2 Report và trust & safety

Tenant có thể báo cáo tin về giá sai, vị trí sai, ảnh sai, tin đã cho thuê, lừa đảo hoặc nội dung không phù hợp.

Trạng thái report:

```text
OPEN → INVESTIGATING → RESOLVED
OPEN → DISMISSED
```

Admin cần xem resource, lý do, người báo cáo, lịch sử xử lý và hành động đã thực hiện.

### 5.3 Xác minh landlord

Triển khai theo mức tăng dần:

1. Xác minh email.
2. Xác minh số điện thoại.
3. Admin review profile và đánh dấu verified.
4. Chỉ nghiên cứu eKYC khi có yêu cầu kinh doanh hoặc pháp lý.

Không hiển thị dữ liệu xác minh nội bộ ra public ngoài badge và thông tin được phê duyệt.

### 5.4 Review

Review chỉ được mở sau khi có điều kiện thuê đã được xác nhận hoặc một điều kiện đủ khác được chốt trong V2.

- Điểm đánh giá.
- Độ chính xác listing.
- Mức độ phản hồi.
- Nhận xét.
- Report review.
- Moderation review trước khi công khai nếu cần.

### 5.5 Landlord lead management

Dashboard landlord cần ưu tiên công việc:

- Inquiry mới.
- Inquiry chưa phản hồi.
- Listing cần cập nhật trạng thái.
- Tin có nhiều lượt quan tâm.

Có thể thêm ghi chú nội bộ và thống kê lượt xem, lượt lưu, lượt inquiry, nhưng không hiển thị dữ liệu riêng tư của tenant sai mục đích.

## 6. Bounded context và hướng microservices

Trước mắt code có thể bắt đầu dưới dạng modular monolith có boundary tương ứng:

```text
auth/users          → Identity boundary
listings/search     → Listing boundary
favorites/inquiries → Engagement boundary
notifications       → Notification boundary
trust/report/review → Trust & Safety boundary
```

Khi chuyển sang microservices, target ban đầu:

```text
API Gateway
├── Identity Service
├── Listing Service
├── Engagement Service
└── Notification Service
```

Quy tắc tách:

- Mỗi service sở hữu dữ liệu của mình.
- Không dùng database chung giữa các service trong target architecture.
- Service khác chỉ dùng API hoặc event contract.
- Admin action nằm trong service sở hữu resource, không tạo Admin Service quá sớm.
- Cloudinary và Nominatim thuộc Listing Service.
- Favorites và inquiries thuộc Engagement Service ở giai đoạn đầu. Viewing được hoãn cho đến khi có bằng chứng nhu cầu.
- Auth cookie hiện tại được giữ qua gateway hoặc identity boundary để tránh buộc frontend đổi ngay.
- Chỉ dùng event cho công việc có thể bất đồng bộ; transaction nghiệp vụ chính vẫn phải rõ ràng.

Không nên tạo quá nhiều service chỉ vì mỗi bảng là một service. Service boundary phải theo ownership và vòng đời nghiệp vụ.

## 7. API dự kiến

Đây là danh sách định hướng, chưa phải API contract cuối cùng. Khi triển khai phải tạo specification riêng và kiểm tra backward compatibility.

### Inquiry và message

```text
POST   /api/v1/inquiries
GET    /api/v1/tenant/inquiries
GET    /api/v1/landlord/inquiries
GET    /api/v1/inquiries/:inquiryId
POST   /api/v1/inquiries/:inquiryId/messages
PATCH  /api/v1/inquiries/:inquiryId/status
```

### Notification và saved search

```text
GET    /api/v1/notifications
PATCH  /api/v1/notifications/:notificationId/read
POST   /api/v1/notifications/read-all
POST   /api/v1/saved-searches
GET    /api/v1/saved-searches
PATCH  /api/v1/saved-searches/:id
DELETE /api/v1/saved-searches/:id
```

Tất cả endpoint mới phải định nghĩa rõ method, role, ownership, active-account check, validation, unknown-field rejection, privacy projection, status code, idempotency và concurrency behavior.

## 8. Dữ liệu dự kiến

Các bảng hậu MVP có thể gồm:

- `listing_inquiries`
- `inquiry_messages`
- `notifications`
- `saved_searches`
- `listing_reports`
- `landlord_verifications`
- `listing_reviews`
- `review_reports`

Đây là danh sách thiết kế ban đầu, chưa được phép triển khai cho đến khi có database design V2 tương ứng.

Các nguyên tắc bắt buộc:

- Migration mới, có thứ tự và có test.
- Foreign key trong cùng ownership boundary.
- Không tạo foreign key xuyên database khi đã tách microservices.
- Không lưu password, token hoặc provider secret trong các bảng mới.
- Có index cho các truy vấn theo actor, listing, status và thời gian.
- Có unique constraint cho các invariant như một inquiry đang mở trên cùng tenant/listing.

## 9. Màn hình frontend dự kiến

### Tenant

```text
/inquiries
/inquiries/:inquiryId
/saved-searches
/notifications
```

Listing detail bổ sung CTA:

- Gửi yêu cầu liên hệ.
- Nhắn tin.
- Gọi điện.
- Lưu tìm kiếm.
- Báo cáo tin.

### Landlord

```text
/landlord/inquiries
/landlord/inquiries/:inquiryId
/landlord/analytics
```

Trang landlord phải ưu tiên “việc cần xử lý” thay vì chỉ hiển thị số liệu.

### Admin

```text
/admin/reports
/admin/verifications
/admin/reviews
```

## 10. Nguyên tắc UI/UX V2

- Giữ visual language hiện tại của RentMate, không redesign toàn bộ chỉ vì thêm chức năng.
- Search và contact là CTA chính của marketplace.
- Dùng màu có tương phản cao và không dùng màu làm tín hiệu duy nhất.
- Dùng icon SVG nhất quán; không dùng emoji làm icon chức năng.
- Tất cả nút và card tương tác phải có hover, focus và cursor state.
- Form phải có label, validation tại field, lỗi tổng hợp và retry an toàn.
- Có loading, empty, error, unauthorized, forbidden và resource-closed state.
- Responsive ở 375px, 768px, 1024px và desktop.
- Tôn trọng `prefers-reduced-motion`.
- Form inquiry trên mobile nên dùng sheet hoặc flow ngắn, không tạo cảm giác như form đăng ký dài.

## 11. Lộ trình triển khai

### Giai đoạn 0 — Chốt thiết kế V2

Kết quả cần có:

- Product goal và success metrics.
- Use case và user flow.
- State transition.
- Privacy và authorization matrix.
- Database design V2.
- API contract V2.
- Service boundary.
- Quy tắc notification và rate limit.

### Giai đoạn 1 — Nền tảng microservices — đã hoàn tất nền tảng hiện tại

- Tạo API Gateway.
- Tạo skeleton Identity, Listing và Engagement Service.
- Chuẩn hóa config, health check, error envelope và logging.
- Tạo database riêng theo service trong local development.
- Chuẩn hóa internal authentication.
- Thiết lập contract test giữa gateway và service.

### Giai đoạn 2 — Di chuyển MVP — đã hoàn tất nền tảng hiện tại

- Di chuyển Identity trước.
- Di chuyển Listing sau vì đây là boundary lớn nhất.
- Di chuyển Favorites cùng hoặc sau Engagement.
- Giữ frontend gọi gateway với path tương thích.
- Chạy regression toàn bộ contract MVP.

### Giai đoạn 3 — Inquiry vertical slice

Triển khai đầy đủ:

```text
Tenant gửi inquiry
→ Landlord nhận inquiry
→ Hai bên gửi message
→ Landlord cập nhật status
→ Tenant nhận notification
```

Đây là release V2 đầu tiên.

### Giai đoạn 4 — Saved search và trust & safety

- Saved search.
- Report.
- Verification.
- Review.
- Admin workflow.

### Giai đoạn 5 — Landlord operations

- Lead pipeline.
- Analytics.
- Reminders.
- Multi-room chỉ khi có bằng chứng nhu cầu.

Viewing và availability được giữ ngoài lộ trình triển khai hiện tại; chỉ mở lại sau khi có bằng chứng nhu cầu.

## 12. Kiểm thử và release gate

Mỗi service phải có:

- Unit test cho policy và validation.
- Integration test cho repository và transaction.
- HTTP contract test.
- Authorization và ownership matrix.
- Privacy projection test.
- Health/readiness test.
- Error, timeout và retry test khi gọi service khác.

Các E2E flow bắt buộc:

1. Tenant gửi inquiry.
2. Landlord xem inquiry.
3. Hai bên nhắn tin.
4. Landlord phản hồi inquiry hoặc message.
5. Tenant nhận notification.
6. Tenant report listing.
7. Admin xử lý report.

Không release service mới nếu chưa chứng minh:

- MVP flow vẫn hoạt động.
- Cookie và authorization không bị suy giảm.
- Không lộ contact hoặc dữ liệu nội bộ.
- Không có shared-database coupling ngoài thiết kế tạm thời đã ghi nhận.
- Có rollback hoặc backward-compatible deployment path.

## 13. Success metrics

Sau khi V2 chạy thử, theo dõi:

- Tỷ lệ listing detail → inquiry.
- Thời gian landlord phản hồi trung bình.
- Tỷ lệ inquiry được phản hồi trong 24 giờ.
- Tỷ lệ inquiry chuyển thành cuộc trao đổi có phản hồi.
- Tỷ lệ tenant quay lại nhờ notification.
- Tỷ lệ listing stale hoặc đã cho thuê nhưng chưa cập nhật.
- Tỷ lệ report hợp lệ.
- Tỷ lệ landlord hoạt động hàng tuần.

## 14. Điều kiện bắt đầu implementation

Trước khi viết service hoặc migration, phải chốt riêng:

- Inquiry có cho phép reopen hay không.
- Tenant có được hiển thị contact trực tiếp hay ưu tiên nhắn tin qua hệ thống.
- Thời gian lưu message, inquiry và notification.
- Dùng `/api/v1` additive hay tạo `/api/v2`.
- Service nào sở hữu từng entity.
- Cách xác thực request giữa gateway và service.
- Cách xử lý event thất bại hoặc service tạm thời không khả dụng.

## 15. Bước triển khai đầu tiên

Bước triển khai tiếp theo sau khi tài liệu này được phê duyệt là:

1. Chốt V2 database design cho Inquiry, Message và Notification.
2. Chốt API contract, privacy matrix, rate limit và notification ownership.
3. Triển khai Inquiry + Message dưới Engagement boundary, giữ gọi điện bằng `tel:`.
4. Thêm notification cho inquiry và message theo transaction/event contract đã chốt.
5. Chạy regression MVP và E2E tenant–landlord flow.

Không bắt đầu bằng thanh toán, chat realtime hoặc việc tách mọi module thành một service riêng.
