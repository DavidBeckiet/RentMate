# RentMate Lộ trình thực hiện MVP

## 1. Mục đích

Lộ trình này chuyển đổi các yêu cầu, kiến ​​trúc, thiết kế cơ sở dữ liệu và hợp đồng API đã được cố định thành một chuỗi triển khai có thể thực thi được cho một nhà phát triển sinh viên trong khoảng tám tuần.

Đây là tài liệu lệnh thực hiện có thẩm quyền. Công việc triển khai sau này nên chọn một ID tác vụ, chỉ triển khai tác vụ bị giới hạn đó, chạy các bước kiểm tra được yêu cầu và dừng mà không mở lại các quyết định về sản phẩm, lược đồ, API, vòng đời, quyền riêng tư hoặc kiến ​​trúc.

Nguồn tài liệu xác thực:

- `docs/requirements/REQUIREMENTS.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/database/DATABASE_DESIGN.md`
- `docs/api/API_SPECIFICATION.md`

Việc đánh giá tính tương thích được chấp nhận là cuối cùng: tất cả các điểm cuối 31 `/api/v1` và điểm cuối tình trạng riêng biệt đều tương thích với chính xác tám bảng và không yêu cầu thay đổi lược đồ hoặc API nào.

## 2. Giả định thực hiện cố định

- Kiến trúc: một giao diện Next.js Bộ định tuyến ứng dụng, một mô-đun nguyên khối Express/TypeScript và một cơ sở dữ liệu PostgreSQL.
- Các mô-đun phụ trợ: chính xác là `auth`, `users`, `listings` và `favorites`. Tìm kiếm, hình ảnh và kiểm duyệt vẫn nằm trong phạm vi `listings`.
- Persistence: SQL được tham số hóa trực tiếp thông qua `pg`; không có ORM và không có PostGIS.
- Lược đồ: chính xác các kiểu enum `user_role` và `listing_status`, và chính xác 8 bảng: `users`, `property_types`, `amenities`, `listings`, `listing_images`, `listing_amenities`, `favorites`, và `moderation_history`.
- API: chính xác 31 điểm cuối được phiên bản theo `/api/v1`, cộng với `GET /api/health`.
-  xác thực: băm mật khẩu bcrypt và JWT trong hai giờ trong cookie HttpOnly `rentmate_session` chỉ dành cho máy chủ. Không có mã thông báo làm mới hoặc hàng phiên phía máy chủ.
- Bảo mật trình duyệt: `SameSite=Lax`, sản xuất `Secure`, nhận biết thông tin xác thực chính xác CORS và xác thực được phép`Origin` trên mọi phương thức không an toàn.
- Vòng đời: máy trạng thái Tùy chọn C bị đóng băng và ma trận chỉnh sửa quan trọng được triển khai chính xác như được chỉ định.
- Khả năng hiển thị: dữ liệu công khai yêu cầu danh sách `APPROVED` và chủ nhà sở hữu đang hoạt động.
- Quyền riêng tư: địa chỉ và tọa độ chính xác vẫn là dữ liệu chủ sở hữu/quản trị viên; tọa độ công khai được lấy bằng cách làm tròn ba thập phân xác định. Thông tin liên hệ của chủ nhà chỉ xuất hiện đối với người thuê đang hoạt động trên chi tiết danh sách công khai.
- Tìm kiếm: một bộ sưu tập danh sách công khai xử lý việc duyệt, bộ lọc, giới hạn bản đồ và bán kính. Bán kính sử dụng hộp giới hạn TypeScript và một triển khai PostgreSQL Haversine với bán kính Trái đất `6371.0088 km`.
- Hình ảnh: hoạt động Cloudinary qua trung gian phụ trợ, nhiều nhất là tám hình ảnh 5 MiB JPEG/PNG/WebP và không có điểm cuối thay thế nguyên tử.
- Mã hóa địa lý: chỉ dành cho phụ trợ rõ ràng Nominatim chuyển tiếp mã hóa địa lý; không có tính năng tự động hoàn thành, mã hóa địa lý đảo ngược, mã hóa địa lý nền hoặc bộ đệm riêng.
- Kiểm tra/lưu giữ: lịch sử kiểm duyệt chỉ có ở phần bổ sung. Một danh sách được sở hữu chỉ có thể bị xóa cứng khi `DRAFT` và chỉ khi nó không có lịch sử kiểm duyệt.
- Thử nghiệm là tăng dần. Một ngăn triển khai thực tế là Vitest cho các thử nghiệm đơn vị/dịch vụ TypeScript, Supertest cho tích hợp HTTP phụ trợ, cơ sở dữ liệu thử nghiệm PostgreSQL dùng một lần cho các thử nghiệm ràng buộc/giao dịch, Thư viện thử nghiệm cho hành vi giao diện người dùng và Playwright cho một tập hợp nhỏ các luồng trình duyệt quan trọng. Đây là những công cụ phát triển, không phải kiến ​​trúc thời gian chạy.
- Các cấu trúc thư mục đích trong kiến ​​trúc cố định chỉ được tạo khi việc triển khai cần đến chúng; các lớp trừu tượng trống không được tạo.

## 3. Tổng quan về giai đoạn

