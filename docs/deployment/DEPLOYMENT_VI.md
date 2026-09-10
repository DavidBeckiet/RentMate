# RentMate hướng dẫn triển khai

> Tài liệu này mô tả đường triển khai production của compatibility backend được giữ lại. Với topology microservices
> dùng cho demo tốt nghiệp hiện tại (Gateway `:4001`, Identity, Listing, Engagement, Verification Delivery và
> PostgreSQL), hãy dùng [LOCAL_DEMO_RUNBOOK.md](LOCAL_DEMO_RUNBOOK.md). Không dùng tài liệu này để khởi động demo local.

Hướng dẫn này mô tả bản phát hành sản xuất trung lập với nền tảng. Nó không chọn nhà cung cấp dịch vụ lưu trữ, miền, cơ sở dữ liệu,
tài khoản nhà cung cấp hoặc nhà điều hành dự phòng. Việc diễn tập cấu hình thành công không phải là bằng chứng cho thấy quá trình sản xuất đã được triển khai.

## Cấu trúc liên kết sản xuất

```text
Browser
  -> HTTPS Next.js frontend
       -> HTTPS Express API
            -> PostgreSQL
       -> OpenStreetMap tiles and Cloudinary delivery URLs

Express API
  -> Cloudinary management API
  -> Nominatim forward-geocoding API
```

Giao diện người dùng và API phải cùng một trang. Các hình dạng được hỗ trợ là một máy chủ HTTPS có lưu lượng truy cập API được ủy quyền ngược hoặc
các giao diện người dùng/API tên miền phụ riêng biệt dưới cùng một cấp độ gốc có thể đăng ký. Không triển khai chúng trên các trang web không liên quan mà không có đánh giá kiến ​​trúc riêng biệt. Cùng một trang web không yêu cầu cùng một nguồn gốc: các tên miền phụ hoặc cổng khác nhau có nguồn gốc khác nhau, vì vậy phần phụ trợ vẫn cần nguồn gốc chính xác của giao diện người dùng.

Cookie `rentmate_session` chỉ dành cho máy chủ vì `Domain` bị bỏ qua. Đó là `HttpOnly`, `Secure`, `SameSite=Lax`,
và `Path=/`. Trình duyệt API yêu cầu sử dụng `credentials: "include"`; JavaScript giao diện người dùng không bao giờ đọc JWT và không có quy trình làm việc của trình duyệt mã thông báo 
Bearer. Express chỉ cho phép xác thực CORS đối với `FRONTEND_ORIGIN` chính xác, không bao giờ `*`, và
yêu cầu `Origin` chính xác đó đối với các yêu cầu `POST`, `PUT`, `PATCH` và `DELETE`.

## Ma trận môi trường

Điền cấu hình triển khai thông qua cấu hình nền tảng/kho bí mật. `.env.production.example` là một
 khoảng không quảng cáo an toàn, không phải là một tập tin để điền và cam kết.

