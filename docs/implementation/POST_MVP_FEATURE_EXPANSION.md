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
OPEN → RESOLVED
OPEN → DISMISSED
INVESTIGATING → RESOLVED | DISMISSED  (legacy reports only)
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

## 15. Trạng thái triển khai và thứ tự tiếp theo

Các phần nền tảng V2 dưới đây đã được triển khai hoặc đã có nền tảng hoạt động:

- Inquiry, message và chat realtime giữa tenant với landlord.
- Notification trong ứng dụng và saved search.
- Trạng thái kinh doanh của listing, report, review và moderation.
- Lead management, nhắc lead đến hạn và thống kê landlord cơ bản.
- Xác minh email, số điện thoại, duyệt landlord thủ công và badge xác minh.
- Migration runner, contract test và kiểm tra authorization/privacy.

Các hạng mục tiếp theo được triển khai theo thứ tự:

> Quyết định ngày 25/08/2026: triển khai các mục 1, 2, 4, 5 và 6. Mục 3 — minh bạch tổng chi phí — tạm hoãn và không phải dependency của mục 4.

> Cập nhật ngày 25/08/2026: mục 1, 2, 4 và 5 đã hoàn thành, đã kiểm tra qua Gateway và mục 3 tiếp tục tạm hoãn. Mục 6 là phần kế tiếp.

> Cập nhật triển khai ngày 25/08/2026: giai đoạn post-MVP 1, 2 và 3 đã được triển khai ở mức code/test; các giới hạn provider thật và E2E staging vẫn giữ nguyên là release blocker.

> Quyết định ngày 26/08/2026: chốt checkpoint local/demo để làm mốc ổn định và tiếp tục phát triển. Checkpoint này không đồng nghĩa với release public production; Email/SMS thật và E2E staging được tạm hoãn.

1. **Rà soát và sửa giao diện responsive**
   - Kiểm tra trang tìm kiếm, chi tiết listing, form đăng tin và dashboard landlord/admin.
   - Bắt buộc kiểm tra các mốc khoảng 375px, 768px, 1024px và desktop.
2. **Sức chứa phòng (`max_occupants`)**
   - Landlord nhập số người tối đa.
   - Hiển thị trong form, listing card và trang chi tiết.
   - Chỉ mở rộng thành bộ lọc sau khi field lõi ổn định.
3. **Minh bạch tổng chi phí**
   - Bổ sung tiền cọc, phí dịch vụ, điện, nước, giữ xe và internet nếu có.
   - Hiển thị chi phí cố định, chi phí theo mức sử dụng và khoản cần chuẩn bị ban đầu.
   - Đây là chức năng hiển thị thông tin, chưa triển khai thanh toán hoặc đặt cọc online.
4. **Tự động nhắc listing cũ**
   - Nhắc landlord xác nhận tin còn hiệu lực.
   - Đã chốt mốc mặc định 30 ngày và tự chuyển sang `PAUSED` sau thêm 7 ngày không phản hồi.
5. **Báo cáo và chặn người dùng/cuộc trò chuyện**
   - Bổ sung trust & safety cho spam, lừa đảo và hành vi không phù hợp trong contact flow.
   - Giữ riêng với report listing hiện có.
6. **Release gate**
   - Kết nối provider email/SMS thật cho xác minh.
   - Chạy E2E tenant–landlord và kiểm tra lại authorization, privacy, migration và responsive UI.

Chưa ưu tiên ở giai đoạn này: đặt lịch xem phòng, thanh toán, hợp đồng điện tử, quản lý tài sản và tách thêm service chỉ vì có thêm bảng dữ liệu.

## 16. Ghi chú bổ sung — sức chứa phòng

Đề xuất bổ sung trường `max_occupants` cho tin đăng để landlord khai báo sức chứa phòng. Trên giao diện, hiển thị ngắn gọn theo dạng **`[số người] tối đa`**.

- Dùng số nguyên dương, không dùng nội dung tự do.
- Hiển thị trong form đăng tin, thẻ tin và trang chi tiết.
- Có thể dùng làm bộ lọc tìm kiếm ở bước tiếp theo.
- Phân biệt rõ với số người đang ở hiện tại.
- Cho phép để trống trong bản nháp; yêu cầu hoàn thiện trước khi gửi duyệt nếu đây là thông tin bắt buộc của tin đăng.
- Đã triển khai phần lõi và bộ lọc tìm kiếm; migration Engagement `0014` đã được apply ở database local Docker.