| Giai đoạn | Lịch trình mặc định | Kết quả chính | Kích thước |
|---|---|---|---|
| 0. Kho lưu trữ và đường cơ sở phát triển | Tuần 1 | Bộ xương có thể tái tạo với khả năng quan sát, lỗi, tình trạng và trình chạy thử nghiệm | Trung bình |
| 1. PostgreSQL di chuyển và dữ liệu hạt giống | Tuần 1 | Cơ sở dữ liệu tám bảng xác định từ một cá thể PostgreSQL sạch | Lớn |
| 2. Nền tảng chia sẻ phụ trợ | Tuần 1 | Nền tảng chia sẻ HTTP, cơ sở dữ liệu, xác thực, xác thực và DTO | Lớn |
| 3. Xác thực và người dùng | Tuần 2 | Hoàn thành tài khoản/phiên/hồ sơ API | Lớn |
| 4. Tra cứu và liệt kê nền tảng dự thảo | Tuần 2 | Tra cứu có kiểm soát và các luồng đọc/tạo dự thảo của chủ sở hữu | Lớn |
| 5. Chỉnh sửa danh sách và vòng đời | Tuần 3 | Hoàn thiện vòng đời của chủ nhà và các quy tắc đồng thời | Lớn |
| 6. Liệt kê các hình ảnh và Cloudinary | Tuần 4 | Hoàn thiện quy trình xử lý hình ảnh và thù lao của nhà cung cấp | Lớn |
| 7. Chuyển tiếp mã hóa địa lý | Tuần 4 | Rõ ràng, được điều chỉnh Nominatim quy trình làm việc | Trung bình |
| 8. Khám phá danh sách công khai | Tuần 5 | Tìm kiếm công khai thống nhất, kết quả bản đồ/bán kính và chi tiết công khai | Lớn |
| 9. Yêu thích | Tuần 5 | Người thuê nhà nhận biết được khả năng hiển thị yêu thích API | Trung bình |
| 10. Kiểm duyệt quản trị viên và quản lý người dùng | Tuần 6 | Quy trình kiểm tra kiểm duyệt và kích hoạt tài khoản | Lớn |
| 11. Nền tảng giao diện người dùng | Tuần 6 | App shell, cơ sở hạ tầng API/auth, các biểu mẫu và cơ sở bản đồ chỉ dành cho khách hàng | Lớn |
| 12. Quy trình làm việc của các tác nhân giao diện người dùng | Tuần 7 | Hành trình của người dùng công khai, người thuê nhà, chủ nhà và quản trị viên | Lớn |
| 13. Kiểm tra xác minh và tích hợp | Tuần 8 | Bằng chứng chấp nhận và hồi quy xuyên suốt | Lớn |
| 14. Triển khai và tài liệu cuối cùng | Tuần 8 | MVP có thể triển khai, được ghi lại bằng tài liệu với các kiểm tra sản xuất | Trung bình |

Lịch trình là một trình tự mặc định, không phải là ước tính số giờ. Mỗi giai đoạn bao gồm các thử nghiệm thay vì trì hoãn tất cả việc xác minh sang Giai đoạn 0

## 4. Các giai đoạn chi tiết

### Giai đoạn 0 — Kho lưu trữ và đường cơ sở phát triển

1. **Mục tiêu:** Làm cho khung giao diện người dùng/phụ trợ hiện có có thể tái tạo được và sẵn sàng cho việc triển khai tăng dần, có thể quan sát và kiểm tra được.
2. **Phạm vi:** Kiểm tra khung; căn chỉnh TypeScript, linting, định dạng, tải môi trường, PostgreSQL cục bộ, khởi động/tắt máy, ghi nhật ký có cấu trúc, ID yêu cầu, lỗi tập trung, tình trạng và trình chạy thử.
3. **Điều kiện tiên quyết:** Có thông số kỹ thuật cố định; npm, Docker Desktop và Docker Compose đều có sẵn. Sử dụng phiên bản Node.js đã được kho lưu trữ ghim, nếu có. Nếu không có phiên bản nào được ghim, RM-001 sẽ chọn và ghi lại một phiên bản LTS được hỗ trợ. Frontend và backend sử dụng cùng một đường cơ sở phát triển được ghi lại trừ khi ràng buộc dự án hiện tại yêu cầu khác.
4. **Các tệp/thư mục được lập kế hoạch:** Tập lệnh/cấu hình gốc và gói; `.env.example`; `docker-compose.yml`; `backend/src/{app.ts,server.ts,config,db,shared}`; cấu hình kiểm tra phụ trợ/giao diện người dùng và thư mục kiểm tra. Các tập tin hiện có được mở rộng thay vì thay thế mà không cần xem xét.
5. **Nhiệm vụ thực hiện:**

