# Kế Hoạch & Đặc Tả Nâng Cấp Toàn Diện UI/UX Cho Người Thuê (Tenant Experience Overhaul)

> **Tài liệu chiến lược & thiết kế trải nghiệm người dùng (UX/UI Specification)**  
> **Thư mục lưu trữ:** `docs/implementation/TENANT_UIUX_OVERHAUL_SPECIFICATION.md`  
> **Phạm vi áp dụng:** Toàn bộ luồng trải nghiệm của người thuê nhà (`Role: TENANT`) trên nền tảng RentMate  
> **Tham chiếu chuẩn:** Benchmark theo các nền tảng hàng đầu thế giới (Airbnb, Zillow, Roomi, Shopee, Messenger) & Design System trích xuất từ skill `ui-ux-pro-max`

---

## 1. Bối Cảnh & Mục Tiêu

### 1.1 Hiện trạng
RentMate đã hoàn thành xuất sắc toàn bộ kiến trúc nền tảng và nghiệp vụ cốt lõi (RM-001 đến RM-055, Roommate V1/V2/V3). Tuy nhiên, về mặt **giao diện thị giác (UI)** và **tương tác người dùng (UX)**, hệ thống hiện tại còn mang nhiều điểm hạn chế:
- Phong cách thiết kế bị phẳng lì (`box-shadow: none`, `transform: none`), thiếu chiều sâu, màu sắc nhợt nhạt (`#f4f6f5`), gây cảm giác như một cổng thông tin hành chính cũ kỹ.
- Trải nghiệm giữa các luồng bị phân mảnh, thiếu nhất quán (điển hình: khung chat với chủ trọ rất mượt mà trong khi khung chat ở ghép lại là ô textarea 5 dòng thô cứng).
- Luồng thông báo và điều hướng di động chưa theo kịp tiêu chuẩn tương tác của các web hiện đại.

### 1.2 Mục tiêu nâng cấp
- **Tối ưu hóa hành trình người thuê (Tenant Journey)**: Giảm thiểu tối đa ma sát thao tác, loại bỏ các "ngõ cụt" (dead-ends), tăng tỷ lệ liên hệ phòng và kết nối ở ghép thành công.
- **Hiện đại hóa thị giác (Visual Elevation)**: Áp dụng các nguyên lý thiết kế tiên tiến từ `ui-ux-pro-max` (Bento Grid, Soft UI Depth, Glassmorphism nhẹ nhàng, Micro-interactions mượt mà).
- **Đạt chuẩn trải nghiệm của các siêu ứng dụng (Super-app Grade UX)**: Đưa các tính năng như Notification Popover, Smart Realtime, Mobile Bottom Bar, Contextual Chat vào hệ thống.
- **Bảo toàn 100% nghiệp vụ**: Tuyệt đối không làm thay đổi các API contract, quy tắc bảo mật, quyền hạn tài khoản, và đảm bảo toàn bộ bộ test kiểm thử tự động luôn đạt 100% pass.

---