## 17. Kế hoạch triển khai chi tiết cho các mục đã chọn

### 17.1 Nguyên tắc thực hiện chung

- Thực hiện lần lượt `1 → 2 → 4 → 5 → 6`; hoàn thành, kiểm tra và commit riêng từng mục trước khi chuyển mục tiếp theo.
- Mục 3 tiếp tục nằm trong backlog nhưng không thiết kế database, API hoặc UI trong đợt này.
- Giữ visual language hiện tại của RentMate: màu xanh/lime/coral, Manrope/Space Grotesk, block layout và semantic design token hiện có.
- Không thay đổi privacy projection, quyền sở hữu, cookie auth hoặc listing moderation lifecycle ngoài thay đổi V2 được mô tả rõ trong từng mục.
- Mỗi schema change dùng migration tiến mới. Listing Service tiếp tục sở hữu listing; Engagement Service tiếp tục sở hữu inquiry, message, notification và trust & safety của contact flow.
- Không gom nhiều mục vào một migration hoặc commit lớn. Mỗi mục phải có unit test, service/HTTP test, database test khi có migration và frontend test tương ứng.

### 17.2 Mục 1 — rà soát và sửa giao diện responsive

#### Mục tiêu

Hoàn thiện giao diện hiện có, không redesign toàn bộ. Các luồng chính phải dùng được rõ ràng trên mobile, tablet và desktop, không tràn ngang, không che nội dung và không nhồi quá nhiều hành động vào cùng một màn hình.

#### Phạm vi màn hình

1. **App shell và public marketplace**
   - Header, menu mobile, footer, homepage, search, near-me, listing card, bản đồ và listing detail.
2. **Auth và tenant**
   - Đăng ký, đăng nhập, profile, favorites, saved searches, compare, inquiry/chat và notifications.
3. **Landlord**
   - Danh sách/chi tiết/form đăng tin, ảnh, trạng thái kinh doanh, profile/xác minh, inquiry, lead và analytics.
4. **Admin**
   - User, listing moderation, listing report, review và landlord verification.

#### Cách triển khai

1. Chạy ứng dụng với dữ liệu seed và lập issue matrix cho từng route ở `375px`, `768px`, `1024px` và `1440px`.
2. Sửa theo từng nhóm màn hình: shell/public → tenant → landlord → admin; không sửa tất cả route trong một diff duy nhất.
3. Với action phụ như báo cáo, chặn, ghi chú hoặc tác vụ quản trị ít dùng, ưu tiên menu, disclosure, dialog hoặc mobile sheet thay vì đặt toàn bộ nút trực tiếp trên giao diện.
4. Chuẩn hóa form mobile-first: label thật, lỗi tại field, `inputMode` phù hợp, nút chạm tối thiểu khoảng `44×44px`, trạng thái pending và retry an toàn.
5. Bảng rộng trên mobile phải chuyển thành card hoặc có vùng cuộn ngang có chủ đích; sticky/fixed element không được che nội dung hay CTA.
6. Bổ sung `loading.tsx`/`error.tsx` tại route group cần thiết, giữ chỗ ảnh bằng aspect ratio và tránh layout shift khi dữ liệu tải về.
7. Giữ focus ring rõ ràng, thứ tự tab hợp lý, heading tuần tự, tương phản chữ tối thiểu 4.5:1 và tôn trọng `prefers-reduced-motion`.

#### Kiểm thử và điều kiện hoàn thành

- Component test cho navigation, disclosure/dialog, form state, empty/error/401/403/404 và layout có logic điều kiện.
- Playwright chạy desktop và mobile cho các luồng public, tenant, landlord và admin quan trọng.
- Thêm kiểm tra không có horizontal overflow ở bốn viewport; screenshot/trace được lưu khi E2E lỗi.
- `typecheck`, `lint`, frontend test và production build đều pass.
- Không thay đổi backend contract và không còn lỗi hiển thị mức nghiêm trọng trên các route đã liệt kê.

### 17.3 Mục 2 — sức chứa phòng (`max_occupants`)

#### Quyết định dữ liệu