| ID | Thay đổi bị giới hạn | Các tập tin/mô-đun dự kiến ​​| Các phần bị đóng băng | Phụ thuộc vào | Điều kiện hoàn thành |
|---|---|---|---|---|---|
| RM-001 | Kiểm tra và chuẩn hóa công cụ kho lưu trữ, tập lệnh, TypeScript nghiêm ngặt, linting giao diện người dùng, quy tắc định dạng và các lệnh cục bộ được ghi lại. | Root README/config; cả cấu hình `package.json` và TypeScript/lint/format | Kiến trúc §§2, 24–25; Yêu cầu §5 | Không có | Cài đặt sạch có thể chạy các lệnh đánh máy, tìm lỗi mã nguồn, kiểm tra định dạng, xây dựng và ghi lại các lệnh phát triển mà không cần mã sản phẩm. |
| RM-002 | Thiết lập phân tích cú pháp môi trường, quy trình làm việc Compose chỉ 1, khởi động phụ trợ/tắt nhẹ nhàng, ghi nhật ký bảng điều khiển có cấu trúc, ID yêu cầu, xử lý lỗi không mong muốn tập trung và duy trì phản hồi tình trạng được chỉ định. | `backend/src/config`, `db`, `shared/logging`, `shared/middleware`, `app.ts`, `server.ts`; `.env.example` | Kiến trúc §§8, 21–23; API Health, §§6, 20 | RM-001 | Khởi động xác thực cấu hình cơ bản, tắt máy sẽ đóng máy chủ/pool, mọi yêu cầu đều có ID, các lỗi được loại bỏ và tình trạng trả về hình dạng `200`/`503` đã đóng băng. |
| RM-003 | Thêm nền tảng thử nghiệm gia tăng và một thử nghiệm khói cho mỗi ứng dụng mà không triển khai hành vi của sản phẩm. | Cấu hình Vitest/Supertest phụ trợ; lối vào Cấu hình thư viện Vitest/Testing; người trợ giúp/kịch bản kiểm thử | Yêu cầu §5 Độ tin cậy/Khả năng bảo trì; API §§5–6 | RM-001, RM-002 | Đơn vị và HTTP/thành phần khói thử nghiệm chạy một cách xác định, và các thử nghiệm phụ trợ có thể nhắm tới cơ sở dữ liệu PostgreSQL dùng một lần mà không cần sử dụng dữ liệu phát triển. |

6. **Nhiệm vụ phụ trợ:** RM-002 và phần phụ trợ của RM-003.
7. **Nhiệm vụ giao diện người dùng:** Công cụ, lint/typecheck và chỉ đường cơ sở kết xuất thử nghiệm tối thiểu; không có trang ứng dụng.
8. **Nhiệm vụ cơ sở dữ liệu:** Chỉ xác minh kết nối cục bộ và cách ly cơ sở dữ liệu thử nghiệm; không xác định lược đồ sản phẩm trong giai đoạn này.
9. **Các điểm cuối được đề cập:** Chỉ riêng `GET /api/health`.
10. **Các vấn đề về giao dịch/đồng thời:** Việc tắt nhóm không được làm gián đoạn các yêu cầu được chấp nhận; các bài kiểm tra không bao giờ được chia sẻ trạng thái cơ sở dữ liệu phát triển có thể thay đổi.
11. **Các mối quan ngại về bảo mật/quyền riêng tư:** Bí mật môi trường không được cam kết; nhật ký và tình trạng bỏ qua thông tin xác thực, SQL, dấu vết ngăn xếp, cookie, JWT và dữ liệu liên hệ.
12. **Các kiểm tra cần thiết:** Tình trạng `200`, cơ sở dữ liệu không khả dụng `503`, truyền ID yêu cầu, lỗi không mong muốn đã được loại bỏ, trình trợ giúp tắt máy duyên dáng và kết xuất khói giao diện người dùng.
13. **Tiêu chí chấp nhận:** Một nhà phát triển mới có thể sao chép `.env.example`, khởi động PostgreSQL, chạy cả hai ứng dụng, gọi tình trạng và chạy tất cả các kiểm tra cơ bản bằng cách sử dụng các lệnh được ghi lại.
14. **Rõ ràng nằm ngoài phạm vi:** Di chuyển sản phẩm, xác thực, tuyến sản phẩm, khách hàng của nhà cung cấp, trang tác nhân và giao diện người dùng/phụ trợ vùng chứa.
15. **Phụ thuộc và kích thước:** Không có giai đoạn trước; **Trung bình**.

### Giai đoạn 1 — PostgreSQL di chuyển và dữ liệu hạt giống

</ cơ sở dữ liệu/đường cơ sở kiểm tra đang hoạt động.
4. **Các tập tin/thư mục được lập kế hoạch:** `backend/migrations/` các tập tin SQL được sắp xếp; một tập lệnh/tập lệnh di chuyển có phạm vi hẹp; các tệp hoặc tập lệnh gốc để tra cứu dữ liệu và cung cấp quyền quản trị viên được kiểm soát; kiểm thử tích hợp di chuyển.
5. **Nhiệm vụ triển khai:**

| ID | Thay đổi bị giới hạn | Các tập tin/mô-đun dự kiến ​​| Các phần bị đóng băng | Phụ thuộc vào | Điều kiện hoàn thành |
|---|---|---|---|---|---|
| RM-004 | Thực hiện phát hiện/thực thi di chuyển xác định mà không cần bảng kế toán cơ sở dữ liệu, cộng với các chính sách cơ sở dữ liệu sạch, triển khai hiện có, phát hiện không khớp và khôi phục được ghi lại. | `backend/migrations`; tập lệnh gói và trình chạy di chuyển | Kiến trúc §24; Cơ sở dữ liệu §§1–3, 33 | RM-003 | Cơ sở dữ liệu sạch chạy tất cả các tập tin một lần theo thứ tự từ vựng/phiên bản; các triển khai hiện tại chỉ chọn các tệp mới hơn phiên bản được ghi bên ngoài; sự không khớp với điều kiện sơ đồ và lỗi một phần dừng lại rõ ràng; di chuyển được chia sẻ là bất biến. |
| RM-005 | Thêm di chuyển danh mục/tài khoản cơ bản và enum cùng với loại tài sản bình thường và hạt giống tiện ích. | Các tập tin di chuyển/hạt giống được sắp xếp sớm | Cơ sở dữ liệu §§4, 6.1–6.3, 10–13 | RM-004 | `user_role`, `listing_status`, `users`, `property_types`, và `amenities` khớp chính xác với các kiểu, cột, ràng buộc và hàng ban đầu cố định. |
| RM-006 | Thêm các di chuyển cốt lõi, hình ảnh và tiện ích kết nối danh sách với tất cả các séc bị đóng băng và khóa ngoại. | Các tập tin di chuyển theo thứ tự trung gian | Cơ sở dữ liệu §§6.4–6.6, 14, 18–20 | RM-005 | `listings`, `listing_images`, và `listing_amenities` khớp chính xác với đặc tả, bao gồm thứ tự hình ảnh có thể trì hoãn và tính đầy đủ vô hướng không có dự thảo. |
| RM-007 | Thêm mục yêu thích, lịch sử kiểm duyệt và bộ chỉ mục rõ ràng chính xác. </ hành vi. |
| RM-008 | Thêm chiến lược cung cấp/hạt giống quản trị viên được kiểm soát và xác minh ràng buộc/xây dựng sạch hoàn toàn. | Lệnh gieo hạt/cung cấp; kiểm tra tích hợp cơ sở dữ liệu; tài liệu thiết lập | Kiến trúc §10; Cơ sở dữ liệu §§4.1, 29–31; API §3.1 | RM-007 | Việc tạo quản trị viên không khả dụng thông qua các đường dẫn dữ liệu công cộng, mật khẩu là băm bcrypt, hạt giống tra cứu an toàn lặp lại và cơ sở dữ liệu sạch sẽ tái tạo chính xác hai enum/tám bảng. |

