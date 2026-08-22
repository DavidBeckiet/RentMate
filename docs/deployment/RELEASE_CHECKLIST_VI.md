# Danh sách kiểm tra phát hành sản xuất RentMate

Để trống giá trị sản xuất không xác định. Buổi diễn tập kho lưu trữ đã được kiểm tra không phải là bước phê duyệt sản xuất.

## Phát hành hồ sơ

- Git cam kết SHA: ______________________________
- Phát hành/gắn thẻ: ______________________________
- Phiên bản di chuyển hiện tại: ______________________________
- Phiên bản di chuyển mục tiêu: ______________________________
- ID dự phòng/tham chiếu vị trí: ______________________________
- URL giao diện người dùng: ______________________________
- URL API: ______________________________
- Thời gian triển khai (UTC): ______________________________
- Người điều hành: ______________________________
- Chủ sở hữu khôi phục: ______________________________
- Hiện vật/phiên bản trước đó: ______________________________
- Kết quả/tham chiếu kiểm tra nhà cung cấp: ______________________________
- Kết quả/tham khảo khói: ______________________________

## Triển khai trước

- [ ] RM-053/RM-054/release bằng chứng hồi quy có màu xanh cho cam kết này.
- [ ] Nền tảng mục tiêu, cấu trúc liên kết cùng trang web, quyền sở hữu tên miền, DNS và TLS được ghi lại.
- [ ] URL giao diện người dùng/API là HTTPS và mối quan hệ giao diện người dùng/API là cùng một trang web.
- [ ] Cơ sở dữ liệu, nhà cung cấp, tác nhân khói, chủ sở hữu sao lưu và khôi phục đều có sẵn.
- [ ] Không có bí mật sản xuất nào được lưu trữ trong Git, lịch sử lệnh, nhật ký xây dựng hoặc các biến công khai ở giao diện người dùng.

## Phát hành microservices

- [ ] Đã build và kiểm tra các image `identity`, `listing`, `engagement` và `gateway` từ commit phát hành.
- [ ] `IDENTITY_DB_NAME`, `LISTING_DB_NAME` và `ENGAGEMENT_DB_NAME` trỏ tới các cơ sở dữ liệu service độc lập.
- [ ] Migration của từng service đã được chạy đúng một lần trên database mục tiêu sạch hoặc đã được xác minh bằng bản ghi phiên bản triển khai bên ngoài.
- [ ] Backfill của từng service đã chạy dry-run, đã đối chiếu số lượng nguồn/đích và chỉ sau đó mới chạy `--apply`.
- [ ] Gateway đã route `auth/users` tới Identity, `listings/lookups/geocoding` tới Listing và `favorites` tới Engagement.
- [ ] `backend` compatibility upstream vẫn sẵn sàng cho rollback cho đến khi hoàn tất thời gian theo dõi sau cutover.
- [ ] Postgres, Identity, Listing, Engagement và Gateway đều healthy; health, public listing và unauthenticated authorization smoke tests đã pass.
- [ ] Chủ sở hữu quyết định cutover và rollback đã xác nhận thời điểm chuyển traffic.

## Xác thực cấu hình sản xuất

- [ ] Các biến phụ trợ khớp với `.env.production.example`; không còn giữ chỗ/bí mật phát triển mặc định.
- [ ] `FRONTEND_ORIGIN` là nguồn gốc giao diện người dùng HTTPS chính xác.
- [ ] `NEXT_PUBLIC_API_BASE_URL` chính xác là nguồn gốc API HTTPS không cục bộ được chọn trước khi xây dựng giao diện người dùng.
- [ ] `COOKIE_SECURE=true`; Các hằng số chính sách JWT/hình ảnh/tìm kiếm giữ lại các giá trị cố định.
- [ ] `npm.cmd run deploy:validate` vượt qua; tài liệu tham khảo bằng chứng: ______________________________

## Hỗ trợ

- [ ] Danh tính cơ sở dữ liệu nguồn đã được xác minh trước khi sao lưu.
- [ ] Định dạng tùy chỉnh `pg_dump` được hoàn thiện với việc xử lý mật khẩu được bảo vệ.
- [ ] Bản sao lưu tồn tại bên ngoài kho lưu trữ, có kích thước khác 0 và được mã hóa/bảo vệ.
- [ ] ID/vị trí sao lưu, chính sách lưu giữ, chủ sở hữu khôi phục và quyền truy cập khôi phục đã được ghi lại.
- [ ] Khôi phục kết quả diễn tập/tham khảo: ______________________________

## Kế hoạch di chuyển

- [ ] Một toán tử di chuyển được đặt tên; khởi động ứng dụng sẽ không chạy di chuyển.
- [ ] Bản ghi phiên bản hiện tại bên ngoài có sẵn và khớp với các điều kiện tiên quyết của lược đồ được quan sát.
- [ ] Chế độ sạch hoặc chế độ hiện có đã được chọn có chủ ý.
- [ ] `--plan-only` đầu ra đã được xem xét; phiên bản đã chọn: ______________________________
- [ ] Các tệp di chuyển được áp dụng/chia sẻ không thay đổi.

## Thực hiện di chuyển