- Listing Service thêm migration kế tiếp `0006` với cột `max_occupants smallint` nullable và check trong khoảng `1..20`.
- Giữ nullable cho listing cũ và draft để backward compatible; chưa bắt buộc khi submit trong đợt đầu.
- Chưa thêm bộ lọc tìm kiếm theo số người trong mục này. Chỉ thêm sau khi phần lớn listing có dữ liệu đủ tin cậy.

#### Backend và API

1. Bổ sung `maxOccupants` vào create/patch owner listing, owner/admin detail và các DTO public cần hiển thị.
2. Chuẩn hóa số nguyên, từ chối `0`, số âm, số thập phân, số lớn hơn `20` và unknown field.
3. Normalized no-op PATCH tiếp tục không ghi database hoặc đổi `updatedAt`.
4. Public projection chỉ trả con số sức chứa, không thêm dữ liệu người đang ở hoặc dữ liệu tenant.
5. Cập nhật service contract giữa Listing và Engagement nếu public listing summary được mở rộng.

#### Frontend

- Form landlord dùng input số có `min=1`, `max=20`, `step=1` và `inputMode="numeric"`.
- Hiển thị ngắn gọn **`[số người] tối đa`** trên listing card, detail, owner/admin workflow; ẩn hoàn toàn nếu giá trị null.
- Không để badge sức chứa cạnh tranh với badge xác minh, trạng thái kinh doanh hoặc nút favorite trên card nhỏ.

#### Kiểm thử và điều kiện hoàn thành

- Migration clean/existing plan, constraint, repository mapping, create/update/no-op và privacy test đều pass.
- Frontend test bao phủ giá trị hợp lệ, null, lỗi field và hiển thị card/detail.
- Typecheck/test/build pass; migration `0006` được chạy trên database local bằng manifest version đúng, không chạy lại migration cũ.

### 17.4 Mục 4 — tự động nhắc listing cũ

#### Quyết định nghiệp vụ đề xuất

- Chỉ áp dụng cho listing `APPROVED` có business status `AVAILABLE` hoặc `UNKNOWN`.
- Mốc mặc định cấu hình được: nhắc sau `30 ngày` chưa xác nhận; tự chuyển sang `PAUSED` sau thêm `7 ngày` không phản hồi.
- Dùng thời điểm xác nhận tình trạng phòng riêng, không dùng `updatedAt`, vì sửa tiêu đề hoặc ảnh không chứng minh phòng vẫn còn.
- Landlord phải có action xác nhận rõ ràng. Việc gửi lại `AVAILABLE` dạng no-op không được lợi dụng để thay đổi timestamp nội dung.

#### Database và API

1. Listing Service thêm migration `0007`, gồm `availability_confirmed_at`, trạng thái gửi nhắc và dấu thời gian auto-pause cần thiết cùng index truy vấn due rows.
2. Backfill listing đang public từ timestamp hiện có theo một quy tắc được ghi trong migration; không sửa migration cũ.
3. Thêm endpoint owner-scoped `POST /api/v1/landlord/listings/:listingId/confirm-availability`.
4. Owner DTO trả `availabilityConfirmedAt`, `availabilityExpiresAt` và trạng thái cần xác nhận; public DTO không lộ timestamp vận hành nội bộ.
5. Scheduler nằm trong Listing Service vì Listing sở hữu availability và business status. Batch xử lý dùng transaction, row locking và `SKIP LOCKED` để tránh hai instance xử lý cùng hàng.
6. Notification được gửi sang Engagement qua internal endpoint có token và dedupe key. Không dùng distributed transaction; việc thay đổi listing phải commit trước và delivery phải retry/idempotent.
7. Các mốc và scheduler dùng config riêng, dự kiến `LISTING_STALE_REMINDER_DAYS`, `LISTING_STALE_GRACE_DAYS`, `LISTING_STALE_SCAN_INTERVAL_MS` và `LISTING_STALE_BATCH_SIZE`.

#### Frontend

- Owner listing card/detail hiển thị “đã xác nhận”, “sắp cần xác nhận” hoặc “quá hạn”, kèm một CTA xác nhận.
- Dashboard landlord có khu vực “Tin cần cập nhật”; notification dẫn thẳng đến listing tương ứng.
- Khi hệ thống auto-pause, giải thích rõ lý do và cho phép landlord xác nhận rồi chuyển lại `AVAILABLE` nếu moderation status vẫn cho phép.