6. **Nhiệm vụ phụ trợ:** Chỉ trình chạy di chuyển và lệnh hạt giống được kiểm soát; không có kho lưu trữ hoặc điểm cuối.
7. **Nhiệm vụ giao diện người dùng:** Không có.
8. **Nhiệm vụ cơ sở dữ liệu:** Tất cả đều hoạt động trong giai đoạn này. Việc đặt hàng được nêu chi tiết trong Phần 7 của lộ trình này.
9. **Các điểm cuối được đề cập:** Không có trực tiếp; các điều kiện tiên quyết của lược đồ cho tất cả các điểm cuối của sản phẩm.
10. **Các mối quan tâm về giao dịch/đồng thời:** Mỗi lần di chuyển là nguyên tử khi PostgreSQL cho phép; khởi động ứng dụng đồng thời không được là cơ chế di chuyển; các bản nâng cấp hạt giống không được ghi đè bất ngờ trạng thái tra cứu đã ngừng hoạt động.
11. **Các vấn đề về bảo mật/quyền riêng tư:** Mật khẩu hạt giống của quản trị viên đi vào thông qua môi trường/đầu vào được bảo vệ và không bao giờ được cam kết hoặc ghi lại; thông tin xác thực cơ sở dữ liệu sản xuất vẫn chỉ ở phần phụ trợ.
12. **Các thử nghiệm bắt buộc:** Xây dựng lại cơ sở dữ liệu sạch sẽ, sắp xếp xác định, lựa chọn di chuyển rõ ràng từ một bảng kê khai phiên bản bên ngoài, hành vi giao dịch/lỗi trên mỗi lần di chuyển, phát hiện lỗi một phần, phát hiện không khớp điều kiện sơ bộ của bản ghi triển khai/lược đồ trong đó các hạt tra cứu thực tế, an toàn lặp lại, enum/kiểm tra/duy nhất/FK và hành vi xếp tầng/hạn chế, thứ tự hình ảnh có thể trì hoãn, chỉ mục một phần và lược đồ cuối cùng chính xác Inventory.
13. **Tiêu chí chấp nhận:** Một cơ sở dữ liệu PostgreSQL trống trở thành lược đồ và tập hạt giống được cố định chính xác bằng cách sử dụng một lệnh được ghi lại; không có bảng thứ chín hoặc cột/chỉ mục chưa được phê duyệt nào xuất hiện.
14. **Rõ ràng nằm ngoài phạm vi:** Siêu dữ liệu ORM, bảng sổ sách di chuyển, bảng phiên, PostGIS, kho ứng dụng và dữ liệu tính năng thời gian chạy.
15. **Phụ thuộc và kích thước:** Phụ thuộc vào Giai đoạn 0; **Lớn**.

### Giai đoạn 2 — Nền tảng chia sẻ phụ trợ

</ quy tắc.
3. **Điều kiện tiên quyết:** Giai đoạn 0–1; đã di chuyển cơ sở dữ liệu thử nghiệm dùng một lần.
4. **Các tệp/thư mục được lên kế hoạch:** `backend/src/config`, `db`, `shared/{errors,middleware,validation,logging,http,types}`, cộng với các thử nghiệm được chia sẻ tập trung.
5. **Nhiệm vụ triển khai:**

