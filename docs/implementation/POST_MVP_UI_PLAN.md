# RentMate — Kế hoạch nâng cấp hậu MVP

> Trạng thái: bản nháp để thảo luận
>
> Phạm vi: dữ liệu demo, GPS/tìm quanh tôi, trang đăng tin chủ trọ, dashboard chủ trọ và giao diện admin.

Tài liệu này ghi lại hướng phát triển tiếp theo sau khi phần giao diện nền tảng đã được làm lại. Đây là kế hoạch hậu MVP độc lập, không thay đổi các quyết định và roadmap MVP đã đóng băng.

## Mục tiêu

- Có dữ liệu demo đủ thật để preview trọn vẹn các luồng chính.
- Giúp người dùng tìm phòng bằng địa điểm, GPS, bán kính và bản đồ một cách dễ hiểu.
- Làm mới các khu vực chưa được redesign: chủ trọ, đăng tin và admin.
- Giữ trải nghiệm nhất quán với ngôn ngữ hình ảnh RentMate hiện tại: block-based, tương phản cao, có chuyển động nhưng dễ đọc.
- Giữ nguyên các hợp đồng backend, quyền riêng tư và vòng đời listing hiện có, trừ khi có quyết định V2 được thảo luận riêng.

## Nguyên tắc chung

- Dữ liệu seed chỉ dùng cho development/preview; không dùng tài khoản demo cố định trên production.
- GPS phải yêu cầu người dùng chủ động cấp quyền, có trạng thái loading, từ chối quyền và fallback thủ công.
- Vị trí chính xác của người dùng chỉ dùng trong phiên tìm kiếm; không hiển thị hoặc lưu công khai ngoài phạm vi cần thiết.
- Vị trí listing công khai vẫn là vị trí gần đúng theo contract hiện tại.
- Lần tìm đầu tiên có thể yêu cầu nút xác nhận; sau đó thay đổi bán kính/địa điểm có thể cập nhật map tức thì và refresh kết quả nền.
- Luôn có loading, empty, retry và lỗi rõ ràng; không dùng dữ liệu demo để che kết quả thật rỗng.
- Ưu tiên responsive, vùng chạm tối thiểu 44px, focus state và `prefers-reduced-motion`.

## Thứ tự triển khai đề xuất

### Giai đoạn 1 — Nền dữ liệu demo

Mục tiêu: có đủ dữ liệu để các màn hình không còn rơi vào trạng thái trống khi preview.

- Tạo seed user chủ trọ dành riêng cho development.
- Tạo nhiều listing đã được duyệt ở các khu vực khác nhau trong TP.HCM.
- Gắn giá, diện tích, loại phòng, tiện ích, ảnh cover và tọa độ gần đúng.
- Có dữ liệu ở nhiều trạng thái để preview owner/admin: draft, pending, approved, rejected và inactive.
- Ghi rõ cách reset/reseed dữ liệu mà không ảnh hưởng database dùng chung.

Đầu ra:

- Trang chủ có listing thật từ seed.
- Tìm phòng và Gần tôi có kết quả ổn định.
- Có tài khoản development để đi qua luồng chủ trọ và admin.

### Giai đoạn 2 — Tìm quanh tôi và GPS

Mục tiêu: biến “Gần tôi” thành luồng tìm kiếm đáng tin cậy.

- Giữ nút GPS rõ ràng, không tự xin quyền khi người dùng chưa bấm.
- Sau khi được cấp quyền, dùng tọa độ làm tâm tìm kiếm và zoom map theo bán kính.
- Vẽ vòng tròn bán kính quanh tâm địa điểm đã chọn.
- Thay đổi bán kính cập nhật vòng tròn/zoom ngay; refresh kết quả nền sau debounce.
- Chọn địa điểm gợi ý hoặc GPS sau lần tìm đầu tự kích hoạt lại tâm tìm kiếm.
- Hiển thị rõ khi không có phòng trong bán kính, không thay bằng dữ liệu demo.
- Quyết định riêng cách hỗ trợ địa chỉ tự nhập:
  - bộ địa điểm công khai được chuẩn hóa;
  - chọn trực tiếp một điểm trên bản đồ;
  - hoặc thiết kế endpoint geocoding công khai với rate limit và privacy review.

Đầu ra:

- Người dùng biết chính xác map đang lấy tâm và bán kính nào.
- Không có request dư thừa khi người dùng đổi nhiều mức bán kính liên tục.
- Có fallback rõ ràng khi GPS bị từ chối, không khả dụng hoặc không tìm thấy listing.

### Giai đoạn 3 — Trang đăng tin chủ trọ

Mục tiêu: làm luồng tạo listing dễ hiểu và giảm lỗi nhập liệu.