## 2. Kiểm Tra & Đánh Giá Chi Tiết Các Điểm Nghẽn UI/UX Hiện Tại

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    BẢN ĐỒ CÁC ĐIỂM NGHẼN CẦN GIẢI QUYẾT                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1. CỤM Ở GHÉP:                                                               │
│    - Chat textarea 5 dòng thô ráp, không Enter-to-send                      │
│    - Chi tiết yêu cầu: Thói quen in hoa xám xịt, thiếu chỉ số hòa hợp        │
│    - Nút "Chặn" to đỏ đập vào mắt gây tâm lý bất an, sợ hãi                  │
│                                                                              │
│ 2. THÔNG BÁO (NOTIFICATIONS):                                                │
│    - Quả chuông là link chuyển trang, không tắt/đóng được khi đang ở trang đó│
│    - Không có realtime (phải F5 mới nhảy số đếm đỏ)                          │
│                                                                              │
│ 3. SO SÁNH PHÒNG (/compare):                                                 │
│    - Dead-end: Chọn 1 phòng thì báo "Chưa đủ dữ liệu", không gợi ý phòng mới │
│    - Bảng cuộn ngang trên mobile bị trôi mất tiêu đề cột                     │
│                                                                              │
│ 4. TÌM KIẾM & BẢN ĐỒ:                                                        │
│    - Thiếu nút chuyển nhanh [Bản đồ / Danh sách] dạng Floating Pill          │
│    - Bộ lọc dàn trải, thiếu các Quick Filter Chips phổ thông                 │
│                                                                              │
│ 5. CHI TIẾT TIN ĐĂNG (/listings/[id]):                                       │
│    - Thiếu thanh chốt đơn dính đáy màn hình (Sticky Mobile Contact Bar)      │
│    - Chưa có chip câu hỏi gợi ý nhanh (Quick question chips)                 │
│    - Ảnh chỉ xem thumbnail nhỏ, chưa có Lightbox phóng to toàn màn hình      │
│                                                                              │
│ 6. ĐIỀU HƯỚNG MOBILE TỔNG THỂ:                                               │
│    - Bắt người dùng với tay lên menu hamburger góc phải trên cùng            │
│    - Thiếu Bottom Navigation Bar 5 tab chuẩn ngón cái                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Cụm tính năng Ở Ghép (Roommate & Coliving) — Rào cản lớn nhất
1. **Khung chat ở ghép (`/roommates/conversations/[id]`)**:
   - Sử dụng một thẻ `textarea` cố định tới **5 dòng** (`rows={5}`) cùng nút gửi hình chữ nhật thô kệch. Người dùng có cảm giác như đang viết đơn hành chính hơn là nhắn tin.
   - Không hỗ trợ nhấn phím Enter để gửi nhanh.
   - Bong bóng tin nhắn hình chữ nhật thô, hiển thị text màu `text-heroDark-950` khô khan.
   - Bị một thanh cảnh báo an toàn màu vàng to dán cứng ở đỉnh (`top-20 z-20`) chiếm mất 30% diện tích màn hình.
2. **Trang Chi tiết Yêu cầu (`/roommates/requests/[id]`)**:
   - Thói quen của ứng viên bị nhét vào các ô chữ nhật màu xám in hoa (`LỊCH SINH HOẠT THÔNG THƯỜNG`, `CÂN BẰNG`, `ƯU TIÊN YÊN TĨNH`) trông như hồ sơ bệnh án.
   - Bảng 8 tiêu chí tương thích nhìn như danh sách báo lỗi hệ thống, các icon (`wifi`, `ruler`, `shield`) không ăn nhập với chủ đề lối sống bạn cùng phòng.
   - Thiếu thước đo / chỉ số phần trăm trực quan (ví dụ: *"85% Hợp gu"* hoặc *"Hòa hợp 6/8 tiêu chí"*).
3. **Nút "Chặn" khổng lồ màu đỏ đập vào mắt**:
   - Nằm ngay dưới khung "Gửi lời quan tâm", nút Chặn đỏ chót vô tình reo rắc tâm lý phòng thủ, tiêu cực thay vì khuyến khích một tinh thần kết nối cởi mở, văn minh.
4. **Khung "Gửi lời quan tâm" (Interest Composer)**:
   - Ô nhập thô ráp, thiếu các câu chào mở lời mẫu (Icebreaker prompts) khiến người dùng bối rối không biết nên nhắn gì khi bắt đầu.
5. **Trang Khám phá (`/roommates`) & Hồ sơ (`/roommates/profile`)**:
   - Thẻ card bị disable hover (`transform: none`), mất cảm giác xúc giác (tactile feedback).
   - Các câu hỏi phong cách sống (nhịp sinh hoạt, thú cưng, hút thuốc...) chỉ là radio nút tròn với text xám, không có biểu tượng minh họa sinh động.