| ID | Thay đổi bị giới hạn | Các tập tin/mô-đun dự kiến ​​| Các phần bị đóng băng | Phụ thuộc vào | Điều kiện hoàn thành |
|---|---|---|---|---|---|
| RM-009 | Hoàn thiện xác thực cấu hình sản xuất, quy ước nhóm `pg` được chia sẻ, trình trợ giúp giao dịch khách hàng đã kiểm tra, kho lưu trữ nguyên thủy được tham số hóa, quy tắc ánh xạ số/dấu thời gian. | `config`, `db`, các loại kho/trợ giúp chia sẻ | Kiến trúc §§8…21993 tokens truncated…| Quản trị viên từ chối có lý do | RM-042 | RM-044 |
| `REJECTED -> DRAFT` | Chỉnh sửa thực sự có ý nghĩa | RM-023/RM-024 | RM-028 |
| `PENDING -> PENDING` | Chỉnh sửa thực sự có ý nghĩa | RM-023/RM-024 | RM-028 |
| `APPROVED -> PENDING` | Chỉnh sửa/thêm/xóa hình ảnh có ý nghĩa thực sự | RM-024, RM-029/RM-030 | RM-028, RM-032 |
| `APPROVED -> INACTIVE` | Chủ nhà vô hiệu hóa | RM-026 | RM-028 |
| `APPROVED -> HIDDEN` | Admin ẩn có lý do | RM-042 | RM-044 |
| `INACTIVE -> APPROVED` | Chủ nhà kích hoạt lại không thay đổi | RM-026 | RM-028 |
| `INACTIVE -> PENDING` | Chỉnh sửa/thêm/xóa hình ảnh có ý nghĩa thực sự | RM-024, RM-029/RM-030 | RM-028, RM-032 |
| `HIDDEN -> HIDDEN` | Chỉnh sửa/thêm/xóa hình ảnh | RM-024, RM-029/RM-030 | RM-028, RM-032 |
| `HIDDEN -> PENDING` | Chủ nhà nộp rõ ràng | RM-025 | RM-028 |
| `HIDDEN -> APPROVED` | Quản trị viên khôi phục | RM-042 | RM-044 |
| Bất kỳ trạng thái nào không thay đổi | Nội dung chuẩn hóa no-op hoặc thứ tự hình ảnh không hoạt động | RM-023, RM-031 | RM-028, RM-032 |

## 8. Chiến lược thử nghiệm

### Các lớp thử nghiệm gia tăng

1. **Kiểm tra đơn vị thuần túy:** Trình chuẩn hóa, trình xác thực, ma trận vòng đời, toán hộp giới hạn, ánh xạ DTO, kỳ vọng Haversine, tùy chọn cookie và chuẩn hóa phản hồi của nhà cung cấp.
2. **Kiểm tra dịch vụ:** Quyết định về vai trò/quyền sở hữu/trạng thái, hành vi không hoạt động, ngừng tra cứu, làm phong phú liên hệ, khả năng hiển thị yêu thích và bồi thường của nhà cung cấp bằng cách sử dụng kho lưu trữ/khách hàng giả chỉ khi điều đó cải thiện được lỗi nhắm mục tiêu.
3. **HTTP kiểm tra tích hợp:** Express ứng dụng cộng với kiểm tra đã di chuyển PostgreSQL để biết các phương pháp, đường dẫn, mã trạng thái, phong bì, cookie, Nguồn gốc, trường không xác định, xác thực tùy chọn/được bảo vệ và các phép chiếu.
4. **Kiểm tra tích hợp cơ sở dữ liệu:** Ràng buộc, giao dịch, khóa, xếp tầng/hạn chế thực tế, thứ tự giới hạn cộng một, Haversine SQL, và khôi phục do lỗi đưa vào.
5. **Kiểm tra hợp đồng nhà cung cấp:** Mô phỏng ranh giới Nominatim và Cloudinary HTTP/khách hàng; không phụ thuộc CI thông thường vào các nhà cung cấp trực tiếp.
6. **Kiểm tra giao diện người dùng:** Kiểm tra Thư viện về hành vi biểu mẫu/thành phần và Playwright cho một tập hợp luồng quan trọng nhỏ.
7. **Chấp nhận thủ công:** Quy trình làm việc trên máy tính để bàn/di động, thao tác bàn phím, tương tác bản đồ, cấu hình dàn dựng của nhà cung cấp thực tế, khôi phục lỗi và danh sách kiểm tra khói sản xuất.

### Ma trận quan trọng trong kinh doanh bắt buộc

- Xác thực: hành vi cookie bị thiếu, không hợp lệ, hết hạn, không hoạt động và tùy chọn.
- Ủy quyền: vai trò được phép của mọi điểm cuối, vai trò sai và hành vi của chủ sở hữu/không phải chủ sở hữu.
- Origin: các phương thức an toàn và mỗi phương thức không an toàn với Nguồn gốc được phép, bị thiếu và bị từ chối.
-  Quyền riêng tư: danh sách trường rõ ràng cho phép thu thập/chi tiết công khai, chi tiết về đối tượng thuê đang hoạt động, chi tiết về chủ sở hữu, mục yêu thích và dự đoán của quản trị viên.
- Vòng đời: mỗi hàng trong bảng phạm vi vòng đời, trạng thái nguồn không hợp lệ, hành động lặp lại và cập nhật không hoạt động.
- Giao dịch: nội dung/tiện ích/trạng thái, hình ảnh/trạng thái/dấu thời gian, kiểm duyệt/lịch sử và xóa/tầng.
- Đồng thời: danh sách cũ PATCH/hành động, kiểm duyệt đồng thời, thay đổi số lượng/thứ tự hình ảnh và xung đột xóa khó.
- Tìm kiếm: tất cả bộ lọc, TẤT CẢ tiện nghi, mã đã loại bỏ, giới hạn/nhóm bán kính, cặp tọa độ đã biết, khoảng cách chính xác, làm tròn, sắp xếp xác định, trang+1 và không có tổng số/N+1.
- Nhà cung cấp: tải lên thành công/bù lỗi DB, lỗi dọn dẹp sau khi cam kết xóa, Nominatim trống/hết thời gian/giới hạn tốc độ/chuẩn hóa.