- [ ] Lệnh di chuyển được phê duyệt đã hoàn tất thành công.
- [ ] Không có chủ sở hữu di chuyển đồng thời hoặc khởi động ứng dụng thực hiện SQL di chuyển.
- [ ] Bản ghi phiên bản bên ngoài chưa được nâng cao trước khi xác minh.

## Xác minh lược đồ

- [ ] `npm.cmd run db:verify` vượt qua với hai enum, tám bảng sản phẩm, các ràng buộc/chỉ mục dự kiến ​​và hạt giống.
- [ ] Bản ghi triển khai bên ngoài chỉ được nâng cao sau khi xác minh thành công.
- [ ] Bằng chứng xác minh/tham khảo: ______________________________

## Quản trị viên

- [ ] Danh tính/chủ sở hữu quản trị viên được kiểm soát đã được phê duyệt.
- [ ] `admin:provision` hoặc bootstrap sạch tạo ra kết quả được tạo/no-op như mong đợi.
- [ ] Không xảy ra đăng ký quản trị viên công cộng hoặc ghi nhật ký mật khẩu.

## Nhà cung cấp

- [] Đường chuyền ping không đột biến của Cloudinary.
- [ ] Một mã địa lý chuyển tiếp Nominatim bị chặn có chứa Tác nhân người dùng được xác định.
- [ ] Không có tải trọng bí mật/thô của nhà cung cấp nào xuất hiện trong bằng chứng.
- [ ] Kết quả/tham khảo của nhà cung cấp: ______________________________

## Xây dựng

- [ ] Cơ sở API sản xuất bị thiếu/không an toàn bị từ chối.
- [ ] Frontend được xây dựng lại với `NEXT_PUBLIC_API_BASE_URL` đã được phê duyệt.
- [ ] Xây dựng sản xuất phụ trợ/giao diện người dùng, kiểm tra, kiểm tra lỗi đánh máy, tìm lỗi mã nguồn và kiểm tra định dạng.
- [ ] Mã định danh/tổng ​​kiểm tra hiện vật: ______________________________

## Triển khai

- [ ] Phiên bản/tạo phẩm trước đó vẫn có sẵn.
- [ ] Phần cuối chạy như một quy trình để giới hạn tỷ lệ MVP quy trình cục bộ.
- [ ] Các tạo phẩm phụ trợ và giao diện người dùng được khởi động dưới trình quản lý quy trình nền tảng.
- [ ] DNS/TLS và nguồn gốc CORS chính xác phân giải thành các tạo phẩm dự định.

## Sức khỏe

- [ ] Frontend root trả về `200` và dấu RentMate.
- [ ] `GET /api/health` chỉ trả về hợp đồng được kết nối an toàn.
- [ ] Nhật ký không chứa thông tin xác thực, cookie, JWT, SQL hoặc dấu vết ngăn xếp được hiển thị cho khách hàng.

## Khói

- [ ] Danh sách được biết hiện là `APPROVED` và chủ sở hữu của nó đang hoạt động.
- [ ] Bộ sưu tập/chi tiết công khai vượt qua kiểm tra trình chiếu quyền riêng tư ẩn danh.
- [ ] Đăng nhập của người thuê, đọc mục yêu thích và thẻ đăng xuất.
- [ ] Đăng nhập chủ nhà, đọc danh sách sở hữu và vượt qua đăng xuất.
- [ ] Đăng nhập của quản trị viên, đọc hàng đợi kiểm duyệt và vượt qua đăng xuất.
- [ ] Cookie chỉ dành cho máy chủ, `HttpOnly`, `Secure`, `SameSite=Lax` và `Path=/`.
- [ ] CORS được chứng nhận sử dụng nguồn gốc giao diện người dùng chính xác.
- [ ] Không có dữ liệu sản phẩm nào bị biến đổi do khói.

## Sau khi triển khai

- [ ] Nhật ký đại diện, kết nối cơ sở dữ liệu, trạng thái nhà cung cấp và tỷ lệ lỗi đã được xem xét.
- [ ] Bằng chứng sao lưu và phát hành được lưu giữ theo chủ sở hữu có tên.
- [ ] Kết quả khói/tham chiếu và thời gian triển khai được ghi lại trong hồ sơ phát hành.

## Quyết định khôi phục

- [ ] Tiếp tục phát hành.
- [ ] Chỉ khôi phục tạo phẩm ứng dụng; lược đồ tương thích.
- [ ] Khôi phục bản sao lưu vào DB thay thế mới, xác minh rồi cố tình chuyển kết nối.
- Quyết định/lý do: ______________________________

Không bao giờ chỉnh sửa quá trình di chuyển đã áp dụng, di chuyển xuống một cách mù quáng, bỏ sơ đồ sản xuất hoặc khôi phục trên cơ sở dữ liệu nguồn.

## Đăng xuất

- Ngày phát hành: ______________________________
- Cơ sở dữ liệu/chủ sở hữu dự phòng/ngày: ______________________________
- Bảo mật/chủ sở hữu nhà cung cấp/ngày: ______________________________
- Chủ sở hữu/ngày khôi phục: ______________________________
- Phê duyệt sản xuất cuối cùng: ______________________________