#### Kiểm thử và điều kiện hoàn thành

- Test mốc thời gian bằng clock giả, batch concurrency, no-op confirm, ownership, inactive account và trạng thái không đủ điều kiện.
- Test notification dedupe, retry khi Engagement tạm lỗi và việc `PAUSED` lập tức biến mất khỏi public search.
- Test UI các trạng thái sắp hạn/quá hạn/auto-pause và E2E landlord xác nhận lại tin.
- Scheduler có cấu hình interval/batch rõ ràng, dừng sạch khi shutdown và không log contact hoặc dữ liệu nhạy cảm.

### 17.5 Mục 5 — báo cáo và chặn trong contact flow

#### Boundary và phạm vi

- Contact report và contact block thuộc Engagement Service vì chỉ điều khiển inquiry/message; không tạo Admin Service mới.
- Block trong mục này là chặn tương tác giữa một cặp người dùng trong RentMate, không tự khóa tài khoản toàn hệ thống. Admin vẫn dùng Identity workflow hiện có nếu cần vô hiệu hóa account.
- Chỉ participant thật của inquiry mới được báo cáo hoặc chặn người còn lại. Lịch sử hội thoại vẫn đọc được; block ngăn tạo inquiry mới giữa cặp đó và ngăn message mới.

#### Database và API

1. Engagement migration kế tiếp là `0013`, tạo:
   - `contact_blocks` với cặp blocker/blocked duy nhất và inquiry nguồn.
   - `contact_reports` với message được báo cáo dạng optional, category `SPAM`, `FRAUD`, `HARASSMENT`, `INAPPROPRIATE`, `OTHER`; status `OPEN`, `INVESTIGATING`, `RESOLVED`, `DISMISSED`.
   - `contact_report_events` append-only để lưu lịch sử xử lý admin.
2. Cho phép tối đa một report đang hoạt động của cùng reporter trên cùng inquiry; create report và event đầu tiên phải atomic.
3. API participant:
   - `POST /api/v1/inquiries/:inquiryId/reports`
   - `POST /api/v1/inquiries/:inquiryId/block`
   - `DELETE /api/v1/inquiries/:inquiryId/block`
4. API admin:
   - `GET /api/v1/admin/contact-reports`
   - `GET /api/v1/admin/contact-reports/:reportId`
   - `PATCH /api/v1/admin/contact-reports/:reportId/status`
5. Gateway route mới phải trỏ các path trên vào Engagement Service và tiếp tục không expose internal route.

#### Privacy và hành vi

- Participant DTO chỉ cần `canSendMessage` và `blockedByCurrentUser`; không tiết lộ trực tiếp người kia có chặn mình hay không.
- Người bị báo cáo/chặn không nhận notification về hành động đó.
- Admin chỉ xem evidence tối thiểu cần xử lý; không trả toàn bộ hội thoại khi report chỉ gắn với một message.
- Block/unblock idempotent, report có rate limit, unknown field rejection và nội dung chi tiết được giới hạn/sanitize.
- Realtime không được dùng để vượt block; service kiểm tra lại block trong transaction trước khi lưu message và publish event.

#### Frontend và kiểm thử

- Đặt “Báo cáo” và “Chặn” trong menu phụ của trang inquiry; dùng confirm dialog hoặc mobile sheet, không chèn thêm hàng nút vào chat.
- Khi đã block, ô nhập tin nhắn chuyển sang trạng thái khóa có giải thích và action bỏ chặn an toàn.
- Admin có queue contact report riêng, filter theo status/category và xem lịch sử xử lý.
- Test participant/ownership/cross-role, block hai chiều, report dedupe, admin transition, privacy projection, concurrent writes và realtime enforcement.

### 17.6 Mục 6 — release gate

#### Cấu hình và migration

1. Kết nối provider email/SMS staging/production qua `VERIFICATION_DELIVERY_URL` và `VERIFICATION_DELIVERY_TOKEN`; local memory preview chỉ dùng development/test.
2. Lưu external migration manifest theo từng môi trường và từng service; chạy `--plan-only` trước khi apply, sao lưu database và chỉ cập nhật manifest sau khi migration cùng post-check thành công.
3. Xác minh health/readiness, shutdown scheduler, timeout và log sanitization cho Identity, Listing, Engagement và Gateway.