|Biến|Thành phần|Yêu cầu|Phân loại|Xác nhận hoặc mục đích|Người sở hữu|
|---|---|---:|---|---|---|
|`NODE_ENV`|Phần phụ trợ|Đúng|Cấu hình công khai|Chính xác `production`|Toán tử phát hành|
|`PORT`|Phần phụ trợ|Đúng|Cấu hình công khai|Số nguyên 1–65535|Nhà điều hành nền tảng|
|`FRONTEND_ORIGIN`|Phần phụ trợ|Đúng|Cấu hình công khai|HTTPS chính xác nguồn gốc; không có đường dẫn/truy vấn/băm/thông tin xác thực/ký tự đại diện|Toán tử phát hành|
|`LOG_LEVEL`|Phần phụ trợ|Đúng|Cấu hình công khai|`debug`, `info`, `warn` hoặc `error`|Chủ sở hữu hoạt động|
|`DB_HOST`|Phần phụ trợ|Đúng|Cấu hình nhạy cảm|Chỉ tên máy chủ/IP; không có URL hoặc thông tin xác thực|Chủ sở hữu cơ sở dữ liệu|
|`DB_PORT`|Phần phụ trợ|Đúng|Cấu hình công khai|Số nguyên 1–65535|Chủ sở hữu cơ sở dữ liệu|
|`DB_NAME`|Phần phụ trợ|Đúng|Cấu hình nhạy cảm|Tên cơ sở dữ liệu sản xuất|Chủ sở hữu cơ sở dữ liệu|
|`DB_USER`|Phần phụ trợ|Đúng|Cấu hình nhạy cảm|Người dùng ứng dụng có ít đặc quyền nhất|Chủ sở hữu cơ sở dữ liệu|
|`DB_PASSWORD`|Phần phụ trợ|Đúng|Bí mật|Không trống, không giữ chỗ, không mặc định phát triển|Chủ sở hữu cơ sở dữ liệu|
|`DB_POOL_MAX`|Phần phụ trợ|Đúng|Cấu hình công khai|Số nguyên 1–100|Chủ sở hữu cơ sở dữ liệu|
|`DB_CONNECTION_TIMEOUT_MS`|Phần phụ trợ|Đúng|Cấu hình công khai|Số nguyên 1–60000|Chủ sở hữu cơ sở dữ liệu|
|`DB_IDLE_TIMEOUT_MS`|Phần phụ trợ|Đúng|Cấu hình công khai|Số nguyên 1000–600000|Chủ sở hữu cơ sở dữ liệu|
|`JWT_SECRET`|Phần phụ trợ|Đúng|Bí mật|entropy cao; không giữ chỗ; không phát triển mặc định|Chủ sở hữu bảo mật|
|`JWT_EXPIRES_IN_SECONDS`|Phần phụ trợ|Đúng|Chính sách công|Chính xác `7200`|Chủ sở hữu bảo mật|
|`BCRYPT_COST`|Phần phụ trợ|Đúng|Chính sách công|Số nguyên 4–31; mặc định sản xuất `12`|Chủ sở hữu bảo mật|
|`COOKIE_SECURE`|Phần phụ trợ|Đúng|Chính sách công|Chính xác `true`|Chủ sở hữu bảo mật|
|`CLOUDINARY_CLOUD_NAME`|Phần phụ trợ|Đúng|Cấu hình nhạy cảm|Không trống/không giữ chỗ|Chủ sở hữu nhà cung cấp|
|`CLOUDINARY_API_KEY`|Phần phụ trợ|Đúng|Bí mật|Không trống/không giữ chỗ|Chủ sở hữu nhà cung cấp|
|`CLOUDINARY_API_SECRET`|Phần phụ trợ|Đúng|Bí mật|Không trống/không giữ chỗ|Chủ sở hữu nhà cung cấp|
|`NOMINATIM_BASE_URL`|Phần phụ trợ|Đúng|Cấu hình công khai|URL cơ sở HTTPS tuyệt đối không có thông tin xác thực/truy vấn/băm|Chủ sở hữu nhà cung cấp|
|`NOMINATIM_USER_AGENT`|Phần phụ trợ|Đúng|Danh tính công cộng|Xác định RentMate và liên hệ với nhà điều hành|Chủ sở hữu nhà cung cấp|
|`MAX_IMAGES_PER_LISTING`|Phần phụ trợ|Đúng|Chính sách đóng băng|Chính xác `8`|Toán tử phát hành|
|`MAX_IMAGE_BYTES`|Phần phụ trợ|Đúng|Chính sách đóng băng|Chính xác `5242880`|Toán tử phát hành|
|`DEPLOYMENT_REGION`|Phần phụ trợ|Đúng|Chính sách đóng băng|Chính xác `HO_CHI_MINH_CITY_VN`|Toán tử phát hành|
|`MAX_SEARCH_RADIUS_KM`|Phần phụ trợ|Đúng|Chính sách đóng băng|Chính xác `50`|Toán tử phát hành|
|`NEXT_PUBLIC_API_BASE_URL`|Xây dựng/khói giao diện người dùng|Đúng|Cấu hình công khai|Chính xác nguồn gốc phi địa phương HTTPS API; nướng vào thời điểm xây dựng|Toán tử phát hành|
|`RENTMATE_ADMIN_EMAIL`|Cung cấp|Khi cung cấp|Đầu vào nhạy cảm|Email quản trị viên được kiểm soát hợp lệ|Chủ sở hữu bảo mật|
|`RENTMATE_ADMIN_PASSWORD`|Cung cấp|Khi cung cấp|Bí mật|8+ ký tự, tối đa 72 UTF-8 byte|Chủ sở hữu bảo mật|
|`RENTMATE_ADMIN_PHONE_E164`|Cung cấp|KHÔNG|Đầu vào nhạy cảm|Điện thoại trống hoặc E.164|Chủ sở hữu bảo mật|
|`RENTMATE_SMOKE_TENANT_EMAIL`|Khói|Đúng|Đầu vào nhạy cảm|Email dành riêng cho đối tượng thuê đang hoạt động|chủ khói thuốc|
|`RENTMATE_SMOKE_TENANT_PASSWORD`|Khói|Đúng|Bí mật|Mật khẩu người thuê chuyên dụng|chủ khói thuốc|
|`RENTMATE_SMOKE_LANDLORD_EMAIL`|Khói|Đúng|Đầu vào nhạy cảm|Email chủ nhà đang hoạt động chuyên dụng|chủ khói thuốc|
|`RENTMATE_SMOKE_LANDLORD_PASSWORD`|Khói|Đúng|Bí mật|Mật khẩu chủ nhà chuyên dụng|chủ khói thuốc|
|`RENTMATE_SMOKE_ADMIN_EMAIL`|Khói|Đúng|Đầu vào nhạy cảm|Email quản trị viên hoạt động chuyên dụng|chủ khói thuốc|
|`RENTMATE_SMOKE_ADMIN_PASSWORD`|Khói|Đúng|Bí mật|Mật khẩu quản trị viên chuyên dụng|chủ khói thuốc|
|`RENTMATE_SMOKE_PUBLIC_LISTING_ID`|Khói|Đúng|Đầu vào nhạy cảm|ID tích cực của danh sách công khai hiện đã biết|chủ khói thuốc|
|`RENTMATE_PROVIDER_CHECK_ADDRESS`|Kiểm tra nhà cung cấp|Đúng|Ý kiến ​​đóng góp của công chúng|Một 1–500 ký tự Địa chỉ TP.HCM|Chủ sở hữu nhà cung cấp|