Tỷ lệ phần trăm bảo hiểm không phải là sự thay thế cho bản phát hành. Nếu được đo lường, mức độ bao phủ chính sách/dịch vụ khoảng 0% là mục tiêu hữu ích, trong khi các ma trận trên yêu cầu các thử nghiệm rõ ràng bất kể tỷ lệ phần trăm tổng hợp là bao nhiêu.

## 9. Các mốc quan trọng

| Cột mốc quan trọng | Nhiệm vụ đã hoàn thành | Kết quả cuối cùng có thể chứng minh được |
|---|---|---|
| M1 — Cơ sở dữ liệu và nền tảng phụ trợ hoạt động | RM-001–RM-013 | Từ một lần kiểm tra rõ ràng, PostgreSQL nhận được chính xác lược đồ/hạt giống đã đông lạnh; chương trình phụ trợ khởi động, báo cáo tình trạng, phát ra các ID yêu cầu và thực thi các quy ước bảo mật/4 được chia sẻ. |
| M2 — Xác thực và hoàn tất hồ sơ người dùng | RM-014–RM-018 | Người thuê nhà và chủ nhà có thể đăng ký và tự động đăng nhập, đăng xuất/đăng nhập bằng cookie an toàn, đọc/cập nhật dữ liệu hồ sơ được phép và các tài khoản không hoạt động sẽ bị chặn. |
| M3 — Vòng đời danh sách chủ nhà đã hoàn tất | RM-019–RM-028 | Danh sách PATCH và các chính sách vòng đời đã hoàn tất; việc gửi được xác minh bằng các cơ sở dữ liệu hình ảnh được lưu trữ lâu dài; Tính đủ điều kiện của cơ sở dữ liệu xóa cứng, phân tầng và lưu giữ lịch sử kiểm duyệt đều được xác minh. Quy trình làm việc hoàn chỉnh từ hình ảnh để gửi/dọn dẹp nhà cung cấp chưa được xác nhận. |
| M4 — Hình ảnh và mã hóa địa lý hoàn chỉnh | RM-029–RM-034 | Chủ nhà có thể tạo bản nháp, tải lên hình ảnh, gửi nó, xóa/sắp xếp lại hình ảnh, thực hiện xóa cứng đủ điều kiện với nỗ lực dọn dẹp cao nhất và sử dụng mã hóa địa lý rõ ràng mà không làm mất dữ liệu bản nháp. |
| M5 — Khám phá công khai và các mục yêu thích hoàn tất | RM-035–RM-040 | Người dùng công cộng có thể duyệt/lọc/bản đồ/tìm kiếm bán kính và xem chi tiết gần đúng; người thuê đang hoạt động có thể xem liên hệ và quản lý các mục yêu thích nhận biết khả năng hiển thị. |
| M6 — Kiểm duyệt của quản trị viên hoàn tất | RM-041–RM-044 | Quản trị viên có thể xem lại danh sách, thực hiện tất cả bốn chuyển đổi kiểm duyệt nguyên tử, kiểm tra lịch sử và quản lý hoạt động của người thuê/chủ nhà với hiệu ứng hiển thị ngay lập tức. |
</ |
| M8 — MVP có thể triển khai đã được kiểm tra tích hợp | RM-053–RM-055 | Việc chấp nhận thủ công/tự động cơ sở dữ liệu mới có màu xanh lá cây và quá trình triển khai được ghi chép, an toàn trong sản xuất đã vượt qua các bước kiểm tra khói. |

## 10. Bản đồ phụ thuộc

```text
Phase 0
  -> Phase 1 database
  -> Phase 2 shared backend
      -> Phase 3 auth/users
          -> Phase 4 lookups/drafts
              -> Phase 5 lifecycle
                  -> Phase 6 images
                  -> Phase 7 geocoding
                  -> Phase 8 public discovery
                      -> Phase 9 favorites
                      -> Phase 10 admin moderation/users
                          -> Phase 11 frontend foundation
                              -> Phase 12 actor workflows
                                  -> Phase 13 verification
                                      -> Phase 14 deployment
```

Phụ thuộc cứng bổ sung:

- Việc di chuyển đi trước mọi kho lưu trữ.
- RM-012 phần mềm trung gian xác thực/vai trò đi trước mọi điểm cuối được bảo vệ.
- RM-024 chính sách vòng đời đi trước các hành động kiểm duyệt và đột biến nội dung hình ảnh.
- RM-035 tóm tắt/phép chiếu công khai đi trước các mục yêu thích truy xuất.
- RM-038 kiểm tra khả năng hiển thị công khai trước RM-043 chấp nhận khả năng hiển thị kích hoạt chủ sở hữu.
- Mỗi nhiệm vụ điểm cuối phụ trợ diễn ra trước người tiêu dùng giao diện người dùng Giai đoạn 11 của nó.
- Giai đoạn 12 chỉ bắt đầu sau khi bằng chứng chấp nhận M8 hoàn tất.

## 11. Đăng ký rủi ro