### 2.2 Hệ thống Thông báo (Notifications)
1. **Ấn vào icon quả chuông không tắt được trang thông báo**:
   - Hiện tại icon quả chuông là một thẻ `<Link href="/notifications">`. Khi người dùng click, trình duyệt chuyển hẳn sang URL `/notifications`.
   - Khi đang ở trang `/notifications`, người dùng bấm lại vào quả chuông thì không có phản ứng nào xảy ra (vì trang đó đang active), gây cảm giác bị "kẹt", không có cơ chế toggle mở/đóng.
2. **Không có cập nhật Realtime**:
   - Số đếm thông báo màu đỏ chỉ được tải 1 lần lúc vào trang. Nếu có tin nhắn mới hoặc có người gửi lời quan tâm ở ghép, người thuê hoàn toàn không biết nếu không tự bấm F5 tải lại trang.
3. **Danh sách thông báo đơn điệu**:
   - Xếp lớp theo một cột dài, thiếu bộ lọc tab ("Tất cả", "Chưa đọc", "Tin nhắn", "Ở ghép").

### 2.3 Tính năng So Sánh Phòng (`/compare`)
1. **Lỗi ngõ cụt (Dead-end UX)**:
   - Khi người thuê bấm chọn 1 phòng vào so sánh rồi mở trang `/compare`, họ nhận ngay thông báo cộc lốc: *"CHƯA ĐỦ DỮ LIỆU - Chưa có đủ 2 tin còn khả dụng để so sánh"*. Hệ thống báo thiếu nhưng không cung cấp giải pháp.
2. **Bảng so sánh trên điện thoại/tablet**:
   - Khi cuộn ngang để xem các phòng, cột đầu tiên chứa tiêu đề (Giá, Diện tích, Tiện ích, Nội quy...) bị trôi mất, khiến người dùng không biết dòng đó đang so sánh thông số gì.

### 2.4 Tìm kiếm & Bản đồ (`/search` & `/near-me`)
1. **Thiếu nút chuyển đổi nhanh (Floating Map Toggle) trên Mobile**:
   - Trên điện thoại, danh sách phòng và bản đồ bị xếp dọc. Người dùng phải cuộn một quãng rất dài mới thấy bản đồ, hoặc bị chia màn hình chật chội.
2. **Bộ lọc dàn trải, thiếu phân cấp**:
   - Tất cả tiêu chí (Giá, Diện tích, Số người, Loại phòng, Tiện ích, Bán kính) cùng hiển thị đồng loạt, gây quá tải nhận thức (cognitive overload).

### 2.5 Tin đã lưu & Bộ lọc đã lưu (`/favorites` & `/saved-searches`)
1. **Màu sắc nhạt nhòa, thiếu cảm xúc**:
   - Dùng chung khung `tenant-workspace.module.css` với nền gradient phẳng màu xám bạc, thiếu sự hấp dẫn của một "Bộ sưu tập tổ ấm yêu thích".
2. **Trang Bộ lọc đã lưu hiển thị như mã kỹ thuật**:
   - Các tiêu chí lọc đang hiển thị dạng chuỗi thô: `MinRent: 3000000, MaxRent: 5000000` thay vì các tag gọn gàng: `3 - 5 triệu · Quận 3 · Đầy đủ nội thất`. Nút "Tìm kiếm ngay" và nút "Xóa" nằm sát nhau, dễ bấm nhầm.

### 2.6 Trang Chi tiết Phòng (`/listings/[id]`)
1. **Thiếu thanh chốt đơn dính đáy màn hình (Sticky Mobile Contact Bar)**:
   - Khi người thuê cuộn xuống xem ảnh, tiện ích, vị trí thì form liên hệ bị trôi mất. Muốn nhắn tin họ phải cuộn ngược lên trên đỉnh.
2. **Thiếu chip câu hỏi gợi ý nhanh (Quick question chips)**:
   - Người đi thuê thường ngại gõ chữ lần đầu. Thiếu các nút bấm nhanh như: *"Phòng này còn trống không ạ?"*, *"Chi phí dịch vụ/điện nước thế nào?"*.
3. **Xem ảnh chưa có chế độ phóng to toàn màn hình (Lightbox)**:
   - Chỉ xem được ảnh qua thumbnail nhỏ, không thể chạm vào để xem ảnh lớn chi tiết từng góc phòng.