`TEST_DATABASE_URL` chỉ dành cho thử nghiệm và không được có trong cấu hình thời gian chạy sản xuất.

## Cài đặt, xác thực, xây dựng và bắt đầu

Sử dụng các phiên bản Node.js/npm được ghim và các tệp khóa bất biến:

```powershell
npm.cmd ci
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
```

Xác thực cấu hình sản xuất mà không cần kết nối với PostgreSQL hoặc nhà cung cấp:

```powershell
npm.cmd run deploy:validate
```

Điều này chỉ kiểm tra cấu hình. Nó không chứng minh tính khả dụng của DNS, TLS, cơ sở dữ liệu, nhà cung cấp hoặc ứng dụng.

`NEXT_PUBLIC_API_BASE_URL` phải được cung cấp khi giao diện người dùng được xây dựng:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "https://api.rentmate.example"
npm.cmd run build
```

Giá trị được công khai và đưa vào tạo phẩm Next.js. Việc thay đổi nguồn gốc API yêu cầu phải xây dựng lại giao diện người dùng; thay đổi
chỉ môi trường thời gian chạy sau khi xây dựng không ghi lại tạo phẩm.

Bắt đầu các đơn vị triển khai được xây dựng trong trình quản lý quy trình nền tảng:

```powershell
npm.cmd --prefix backend run start
npm.cmd --prefix frontend run start
```

Các cửa hàng giới hạn tốc độ MVP nằm trong bộ nhớ và quy trình cục bộ. Chạy chính xác một quy trình phụ trợ trong sản xuất trừ khi thay đổi kiến ​​trúc trong tương lai đưa ra bộ giới hạn dùng chung. Đừng thêm Redis như một giải pháp RM-055.

## API hướng dẫn sử dụng

- Các tuyến sản phẩm sử dụng `/api/v1`; sức khỏe là `GET /api/health`.
- Tìm kiếm công khai/chi tiết không yêu cầu phiên. Điểm cuối của người thuê, chủ nhà và quản trị viên thực thi các vai trò được ghi trong tài liệu của họ.
- Yêu cầu trình duyệt sử dụng `credentials: "include"`; cookie HttpOnly chỉ dành cho máy chủ mang phiên.
- JavaScript không được đọc/lưu trữ JWT hoặc tạo mã thông báo Bearer.
- Các phương thức không an toàn gửi giao diện người dùng được định cấu hình chính xác `Origin` và bị từ chối nếu không có nó.
- Địa chỉ/tọa độ chính xác là trường chủ sở hữu/quản trị viên. Chi tiết công khai ẩn danh vẫn đảm bảo quyền riêng tư; Thông tin liên hệ của chủ nhà
 chỉ dành cho người thuê nhà đang hoạt động trên thông tin chi tiết hiện được công khai.

## Chính sách phát hành di chuyển

Khởi động ứng dụng không bao giờ thực hiện di chuyển. Một toán tử phát hành có tên sở hữu việc thực hiện di chuyển. Các tệp di chuyển được ứng dụng
 là bất biến và phiên bản đã triển khai hiện tại nằm trong bản ghi phát hành bên ngoài—không phải bảng lược đồ thứ chín.
Luôn tạo và ghi lại bản sao lưu đã được xác minh trước khi áp dụng SQL di chuyển.

### Cơ sở dữ liệu mới

Xác minh rằng cơ sở dữ liệu đích là mới và trống, sau đó xem trước gói kho lưu trữ:

```powershell
npm.cmd run migrate:clean -- --plan-only
```

Khởi động lại cơ sở dữ liệu sạch bằng cách sử dụng các giá trị môi trường cơ sở dữ liệu/quản trị viên được bảo vệ:

```powershell
npm.cmd run db:bootstrap
npm.cmd run db:verify
```

`db:bootstrap` áp dụng di chuyển `0001`–`0012`, điều chỉnh năm loại thuộc tính và mười hai tiện nghi, xác minh
chính xác lược đồ hai enum/tám bảng và cung cấp cho quản trị viên được kiểm soát. Không có lệnh reseed riêng biệt.

Nếu việc cung cấp quản trị viên phải được lặp lại một cách độc lập:

```powershell
npm.cmd run admin:provision
```

Quản trị viên đang hoạt động tương tự là người không hoạt động; quản trị viên không hoạt động hoặc email của người thuê nhà/chủ nhà là một lỗi an toàn. Không có đăng ký công khai
admin. Không bao giờ đăng nhập hoặc đặt `RENTMATE_ADMIN_PASSWORD` trên một dòng lệnh.

### Cơ sở dữ liệu hiện có

Ghi lại phiên bản di chuyển hiện được áp dụng trong tệp kê khai JSON do nhà điều hành sở hữu bên ngoài giản đồ sản phẩm. Xem trước:

```powershell
npm.cmd run migrate:existing -- --manifest <external-version-record.json> --plan-only
```

Sau khi phê duyệt bản sao lưu, chỉ áp dụng các lần di chuyển mới hơn:

```powershell
npm.cmd run migrate:existing -- --manifest <external-version-record.json>
npm.cmd run db:verify
```

Chỉ nâng cao bản ghi phiên bản bên ngoài sau khi di chuyển và xác minh lược đồ thành công. Một bảng kê khai/lược đồ
điều kiện tiên quyết không khớp sẽ dừng việc phát hành; không được phép chạy lại các lần di chuyển cũ hoặc chỉnh sửa tệp SQL được áp dụng.

## Sao lưu và khôi phục

Trước khi di chuyển, hãy xác minh danh tính cơ sở dữ liệu nguồn và tạo bản sao lưu PostgreSQL có định dạng tùy chỉnh bên ngoài kho lưu trữ. Cung cấp mật khẩu thông qua bí mật nền tảng hoặc `PGPASSFILE` được bảo vệ, không bao giờ là đối số lệnh:

```powershell
pg_dump --host <db-host> --port <db-port> --username <backup-user> --dbname <source-db> `
  --format=custom --file <encrypted-external-path/release.backup>
```