#### E2E bắt buộc qua Gateway

1. Đăng ký landlord → xác minh email → xác minh điện thoại → admin duyệt → badge public.
2. Landlord tạo/sửa/gửi duyệt listing có `maxOccupants` → admin approve → tenant tìm và xem detail.
3. Listing đến hạn → landlord nhận nhắc → xác nhận lại; quá grace period thì auto-pause và biến mất khỏi public search.
4. Tenant gửi inquiry → hai bên chat realtime → block/unblock → report → admin xử lý report.
5. Regression tenant favorite, saved search, review, notification và landlord lead reminder.

#### Quality gate

- Chạy typecheck, lint, format check, test từng service, frontend test, production build và Playwright desktop/mobile.
- Kiểm tra `401/403/404/409`, Origin/CORS, cookie production, internal token, role, ownership và dữ liệu public không lộ contact/tọa độ chính xác/report nội bộ.
- Kiểm tra responsive tại `375/768/1024/1440px`, keyboard-only, focus, touch target, empty/loading/error và không có horizontal overflow.
- Có deployment checklist, backward-compatible migration path và cách rollback application version mà không rollback migration phá dữ liệu.

Release gate public chỉ hoàn thành khi toàn bộ flow trên chạy qua Gateway và không còn lỗi nghiêm trọng về dữ liệu, authorization, privacy hoặc giao diện.

#### Trạng thái checkpoint local/demo ngày 26/08/2026

- [x] Đã chốt checkpoint local/demo; Email/SMS thật không nằm trong điều kiện hoàn thành checkpoint này và chưa xem đây là bản public production.
- [x] External migration manifest đã được kiểm tra bằng `--plan-only`: Identity ở version `4`, Listing ở version `7`, Engagement ở version `13`; không có migration chưa áp dụng trên database local.
- [x] PostgreSQL, Identity, Listing, Engagement, backend compatibility và Gateway đều báo healthy trong Docker.
- [x] Google OAuth đăng nhập/đăng ký local đã được kiểm tra thành công sau khi sửa callback authorization code và metadata phản hồi.
- [x] Verification-delivery adapter đã có contract test `14/14`, readiness và Docker Compose hợp lệ; provider thật vẫn được tạm hoãn.
- [x] Smoke E2E contact flow đã chạy qua Gateway: public privacy, role/ownership, chat realtime, block/unblock, contact report và admin xử lý report.
- [x] Identity test `22/22`, Listing test `30/30`, Engagement test `45/45`, Gateway test `5/5` và frontend test `575/575` đã pass.
- [x] Typecheck, lint và production build đã pass; production build dùng một HTTPS API origin hợp lệ truyền qua environment.
- [x] Playwright Chromium đã kiểm tra Listing Detail tại `375`, `768`, `1024` và `1440px`; không có horizontal overflow và AppShell hiển thị cùng phần đầu listing.
- [x] Các file frontend được thêm/sửa trong mục 5 đã được format riêng và kiểm tra lại.
- [x] Full frontend `format:check` đã pass sau khi format 17 source file và loại 2 artifact Playwright khỏi phạm vi kiểm tra.
- [ ] Chưa kết nối provider email/SMS thật; local vẫn dùng memory preview dành cho development/test (hạng mục tạm hoãn, không chặn checkpoint local/demo).
- [ ] Chưa chạy trọn bộ E2E release trên môi trường staging có provider thật và cookie production.

#### Checklist thực hiện phần còn lại

##### Bước 1 — dọn format frontend có kiểm soát

- [x] Bổ sung `playwright-report/` và `test-results/` vào ignore vì hai thư mục này chỉ là artifact QA, không phải source cần kiểm tra format.
- [x] Chia 17 source file còn lại thành các nhóm nhỏ: shared shell/map, listing card/detail, owner workflow và search workflow.
- [x] Chạy Prettier theo từng nhóm, chỉ chấp nhận thay đổi formatting; không trộn sửa giao diện hoặc business logic.
- [x] Sau mỗi nhóm chạy `format:check`, frontend typecheck, lint và focused tests liên quan.
- [ ] Commit riêng phần dọn format sau khi diff không có thay đổi hành vi.