---

## 3. Bảng So Sánh Benchmark Với Các Nền Tảng Hàng Đầu Thế Giới

| Tính năng / Vị trí | RentMate Hiện Tại | Chuẩn Quốc Tế (Airbnb, Zillow, Roomi, Shopee) | Lợi ích Mang Lại Khi Nâng Cấp |
| :--- | :--- | :--- | :--- |
| **Khung Chat Ở Ghép** | Textarea 5 dòng cố định, nút gửi to thô, không Enter-to-send | Messenger-style: Input 1 dòng tự co giãn, nút gửi tròn máy bay, Enter gửi ngay | Tăng tốc độ phản hồi tin nhắn gấp 3 lần, tạo cảm giác trò chuyện tự nhiên |
| **Quả Chuông Thông Báo** | Link chuyển toàn trang, không tắt được, không realtime | **Dropdown Popover**: Bấm mở menu mini, bấm lại tự đóng, Smart Polling nhảy số realtime | Người dùng không bị chuyển trang gián đoạn, nhận biết tin mới tức thì |
| **Hồ Sơ Bạn Cùng Phòng** | Form xám in hoa, ma trận tương thích thô, nút Chặn to đùng | **Persona Vibe Badges**: Icon Mặt trăng/Mặt trời, vòng Match Score %, Menu an toàn kín đáo | Tạo cảm xúc hòa hợp lối sống, thiện cảm và an tâm kết nối |
| **Điều Hướng Di Động** | Menu hamburger góc trên bên phải, drawer che toàn màn hình | **Mobile Bottom Navigation Bar**: 5 tab cố định sát đáy vừa tầm với ngón cái | Giảm 70% thao tác thừa khi chuyển đổi giữa Tìm phòng, Yêu thích, Tin nhắn |
| **Thanh Liên Hệ Phòng** | Nằm cố định trên trang, cuộn xuống là bị trôi mất | **Sticky Bottom Contact Bar**: Ghim đáy màn hình hiển thị Giá + Nút Nhắn tin / Gọi | Luôn sẵn sàng kêu gọi hành động (CTA), tăng 40% tỷ lệ liên hệ phòng |
| **Bản Đồ Trên Mobile** | Xếp chồng danh sách hoặc chia nửa màn hình chật hẹp | **Floating Pill Toggle**: Nút nổi [🗺️ Bản đồ] / [📋 Danh sách] giữa đáy màn hình | Chuyển đổi trạng thái tức thì chỉ với 1 chạm, tận dụng 100% diện tích xem |
| **Trang So Sánh Phòng** | Báo thiếu dữ liệu khi chọn 1 phòng (ngõ cụt UX) | Gợi ý ngay các phòng tương đồng cùng khu vực để bấm thêm vào so sánh | Loại bỏ ngõ cụt, giữ chân người dùng trong luồng khám phá |

---

## 4. Đặc Tả Kiến Trúc Kỹ Thuật & Giải Pháp Thiết Kế

### 4.1 Đồng bộ hóa Khung Chat Ở Ghép theo Chuẩn `InquiryConversationCore`
- **Tập tin tác động:** `frontend/features/roommate/roommate-conversation-page.tsx`, `frontend/app/globals.css`.
- **Giải pháp thiết kế:**
  - Áp dụng cấu trúc của `InquiryConversationCore`:
    - Thanh nhập tin nhắn tự co giãn (Auto-resizing `min-h-12` đến `max-h-24` tương đương 48px - 96px).
    - Nút gửi dạng tròn (`IconButton variant="primary"`) mang icon máy bay giấy `<Icon name="send" />`.
    - Lắng nghe sự kiện bàn phím: `onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}`.
  - Danh sách tin nhắn thông minh:
    - Cơ chế tự động cuộn xuống dưới cùng (`scrollToLatest`).
    - Nút nổi *"Tin nhắn mới ↓"* khi người dùng đang cuộn lên xem lịch sử cũ.
    - Bong bóng chat: Tin nhắn của bạn bo góc cong mềm với màu xanh mint dịu mát (`bg-primary-subtle`), tin nhắn đối phương nền trắng kem sang trọng (`bg-surface`).
  - Thanh an toàn thu gọn: Thay thế khối cảnh báo vàng to đùng bằng thanh pill bảo vệ tinh tế có thể bấm xem chi tiết khi cần.