- Thiết kế lại form theo từng nhóm: thông tin cơ bản, giá/diện tích, tiện ích, ảnh, vị trí.
- Có preview listing trước khi gửi duyệt.
- Hiển thị rõ listing đang ở draft, pending, approved hay rejected.
- Làm rõ lỗi validation tại từng field và lỗi tổng hợp ở đầu form.
- Hỗ trợ upload/reorder ảnh với trạng thái progress và lỗi provider an toàn.
- Cho phép chủ trọ xem vị trí chính xác của chính listing mình, nhưng không mở rộng disclosure công khai.

Đầu ra:

- Chủ trọ tạo được một listing hoàn chỉnh từ đầu đến gửi duyệt.
- Có thể quay lại draft mà không mất dữ liệu.
- Trạng thái moderation và hành động tiếp theo luôn dễ hiểu.

### Giai đoạn 4 — Dashboard chủ trọ

Mục tiêu: quản lý tin đăng sau khi tạo.

- Trang tổng quan số lượng tin theo trạng thái.
- Danh sách listing có filter theo trạng thái và tìm nhanh.
- Card/list row có hành động chính: xem, sửa, gửi duyệt, ẩn/hiện theo quyền.
- Hiển thị lý do bị từ chối và lịch sử cần thiết mà không lộ dữ liệu moderation không phù hợp.
- Empty state cho chủ trọ mới chưa có tin.
- Responsive cho desktop, tablet và mobile.

### Giai đoạn 5 — Giao diện admin

Mục tiêu: tạo không gian moderation rõ ràng, ưu tiên xử lý nhanh và an toàn.

- Dashboard tổng quan: tin chờ duyệt, tin bị từ chối, user cần chú ý.
- Hàng đợi moderation có filter, sort và trạng thái rõ ràng.
- Trang chi tiết listing để kiểm tra nội dung, ảnh, tiện ích và vị trí.
- Hành động approve/reject/hide có confirmation và lý do phù hợp.
- Lịch sử moderation dạng append-only, dễ đọc.
- Quản lý user với trạng thái active/inactive và role rõ ràng.
- Không hiển thị secret, password, token hoặc dữ liệu nội bộ ngoài quyền admin.

### Giai đoạn 6 — Rà soát toàn hệ thống

- Đồng bộ header, navigation, typography, spacing và motion giữa homepage, search, near-me, owner và admin.
- Kiểm tra loading/empty/error/permission ở từng màn hình.
- Rà responsive ở 375px, 768px, 1024px và desktop rộng.
- Kiểm tra focus keyboard, contrast và reduced motion.
- Kiểm tra dữ liệu seed không làm sai privacy projection hoặc contract API.
- Chỉ commit từng nhóm thay đổi có phạm vi rõ ràng.

## Các điểm cần bàn luận trước khi mở rộng

- Có cho phép người dùng tự nhập địa chỉ bất kỳ hay chỉ chọn địa điểm gợi ý/map point?
- Nếu mở geocoding công khai, endpoint, rate limit, timeout và privacy projection sẽ được thiết kế thế nào?
- Tài khoản seed development dùng email nào và có reset tự động không?
- Bộ ảnh demo dùng asset nội bộ, ảnh generated hay ảnh placeholder có bản quyền rõ ràng?
- Admin có những role nào ngoài admin hiện tại?
- Có cần thông báo realtime/email khi listing được approve hoặc reject không?
- Màn hình owner/admin ưu tiên desktop trước hay mobile trước?

## Các vấn đề hiện tại đã biết

- “Gần tôi” hiện có danh sách địa điểm gợi ý tĩnh; địa chỉ tự nhập chưa được geocode thành tọa độ.
- Nếu database chưa có listing approved, GPS và các bán kính hợp lệ vẫn có thể trả về empty state là đúng.
- Trang đăng tin chủ trọ và giao diện admin chưa được redesign theo ngôn ngữ hình ảnh mới.
- Dữ liệu seed đầy đủ là tiền đề để đánh giá đúng các màn hình owner/admin và moderation.

## Definition of done cho kế hoạch này

Kế hoạch được xem là hoàn tất khi:

- Có dữ liệu development đủ để preview tất cả trạng thái chính.
- GPS, map radius và kết quả gần tôi phản hồi nhất quán, không làm sai dữ liệu.
- Chủ trọ tạo và quản lý được listing qua giao diện mới.
- Admin xử lý được moderation và user management qua giao diện mới.
- Các màn hình có cùng visual language, responsive và accessibility cơ bản.
- Những thay đổi contract/API/database/security ngoài MVP đều được ghi nhận và phê duyệt riêng trước khi triển khai.