##### Bước 2 — kết nối provider email/SMS staging

- [ ] Chọn dịch vụ gửi email, dịch vụ gửi SMS và cấu hình sender/domain/phone number cho staging.
- [x] Lớp delivery của RentMate đã gửi đúng payload `{ channel, destination, secret }`, xác thực bằng header `x-rentmate-verification-token`, có timeout và trả lỗi an toàn; không retry để tránh gửi trùng OTP/email.
- [x] Chuẩn bị webhook adapter bên ngoài nhận payload `{ channel, destination, secret }`, xác thực header `x-rentmate-verification-token` và điều phối sang provider tương ứng.
- [x] Webhook chỉ trả kết quả thành công/thất bại tối thiểu; không log token, OTP, email, số điện thoại hoặc raw provider response không cần thiết.
- [x] Chốt timeout, retry/idempotency và cách xử lý provider tạm lỗi để không gửi trùng mã ngoài ý muốn.
- [ ] Lưu `VERIFICATION_DELIVERY_URL` và `VERIFICATION_DELIVERY_TOKEN` trong secret store của staging; không ghi secret thật vào `.env.example`, Git hoặc log.
- [ ] Kiểm tra production config từ chối URL HTTP, placeholder, token rỗng và memory preview.
- [ ] Gửi thử một email link và một SMS OTP qua staging, sau đó xác nhận mã qua Gateway và kiểm tra timestamp verified.

Phần này cần chủ dự án cung cấp hoặc tạo tài khoản provider, sender được phép gửi và secret staging. RentMate đã có contract webhook và flow xác minh; không cần đổi API công khai nếu provider tuân thủ contract trên.

##### Bước 3 — hoàn tất E2E nghiệp vụ qua Gateway

- [ ] Landlord mới: đăng ký → email verified → phone verified → gửi hồ sơ → admin duyệt → badge verified xuất hiện trên listing public.
- [ ] Listing: tạo draft có `maxOccupants` → sửa → gửi duyệt → admin approve → tenant tìm kiếm và xem detail mà không lộ dữ liệu riêng tư.
- [ ] Availability: đưa clock test đến mốc nhắc → nhận notification → xác nhận lại; kiểm tra quá grace period thì auto-pause và biến mất khỏi public search.
- [ ] Contact: tenant tạo inquiry → hai phía nhận realtime message → block hai chiều → unblock → report → admin điều tra và kết luận.
- [ ] Regression: favorite, saved search, review, notification, landlord lead note/reminder và analytics cơ bản.
- [ ] Authorization matrix: anonymous/tenant/landlord/admin cho các trường hợp `401`, `403`, owner-scoped `404`, stale transition `409` và unsafe Origin `403`.
- [ ] Privacy: public payload không có exact address/coordinates, contact, moderation hoặc report nội bộ; admin contact report chỉ có evidence tối thiểu.

##### Bước 4 — migration và deployment dry-run

- [ ] Tạo manifest riêng cho staging của Identity, Listing và Engagement; manifest không chứa credential hoặc database URL.
- [ ] Sao lưu database staging trước khi apply và ghi nhận thời điểm/phiên bản application tương ứng.
- [ ] Chạy `--plan-only`, đối chiếu chính xác migration được chọn, sau đó mới apply theo từng service.
- [ ] Chạy post-check schema, health/readiness và smoke read/write tối thiểu trước khi cập nhật `appliedVersion` trong manifest.
- [ ] Kiểm tra scheduler dừng sạch khi service shutdown, Gateway timeout đúng contract và log không chứa secret/contact/message body ngoài nhu cầu vận hành.
- [ ] Chuẩn bị rollback application image/config; không rollback migration phá dữ liệu. Nếu cần sửa schema, dùng forward migration mới.

##### Bước 5 — quality gate và quyết định release

- [ ] Typecheck, lint, full format check, toàn bộ test service, frontend test và production build đều pass trên commit release candidate.
- [ ] Playwright desktop/mobile pass tại `375/768/1024/1440px`, bao gồm keyboard, focus, touch target, loading/empty/error và horizontal overflow.
- [ ] Provider email/SMS staging pass, migration manifest đã cập nhật sau post-check và toàn bộ container/service healthy.
- [ ] Không còn lỗi severity cao về authorization, privacy, dữ liệu, migration hoặc giao diện.
- [ ] Gắn release candidate vào đúng commit SHA và lưu checklist/bằng chứng chạy test ngoài source tree.