| Rủi ro | Giảm thiểu thực tế tương thích với thiết kế đông lạnh | Chủ sở hữu xác minh |
|---|---|---|
| Logic vòng đời khác nhau giữa PATCH, hình ảnh và hành động | Chính sách vòng đời của một danh sách; tất cả các dịch vụ đột biến đều gọi nó; kiểm tra bảng trạng thái đầy đủ. | RM-024, RM-028, RM-032, RM-044 |
| Rò rỉ dữ liệu công khai/riêng tư thông qua các phép nối hoặc các hàng thô | Phép chiếu SQL thu hẹp cộng với hàng/ứng dụng/API DTO riêng biệt và danh sách trường phản hồi cho phép. | RM-013, RM-038, RM-040, RM-044 |
| Giao dịch vô tình sử dụng các cuộc gọi nhóm hoặc nhiều khách hàng | Một người trợ giúp giao dịch chuyển khách hàng đã kiểm xuất một cách rõ ràng; kiểm tra khôi phục/phát hành ứng dụng khách và danh sách kiểm tra đánh giá mã. | RM-009, RM-028, RM-032, RM-044 |
| N+1 tải hình ảnh/tiện ích | Truy vấn tổng hợp hoặc tải số lượng lớn có giới hạn trên mỗi trang đã chọn; kiểm tra số lượng truy vấn; không có cuộc gọi kho lưu trữ trên mỗi hàng. | RM-035, RM-038 |
| PostgreSQL `numeric` âm thầm trả về các chuỗi hoặc ép buộc thuê | Xác thực số nguyên/tỷ lệ trước SQL và cố tình ánh xạ các giá trị an toàn đã được phê duyệt; kiểm tra ánh xạ/ràng buộc. | RM-009, RM-022, RM-038 |
| Lỗi hộp giới hạn/Haversine | Một trình trợ giúp hộp giới hạn TypeScript, một biểu thức kho lưu trữ, `6371.0088`, kẹp giá trị trung gian, kiểm tra tọa độ đã biết. | RM-036, RM-038 |
| Cloudinary/lỗi một phần cơ sở dữ liệu | Bồi thường tải lên, dọn dẹp xóa sau khi cam kết, nhật ký lỗi có cấu trúc và không có yêu cầu thử lại/nguyên tử mù quáng. | RM-029–RM-032 |
| Nominatim không có sẵn hoặc bị giới hạn tỷ lệ | Yêu cầu chỉ rõ ràng, hết thời gian chờ, xác định tiêu đề, điều chỉnh theo từng người dùng/nhà cung cấp, UX trống/lỗi và vị trí ghim thủ công. | RM-033, RM-034, RM-051 |
| Cookie/CORS/Origin không khớp giữa các môi trường | Cấu trúc liên kết sản xuất cùng một trang, cấu hình nguồn gốc chính xác, máy khách/CORS nhận biết thông tin xác thực, cookie chỉ dành cho máy chủ, kiểm tra cấu hình phủ định. | RM-011, RM-014, RM-045, RM-055 |
| Xói mòn phạm vi trong 8 tuần | Thực thi đường cắt, một nhiệm vụ cho mỗi lời nhắc/cam kết, không có sự trừu tượng mang tính suy đoán và các bản demo quan trọng trước khi đánh bóng. | Toàn bộ lộ trình |

## 12. Đường cắt MVP

### Không được phép xóa

- Đăng ký/đăng nhập/đăng xuất, xử lý cookie an toàn và thực thi hoạt động tài khoản.
- Ủy quyền vai trò và quyền sở hữu, xác thực nguồn gốc, xác thực yêu cầu và dự đoán quyền riêng tư.
- Liệt kê các bản nháp, quy tắc chỉnh sửa/không hoạt động, mọi chuyển đổi vòng đời/kiểm duyệt, hạn chế xóa cứng và kiểm soát giao dịch/đồng thời.
- Cloudinary image tải lên/xóa/sắp xếp lại, quy tắc đếm/loại/kích thước và xử lý lỗi một phần.
- Mã hóa địa lý Nominatim rõ ràng với đường dẫn chỉnh sửa vị trí thủ công.
- Tìm kiếm công khai/chi tiết thống nhất với khả năng hiển thị của chủ nhà đang hoạt động, giới hạn/bán kính/hành vi Haversine và tọa độ gần đúng.
- Làm phong phú liên hệ của người thuê và các mục yêu thích ngữ nghĩa.
- Kiểm duyệt/lịch sử quản trị viên và kích hoạt người thuê/chủ nhà.
- Các thử nghiệm quan trọng trong kinh doanh gia tăng và kiểm tra bảo mật triển khai.

### Độ bóng có thể giảm

- Sàng lọc trực quan ngoài một giao diện rõ ràng, phản hồi nhanh và dễ tiếp cận.
- Hoạt ảnh tải nâng cao; giữ lại các trạng thái tải dễ hiểu.
- Sự trừu tượng hóa thành phần tái sử dụng không cần thiết; giữ lại các nguyên mẫu gốc API/auth/error/map được chia sẻ.
- Hỗ trợ soạn thảo văn bản thay thế tùy chọn mở rộng; giữ lại bộ nhớ, xác thực, hiển thị và hướng dẫn thay thế có ý nghĩa cơ bản.
- Các cử chỉ hoặc tiện ích bản đồ phức tạp vượt quá hành vi giới hạn/bán kính đã được phê duyệt, làm mới rõ ràng, điều chỉnh ghim thủ công và tính chẵn lẻ của danh sách có thể sử dụng.

Hành vi bảo mật, vòng đời, quyền riêng tư, giao dịch, lỗi, cơ sở trợ năng và xác thực bắt buộc không bao giờ được coi là sự đánh bóng.

## 13. Định nghĩa Hoàn thành

Một nhiệm vụ chỉ được thực hiện khi:

- Hành vi cố định giới hạn của nó được triển khai mà không có những thay đổi không liên quan.
- Các tệp dự kiến của nó vẫn nằm trong bốn mô-đun/cơ sở hạ tầng dùng chung/máy khách tích hợp/cấu trúc giao diện người dùng đã được phê duyệt.
- Kiểm tra kiểu, kiểm tra lint/định dạng và các bài kiểm tra liên quan đã vượt qua.
- Các nhánh quan trọng trong kinh doanh mới có các bài kiểm tra đơn vị/dịch vụ/HTTP/cơ sở dữ liệu thích hợp lớp.
- Lỗi, mã trạng thái, phong bì, trường DTO, thứ tự, phân trang, tính tạm thời và hành vi no-op phù hợp với hợp đồng API.
- Lệnh ủy quyền, kiểm tra tài khoản đang hoạt động, `404` trong phạm vi chủ sở hữu, Nguồn gốc không an toàn và danh sách cho phép trường quyền riêng tư đều được xem xét.
- Quy trình làm việc nhiều lần ghi sử dụng một lần kiểm xuất khách hàng và thực hiện kiểm tra khôi phục/thất bại.
- Công việc của nhà cung cấp tuân theo chính sách đền bù/hậu cam kết chính xác.
- Không giới thiệu di chuyển, điểm cuối, bảng, cột, mô-đun, dịch vụ cơ sở hạ tầng hoặc tính năng sản phẩm ngoài phạm vi cố định.
- Tài liệu/nhận xét chỉ được cập nhật khi chúng giải thích hành vi đã triển khai; thông số kỹ thuật cố định không được sửa đổi.
- Nhiệm vụ có thể được thể hiện độc lập và phù hợp với một cam kết mạch lạc.

MVP chỉ được thực hiện khi tất cả các điều kiện từ RM-001 đến RM-055, M8 và danh sách kiểm tra mức độ sẵn sàng cuối cùng được thỏa mãn.

## 14. Đề xuất chiến lược cam kết thực hiện

- Sử dụng một ID tác vụ cho mỗi lần xác nhận theo mặc định: `RM-023: implement normalized listing patch`.
- Một tác vụ chỉ có thể sử dụng hai lần xác nhận khi tách một thay đổi lược đồ/công cụ xác định khỏi việc xác minh của nó giúp cải thiện đáng kể việc xem xét; cả hai cam kết đều giữ lại cùng một ID nhiệm vụ.
- Không kết hợp các nhiệm vụ phụ trợ, giao diện người dùng, cơ sở dữ liệu hoặc nhà cung cấp không liên quan.
- Giữ các thử nghiệm trong cùng một cam kết như hành vi mà chúng xác minh.
- Xem lại `git diff` trước mỗi cam kết và duy trì các thay đổi của người dùng không liên quan.
- Không bao giờ viết lại quá trình di chuyển đã được chia sẻ. Thêm một quá trình di chuyển về phía trước gắn liền với nhiệm vụ sửa lỗi.
- Gắn thẻ hoặc ghi lại các mốc quan trọng cam kết M1–M8 sau khi kết quả có thể chứng minh được của chúng trôi qua.
- Chạy bộ nhiệm vụ hẹp trong quá trình phát triển và bộ tích lũy đầy đủ ở các ranh giới giai đoạn và mốc quan trọng.
- Các lời nhắc của Codex sau này nên đặt tên cho một nhiệm vụ RM, trích dẫn lộ trình này và các thông số kỹ thuật cố định, nghiêm cấm liền kề một cách rõ ràng nhiệm vụ, đồng thời yêu cầu điều kiện và bài kiểm tra đã hoàn thành của nhiệm vụ.

## 15. Danh sách kiểm tra sẵn sàng cuối cùng

Trước khi bắt đầu triển khai:

� các quá trình di chuyển/phần mềm trung gian/mô-đun trước đó đã hoàn tất và xanh.
- [ ] Cơ sở dữ liệu/mô phỏng nhà cung cấp thử nghiệm cần thiết cho tác vụ đều có sẵn.

Trước khi triển khai:

� điểm cuối cùng với `GET /api/health` riêng biệt được đăng ký.
- [ ] Mọi quá trình chuyển đổi vòng đời và đường dẫn không hợp lệ/lặp lại đều vượt qua.
- [ ] Ma trận xác thực/vai trò/quyền sở hữu/hoạt động/Nguồn gốc đều vượt qua.
- [ ] Danh sách cho phép chiếu công khai, đối tượng thuê, chủ sở hữu, yêu thích và quản trị viên đều vượt qua.
- [ ] Tìm kiếm các bài kiểm tra giới hạn/bán kính/Haversine/làm tròn/sắp xếp/phân trang vượt qua mà không có tổng số lượng hoặc hành vi N+1.
- [ ] Cloudinary và Nominatim thành công/thất bại/giới hạn tỷ lệ/bồi thường vượt qua.
- [ ] Quy trình làm việc của tác nhân quan trọng đáp ứng và chấp nhận thủ công pass.
- [ ] Sản xuất HTTPS, cấu trúc liên kết cùng một trang, cookie an toàn chỉ dành cho máy chủ, CORS chính xác và các biện pháp kiểm soát Nguồn gốc đã được xác minh.
- [ ] Di chuyển sản xuất, tra cứu hạt giống, cung cấp quản trị viên được kiểm soát, sao lưu/khôi phục, thông tin xác thực của nhà cung cấp, kiểm tra khói và tài liệu của nhà điều hành đã được xác minh.

Không có công việc triển khai nào được bắt đầu chỉ vì lộ trình này tồn tại; việc triển khai chỉ bắt đầu thông qua một yêu cầu nhiệm vụ bị giới hạn sau đó.