Ghi lại mã định danh dự phòng, danh tính cơ sở dữ liệu nguồn, kích thước khác 0, vị trí/tham chiếu lưu trữ được mã hóa, chính sách lưu giữ và khôi phục chủ sở hữu trong danh sách kiểm tra phát hành.

Khôi phục diễn tập và khôi phục luôn nhắm mục tiêu cơ sở dữ liệu thay thế trống mới, không bao giờ là nguồn:

```powershell
pg_restore --host <db-host> --port <db-port> --username <restore-user> --dbname <new-empty-db> `
  --exit-on-error --single-transaction --no-owner --no-acl <release.backup>
npm.cmd run db:verify
```

Chạy kiểm tra đọc/khói đại diện đối với việc thay thế. Không chuyển đổi lưu lượng truy cập sản xuất cho đến khi lược đồ và read
pass và chủ sở hữu khôi phục chấp thuận thay đổi kết nối có chủ ý.

## Nhà cung cấp và khói thuốc

Kết nối nhà cung cấp là một hành động mạng rõ ràng, không bao giờ có hành vi khởi động/xây dựng/kiểm tra:

```powershell
npm.cmd run providers:check
```

Cloudinary sử dụng `api.ping()` được xác thực không thay đổi. Nominatim thực hiện chính xác một mã địa lý chuyển tiếp có giới hạn với
Tác nhân người dùng nhận dạng đã định cấu hình, giới hạn năm ứng viên, hết thời gian chờ và không tự động thử lại. Đầu ra chỉ chứa
PASS/FAIL và số lượng ứng viên, không chứa thông tin xác thực hoặc trọng tải của nhà cung cấp thô.

Sau khi triển khai HTTPS thực sự tồn tại, hãy chạy khói sản xuất không phá hủy:

```powershell
npm.cmd run smoke:production
```

Nó kiểm tra điểm đánh dấu giao diện người dùng, tình trạng, quyền riêng tư tìm kiếm công khai/chi tiết, đọc mục yêu thích của người thuê, đọc danh sách chủ nhà, đọc hàng đợi quản trị, thuộc tính cookie sản xuất, CORS được chứng nhận và đăng xuất. Nó không thực hiện đăng ký, liệt kê/yêu thích/
kiểm duyệt/kích hoạt/đột biến hình ảnh và không bao giờ giải mã hoặc in cookie.

## Phục hồi

- Trước khi có bất kỳ thay đổi lược đồ nào, hãy dừng triển khai khi kiểm tra xác thực, sao lưu, nhà cung cấp hoặc kế hoạch không thành công.
- Nếu lược đồ đã triển khai vẫn tương thích với ứng dụng, chỉ quay trở lại tạo phẩm ứng dụng đã ghi trước đó.
- Nếu cần khôi phục cơ sở dữ liệu, hãy khôi phục bản sao lưu trước khi phát hành vào cơ sở dữ liệu thay thế mới, chạy `db:verify` và
 đọc đại diện, sau đó cố tình chuyển kết nối ứng dụng sau khi phê duyệt.
- Không bao giờ chỉnh sửa di chuyển đã áp dụng, di chuyển xuống một cách mù quáng, thả lược đồ sản xuất hoặc khôi phục qua DB nguồn.

Sử dụng [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) làm bằng chứng phát hành và hồ sơ phê duyệt.