#### Quy tắc đối với dữ liệu smoke local

- Message/report được tạo khi smoke chỉ là dữ liệu trong PostgreSQL Docker local, không phải production data và không chặn release.
- Không tự động reset toàn bộ seed chỉ để xóa một report. Nếu cần dọn, phải xác minh đúng database local và chọn xóa chính xác dữ liệu smoke hoặc chạy lại seed sau khi được người dùng đồng ý.
- Smoke script, cookie jar, manifest tạm và screenshot phải nằm ngoài repository; không commit các artifact này.

#### Thứ tự đề xuất

Thực hiện `Bước 1 → Bước 2 → Bước 3 → Bước 4 → Bước 5`. Với checkpoint local/demo, dừng ở phần kiểm tra local và ghi nhận provider thật/staging là hạng mục tạm hoãn. Không đánh dấu release gate public hoàn thành khi chưa có provider staging thật và full quality gate chưa pass.

## 18. Cập nhật triển khai — giai đoạn 1, 2 và 3

### Giai đoạn 1 — Discovery, tương tác tìm phòng và so sánh

- Đã thêm bộ lọc `minOccupants` cho tìm kiếm public và saved search, giới hạn 1–20 người.
- Đã thêm API và khu vực **Phòng tương tự trong khu vực**, tối đa 3 tin public hợp lệ.
- Đã lưu lựa chọn so sánh trong `sessionStorage`, giữ giới hạn tối đa 4 tin và tránh mismatch SSR.
- Đã bổ sung loading, empty, retry và test contract/frontend cho các luồng trên.

### Giai đoạn 2 — Trust & safety và analytics

- Đã thêm report review cho tenant/landlord, chống report trùng, queue admin, status transition và event history append-only.
- Đã thêm event analytics `VIEW`, `FAVORITE`, `CALL_CLICK`, `EMAIL_CLICK`; dashboard landlord hiển thị các chỉ số tương ứng.
- Đã thêm migration Engagement `0015` và `0016`, test service/repository/validation/frontend.

### Giai đoạn 3 — Account và notifications

- Đã thêm đặt lại mật khẩu bằng token một lần: token chỉ lưu dạng HMAC hash, có hạn dùng, consume một lần, rate limit và không trả token trong API response.
- Đã thêm form `/forgot-password`, `/reset-password` và API Gateway route tương thích.
- Đã thêm `GET /api/v1/notifications/unread-count` và badge số thông báo chưa đọc trong AppShell.
- Đã mở rộng webhook delivery cho email reset mật khẩu, dùng cùng contract bảo vệ bởi `VERIFICATION_DELIVERY_TOKEN`; local development chỉ có memory preview.
- Identity migration `0005` đã được apply ở `rentmate_identity` local Docker.

### Phần chưa đóng

- Provider email/SMS thật và credential staging chưa có, nên chưa thể xác nhận gửi Gmail/SMS thật.
- Push notification chưa triển khai; chat realtime vẫn ưu tiên nhận trực tiếp trong app theo quyết định sản phẩm.
- Release gate public chưa hoàn tất vì chưa có provider staging, full E2E qua Gateway và quality gate cuối; checkpoint local/demo đã được chốt riêng để tiếp tục phát triển.

## 19. Định hướng tính năng sau checkpoint local/demo

Sau khi chốt checkpoint local/demo, các tính năng tiếp theo nên tập trung vào việc giúp người thuê tìm phòng nhanh hơn và giúp landlord quản lý tin đăng rõ ràng hơn. Không mở rộng sang thanh toán hoặc quản lý vận hành khi các luồng sàn tìm phòng hiện tại chưa có nhu cầu thực tế chứng minh.

### 19.1 Thứ tự ưu tiên đề xuất

1. **Sắp xếp kết quả tìm kiếm**
   - Bổ sung hoặc hoàn thiện các lựa chọn: giá thấp đến cao, giá cao đến thấp, tin mới nhất và gần vị trí nhất.
   - Giữ nguyên bộ lọc, privacy projection, giới hạn kết quả và pagination hiện có.
   - Có test cho thứ tự ổn định, tie-breaker và trạng thái không có kết quả.