### 4.2 Nâng cấp Hệ thống Thông Báo: `NotificationPopover` & Realtime Polling
- **Tập tin tác động:** `frontend/components/ui/app-shell.tsx`, `frontend/features/contact/notification-unread-store.ts`.
- **Giải pháp thiết kế:**
  - **Component `NotificationPopover`**:
    - Thay thế thẻ `<Link href="/notifications">` trên Desktop Header bằng một Popover Dropdown.
    - Bấm lần 1: Mở menu mini nổi bên dưới quả chuông (chứa 5 thông báo mới nhất, nút Đánh dấu đã đọc, link Xem tất cả).
    - Bấm lần 2 hoặc click ra ngoài hoặc nhấn phím `Escape`: Tự động đóng menu với animation mượt mà (`fade-in-up`).
  - **Smart Realtime Polling**:
    - Trong `notification-unread-store.ts`, kích hoạt interval định kỳ 15–20 giây quét số đếm unread.
    - Lắng nghe `visibilitychange` và `window.focus`: khi người dùng quay lại tab RentMate, lập tức fetch unread count để badge đỏ nhảy số realtime mà không cần F5.

### 4.3 Lột xác Trang Chi tiết Kết nối Người Phù hợp (`roommate-request-detail`)
- **Tập tin tác động:** `frontend/features/roommate/roommate-request-detail-page.tsx`, `roommate-request-detail.module.css`, `roommate-v2.tsx`.
- **Giải pháp thiết kế:**
  - **Candidate Persona Showcase**:
    - Avatar vòng sáng hào quang (glow ring), tên lớn, huy hiệu xác minh xanh ngọc.
    - Thẻ lối sống Bento có icon minh họa: Mặt trăng/Mặt trời cho giờ ngủ, Ngôi sao cho sự gọn gàng, Tai nghe cho không gian yên tĩnh, Biểu tượng thú cưng, v.v.
  - **Bảng điểm Hòa hợp (Match Scorecard)**:
    - Chỉ số tổng quan nổi bật: *"Có 6/8 điểm hòa hợp lối sống"* kèm thanh đo tiến trình màu xanh mint.
    - Phân loại trực quan: Phù hợp (Xanh), Cần trao đổi (Vàng amber), Khác biệt đáng chú ý (Coral).
  - **Sticky Action Card "Gửi lời quan tâm"**:
    - Tiêu đề thân thiện: *"Bắt đầu kết nối với [Tên]"*.
    - Tích hợp sẵn 3 câu chào gợi ý (Icebreaker chips) để người dùng chạm là tự điền.
    - Nút gửi phong cách RentMate Emerald Gradient nổi bật.
  - **Menu an toàn kín đáo (`RoommateSafetyMenu`)**:
    - Rút gọn nút "Chặn" to màu đỏ thành menu tùy chọn phụ (icon khiên nhỏ gọn gàng), giữ nguyên toàn bộ chức năng chặn và báo cáo nhưng không làm hỏng tâm lý kết nối tích cực.

### 4.4 Bổ sung Mobile Bottom Navigation Bar (Dành riêng cho màn hình di động)
- **Tập tin tác động:** `frontend/components/ui/app-shell.tsx`, `frontend/app/globals.css`.
- **Giải pháp thiết kế:**
  - Hiển thị cố định ở chân màn hình trên thiết bị di động (`@media (max-width: 767px)`):
    - **Khám phá** (Icon Search) -> `/search`
    - **Ở ghép** (Icon Users) -> `/roommates`
    - **Yêu thích** (Icon Heart) -> `/favorites`
    - **Tin nhắn** (Icon Message kèm chấm đỏ unread) -> `/inquiries`
    - **Tài khoản** (Icon User) -> `/profile`
  - Đảm bảo khoảng trống dưới chân trang (`padding-bottom: 4.5rem`) để nội dung không bị che khuất.

### 4.5 Nâng cấp Trang Chi Tiết Phòng (`/listings/[id]`)
- **Tập tin tác động:** `frontend/features/listings/listing-detail.tsx`, `listing-detail.module.css`.
- **Giải pháp thiết kế:**
  - **Sticky Mobile Contact Bar**: Thanh ghim đáy màn hình trên mobile hiển thị Giá thuê + Nút CTA *"Nhắn tin cho chủ trọ"*.
  - **Quick Question Chips**: Thêm 3 câu hỏi mẫu bên trên ô soạn tin: *"Phòng này còn trống không ạ?"*, *"Chi phí dịch vụ/điện nước thế nào?"*, *"Em có thể hẹn xem phòng hôm nay được không?"*.
  - **Fullscreen Photo Lightbox**: Cho phép chạm vào ảnh để bung toàn màn hình nền đen, vuốt qua lại xem ảnh chất lượng cao.

---

## 5. Kế Hoạch Triển Khai Phân Kỳ (Phased Roadmap)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            LỘ TRÌNH THỰC HIỆN                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ GIAI ĐOẠN 1: TẬP TRUNG CORE CHAT, KẾT NỐI Ở GHÉP & THÔNG BÁO [ĐÃ HOÀN THÀNH] │
│  ├─ Task 1.1: Đồng bộ khung Chat Ở ghép theo chuẩn InquiryConversationCore   │
│  ├─ Task 1.2: Nâng cấp quả chuông thành Notification Popover & Realtime      │
│  └─ Task 1.3: Lột xác trang Chi tiết Yêu cầu Ở ghép & Khung gửi quan tâm     │
│                                                                              │
│ GIAI ĐOẠN 2: TỐI ƯU HÓA ĐIỀU HƯỚNG MOBILE & CHI TIẾT PHÒNG [ĐÃ HOÀN THÀNH]   │
│  ├─ Task 2.1: Triển khai Mobile Bottom Navigation Bar 5 tab                  │
│  ├─ Task 2.2: Thêm Sticky Mobile Contact Bar & Quick Question Chips          │
│  └─ Task 2.3: Tháo gỡ ngõ cụt trang So sánh phòng (/compare)                 │
│                                                                              │
│ GIAI ĐOẠN 3: POLISH HOÀN THIỆN THẨM MỸ & HIỆU ỨNG CHUYỂN ĐỘNG [ĐÃ HOÀN THÀNH] │
│  ├─ Task 3.1: Nâng cấp trang Tin đã lưu & Bộ lọc đã lưu                      │
│  ├─ Task 3.2: Tích hợp nút nổi Floating Map Toggle trên Mobile Search        │
│  └─ Task 3.3: Thêm Lightbox phóng to ảnh tin đăng                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Cam Kết An Toàn & Đảm Bảo Không Gây Lỗi Hồi Quy (Non-Regression)

1. **Tuân thủ quy tắc kiến trúc (AGENTS.md)**:
   - Toàn bộ các thay đổi là nâng cấp giao diện người dùng (UI/UX) và hiệu ứng thị giác (CSS/TSX).
   - Không thay đổi schema cơ sở dữ liệu, không sửa đổi API contract hay các quy tắc phân quyền (Role-based access).
2. **Bảo đảm toàn bộ Test Suites hiện có**:
   - Duy trì đầy đủ các thuộc tính `role`, `aria-*`, text nhãn, data attributes để 15 test suites của Roommate (80 tests) và các test suite khác tiếp tục pass 100%.
3. **Tiêu chuẩn Responsive & Trợ năng**:
   - Kiểm thử hiển thị không tràn viền ngang (`scrollWidth === innerWidth`) trên 4 mốc: 375px, 768px, 1024px, 1440px.
   - Luôn tôn trọng thiết lập giảm chuyển động của người dùng (`@media (prefers-reduced-motion: reduce)`).