2. **Phòng đã xem gần đây**
   - Lưu khoảng 10–20 listing gần nhất ở trình duyệt bằng `localStorage` hoặc cơ chế tương đương.
   - Không lưu dữ liệu riêng tư, không cần thêm bảng hoặc API ở giai đoạn đầu.
   - Có trạng thái rỗng, xóa lịch sử và xử lý listing không còn public.

3. **Nâng cấp quản lý tin đăng cho landlord**
   - Bổ sung nhân bản tin đăng để tạo tin mới nhanh hơn.
   - Bổ sung lưu trữ tin cũ và bộ lọc theo trạng thái trong dashboard.
   - Giữ nguyên ownership, moderation lifecycle và business status hiện có.

4. **Hoàn thiện lớp độ tin cậy**
   - Hiển thị thời điểm cập nhật hoặc xác nhận còn phòng một cách dễ hiểu.
   - Cảnh báo tin quá cũ, tin bị báo cáo nhiều hoặc có dấu hiệu trùng lặp để admin xử lý.
   - Không công khai dữ liệu moderation hoặc thông tin cá nhân của người báo cáo.

5. **Trung tâm trợ giúp cơ bản**
   - Thêm FAQ và hướng dẫn thuê phòng an toàn.
   - Cho phép người dùng gửi yêu cầu hỗ trợ cho admin.
   - Có thể triển khai sau khi các tính năng tìm kiếm và quản lý tin đăng ổn định.

### 19.2 Các tính năng tiếp tục để backlog dài hạn

- Email/SMS/push thật cho notification và verification.
- Đặt lịch xem phòng.
- Minh bạch tổng chi phí; task này tiếp tục tạm hoãn theo quyết định sản phẩm.
- Thanh toán, đặt cọc, hợp đồng điện tử và thu tiền thuê/điện nước.
- Quản lý nhiều phòng trong một tòa nhà hoặc nhiều thành phố.
- Đồng bộ Google Calendar, mobile app và gợi ý phòng bằng AI.

### 19.3 Quy tắc triển khai tiếp theo

- Thực hiện từng tính năng một, kiểm tra và commit riêng.
- Khi một chức năng độc lập hoàn tất và các kiểm tra liên quan đã pass, commit ngay chức năng đó; không gom nhiều chức năng đã hoàn tất vào một commit lớn.
- Trên Windows, nếu cần chạy script Python thì dùng lệnh `py`; không dùng lệnh `python`.
- Ưu tiên tính năng không cần thay đổi database hoặc public API nếu giá trị sử dụng tương đương.
- Không đánh dấu release public hoàn tất chỉ vì đã hoàn thành các tính năng local/demo.

### 19.4 Trạng thái triển khai checkpoint local/demo

- [x] Sắp xếp kết quả tìm kiếm — đã kiểm tra tie-breaker và test thứ tự ổn định; commit `9331c59`.
- [x] Phòng đã xem gần đây — lưu localStorage, trạng thái rỗng, xóa lịch sử và tự loại tin không còn public; commit `01c6889` và `9b39a7d`.
- [x] Quản lý tin đăng landlord — lọc theo trạng thái, nhóm tin cũ và nhân bản tin; commit `c2baa9d`.
- [x] Lớp độ tin cậy — nhãn freshness cho người dùng và cảnh báo aggregate cho admin; commit `c40b3d6`.
- [x] Trung tâm trợ giúp — FAQ, checklist an toàn, form gửi yêu cầu và hàng đợi admin; commit `a881a14`, `8f4d2ba` và `6ef2e3e`.
- [x] Migration Engagement `0017_support_requests.sql` đã được chạy trên database local sau khi `--plan-only` xác nhận chỉ chọn migration `0017`. Manifest external local đã được cập nhật lên version `17`; staging/production vẫn cần operator thực hiện riêng.
- [ ] Email/SMS/push thật, E2E staging qua Gateway và quality gate public vẫn là phần chưa đóng.

## 20. Tài liệu kế hoạch bổ sung

- [Kế hoạch tính năng bản đồ hậu MVP](POST_MVP_MAP_FEATURES.md)
- [Kế hoạch tính năng AI hậu MVP](POST_MVP_AI_FEATURES.md)
