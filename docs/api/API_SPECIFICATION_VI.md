# RentMate MVP API Đặc điểm kỹ thuật v1

## 1. Mục đích và phạm vi

Tài liệu này là hợp đồng HTTP có thẩm quyền cho RentMate MVP. Nó đóng băng API được yêu cầu bởi các đặc tả Yêu cầu, Kiến trúc và Thiết kế Cơ sở dữ liệu đã được phê duyệt.

Hợp đồng bao gồm xác thực, dữ liệu liên hệ của người dùng hiện tại, tra cứu có kiểm soát, khám phá danh sách công khai, quản lý danh sách chủ nhà, hình ảnh danh sách, mã hóa địa lý chuyển tiếp, mục yêu thích của người thuê, kiểm duyệt quản trị viên, lịch sử kiểm duyệt và kích hoạt tài khoản cơ bản của người thuê/chủ nhà.

RentMate vẫn là một khối mô-đun Express/TypeScript duy nhất phục vụ giao diện người dùng Next.js. PostgreSQL là cơ sở dữ liệu ứng dụng có thẩm quyền. Cloudinary và Nominatim là các máy khách tích hợp bên ngoài. Không có điểm cuối nào trong đặc tả này hàm ý một dịch vụ, bảng cơ sở dữ liệu hoặc tính năng sản phẩm bổ sung.

## 2. Đường dẫn cơ sở và phiên bản

- Tất cả các điểm cuối của sản phẩm MVP đều sử dụng `/api/v1`.
- Health vẫn là phiên bản `GET /api/health`.
- Việc thay đổi hợp đồng vi phạm yêu cầu phiên bản API trong tương lai. Các bản sửa lỗi triển khai bổ sung giúp duy trì hợp đồng này thì không.
- Các trường JSON thông thường sử dụng `camelCase`.
- Tên cơ sở dữ liệu `snake_case` là nội bộ và không được rò rỉ vào API phản hồi.
- Vai trò, trạng thái liệt kê, hành động kiểm duyệt và mã tra cứu được kiểm soát sử dụng chữ hoa `SNAKE_CASE`.
- Dấu thời gian là các chuỗi ISO-8601 UTC, chẳng hạn như `2026-07-29T08:30:00.000Z`.

## 3. Xác thực và hành vi cookie

### 3.1 Đăng nhập danh tính

- Mọi tài khoản đều yêu cầu email.
- Email được cắt bớt, viết thường và sử dụng làm mã định danh đăng nhập duy nhất.
- Email không thể thay đổi thông qua tất cả các API MVP.
- Đăng ký công khai chỉ khả dụng cho `TENANT` và `LANDLORD`.
- `ADMIN` tài khoản được cung cấp bên ngoài API.
- Điện thoại không phải là mã định danh đăng nhập và cũng không phải duy nhất.
- Cần có điện thoại của chủ nhà. Điện thoại của người thuê là tùy chọn.

### 3.2 Mật khẩu

- Tối thiểu: 8 ký tự.
- Tối đa: 72 UTF-8 byte trước khi băm bcrypt.
- Mật khẩu và hàm băm mật khẩu không bao giờ xuất hiện trong phản hồi, lỗi hoặc nhật ký.

### 3.3 JWT cookie

Cookie xác thực có tên `rentmate_session`.

|Thuộc tính|Giá trị|
|---|---|
|Mã thông báo|Đã ký JWT|
|Trọn đời|2 giờ|
|`HttpOnly`|`true`|
|`SameSite`|`Lax`|
|`Secure`|`true` trong sản xuất; `false` chỉ dành cho phát triển HTTP địa phương|
|`Path`|`/`|
|`Domain`|Đã bỏ qua, duy trì hành vi chỉ dành cho máy chủ|

JWT chỉ chứa mã định danh người dùng, vai trò, thời điểm phát hành và thời hạn sử dụng mà MVP yêu cầu. JWT không bao giờ được trả về trong JSON. Đăng ký và đăng nhập đặt cùng một cookie. Đăng xuất sẽ xóa nó bằng cách sử dụng các thuộc tính cookie phù hợp.

Không có mã thông báo làm mới hoặc hàng phiên phía máy chủ. Giao diện người dùng gửi `credentials: "include"`.

### 3.4 Phiên đăng ký

Đăng ký người thuê nhà hoặc chủ nhà thành công sẽ tạo tài khoản và ngay lập tức tạo phiên xác thực thông thường. Phản hồi `201 Created` trả về hồ sơ người dùng và đặt `rentmate_session`.

### 3.5 Xác thực tùy chọn trên các tuyến công cộng

- Không có cookie: xử lý ẩn danh.
- Hợp lệ JWT cho một hoạt động hiện đang hoạt động `TENANT`: nội dung phong phú chỉ dành cho người thuê có thể được trả về khi có tài liệu rõ ràng.
- Hợp lệ `LANDLORD` hoặc `ADMIN`: trả về phép chiếu công khai thông thường trên các tuyến công cộng.
- Cookie không hợp lệ hoặc đã hết hạn: xử lý ẩn danh.
- Cookie thuộc một tài khoản không hoạt động: xử lý ẩn danh.

Xác thực tùy chọn phải xác minh JWT trước khi sử dụng xác nhận quyền sở hữu và phải xác minh hoạt động tài khoản hiện tại trước khi trả về các trường chỉ dành cho đối tượng thuê. Xác thực tùy chọn không hợp lệ không bao giờ mở khóa dữ liệu riêng tư.

Các tuyến được bảo vệ quay lại `401 Unauthorized` khi xác thực bị thiếu, không hợp lệ, hết hạn hoặc thuộc về tài khoản không hoạt động.

## 4. Quy ước cấp phép và tiết lộ tài nguyên

Việc kiểm tra ủy quyền diễn ra theo thứ tự sau nếu có:

1. Xác thực và xác nhận tài khoản đang hoạt động.
2. Xác nhận vai trò được yêu cầu.
3. Định vị tài nguyên bằng phạm vi được ủy quyền.
4. Xác nhận quyền sở hữu và các quy tắc vòng đời hiện tại.

Hành vi tiết lộ đông lạnh:

- Thiếu xác thực trên tuyến được bảo vệ: `401`.
- Người dùng được xác thực với vai trò sai: `403` trước khi tra cứu tài nguyên riêng.
- Yêu cầu không an toàn với quyền được phép không hợp lệ hoặc bị thiếu `Origin`: `403`.
- Chủ nhà không phải là chủ sở hữu yêu cầu danh sách trong phạm vi chủ sở hữu hoặc hình ảnh lồng nhau: `404`.
- Chi tiết công khai về danh sách không công khai: `404`.
- Mục tiêu thêm yêu thích không được công khai: `404`.
- Quản trị viên cố gắng kích hoạt hoặc hủy kích hoạt `ADMIN`: `403`.

Hành vi trong phạm vi chủ sở hữu cố tình tránh việc xác nhận xem tài nguyên riêng của chủ nhà khác có tồn tại hay không.

## 5. Quy ước yêu cầu và phản hồi

### 5.1 Tiêu đề

- Các yêu cầu JSON sử dụng `Content-Type: application/json`.
- Tải hình ảnh lên sử dụng `multipart/form-data`.
- Các phương pháp không an toàn (`POST`, `PUT`, `PATCH` và `DELETE`) yêu cầu `Origin`.
- Các yêu cầu trình duyệt được xác thực tự động bao gồm cookie HttpOnly thông qua `credentials: "include"`.

Các trường nội dung JSON không xác định và các tham số truy vấn không xác định sẽ bị từ chối bằng `422`, trừ khi điểm cuối ghi lại chúng một cách rõ ràng.

### 5.2 Phản hồi thành công của đối tượng

```json
{
  "data": {
    "id": 42
  }
}
```

### 5.3 Phản hồi thành công được phân trang

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "hasNextPage": false
  }
}
```

Không có tổng số được trả lại. Các kho lưu trữ yêu cầu các hàng `pageSize + 1` để xác định `hasNextPage`.

### 5.4 Phản hồi không có nội dung

Một phản hồi `204 No Content` không có nội dung phản hồi.

### 5.5 Chuẩn hóa

- Các chuỗi được cắt bớt khi khoảng trắng ở đầu/cuối không có ý nghĩa.
- Email cũng được viết thường.
- Các chuỗi rỗng trống sẽ chuẩn hóa thành `null`.
- Các mã được kiểm soát sẽ chuẩn hóa thành chữ hoa trước khi xác thực.
- Các bản sao tiện ích tìm kiếm có thể được loại bỏ trùng lặp.
- Các bản sao tiện ích trong phần nội dung ghi bị từ chối.
- Một bị bỏ qua Trường PATCH không thay đổi.

## 6. Định dạng lỗi và chính sách trạng thái HTTP

### 6.1 Phong bì lỗi

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request contains invalid data.",
    "requestId": "req_7f3b2c",
    "details": [
      {
        "field": "monthlyRent",
        "code": "INVALID_VALUE",
        "message": "monthlyRent must be a positive whole VND amount."
      }
    ]
  }
}
```

`details` là tùy chọn và được sử dụng chủ yếu cho các lỗi xác thực. Lỗi không bao giờ lặp lại mật khẩu, JWT, cookie, toàn bộ giá trị liên hệ nhạy cảm, thông tin xác thực của nhà cung cấp, SQL, dấu vết ngăn xếp hoặc phản hồi thô của nhà cung cấp.

### 6.2 Ánh xạ trạng thái

|Trạng thái|Hợp đồng sử dụng|
|---|---|
|`200`|NHẬN, đăng nhập, PATCH thành công, hành động trong vòng đời, sắp xếp lại hình ảnh, cập nhật kích hoạt quản trị viên hoặc mã hóa địa lý|
|`201`|Đăng ký, tạo bản nháp, tải hình ảnh lên hoặc tạo hành động kiểm duyệt|
|`204`|Đăng xuất, PUT/DELETE yêu thích, xóa danh sách được phép hoặc xóa hình ảnh|
|`400`|JSON không đúng định dạng hoặc cú pháp nhiều phần không đúng định dạng|
|`401`|Xác thực tuyến đường được bảo vệ bị thiếu, không hợp lệ, hết hạn hoặc không hoạt động|
|`403`|Vai trò sai, lỗi Nguồn gốc không an toàn hoặc cố gắng quản lý kích hoạt `ADMIN`|
|`404`|Thiếu tài nguyên hoặc tài nguyên không thể truy cập được cố tình không tiết lộ|
|`409`|Email trùng lặp, chuyển tiếp không hợp lệ/cũ, xung đột trạng thái dự kiến, kiểm duyệt cũ hoặc xóa bản nháp được kiểm duyệt bị cấm|
|`413`|Yêu cầu hoặc tải trọng hình ảnh quá lớn|
|`415`|Định dạng hình ảnh thực tế không được hỗ trợ hoặc MIME/chữ ký được khai báo không khớp|
|`422`|Yêu cầu được định dạng đúng không xác thực được hoặc hạn chế về dữ liệu kinh doanh|
|`429`|Đã vượt quá giới hạn tỷ lệ|
|`502`|Thao tác Nominatim/Cloudinary bắt buộc không thành công trước khi thành công cục bộ|
|`503`|Cơ sở dữ liệu hoặc phụ thuộc cục bộ được yêu cầu không có sẵn|
|`500`|Lỗi nội bộ không mong muốn|

Các mã ứng dụng phổ biến bao gồm:

- `VALIDATION_FAILED`
- `AUTHENTICATION_REQUIRED`
- `INVALID_CREDENTIALS`
- `FORBIDDEN`
- `RESOURCE_NOT_FOUND`
- `EMAIL_ALREADY_EXISTS`
- `INVALID_LISTING_TRANSITION` 
- `CONCURRENT_MODIFICATION`
- `LISTING_DELETE_NOT_ALLOWED`
- `IMAGE_LIMIT_EXCEEDED`
- `LAST_IMAGE_REQUIRED`
- `UNSUPPORTED_IMAGE_TYPE`
- `RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`

## 7. Giá trị được kiểm soát

### 7.1 Vai trò

```text
TENANT
LANDLORD
ADMIN
```

### 7.2 Trạng thái danh sách

```text
DRAFT
PENDING
APPROVED
REJECTED
HIDDEN
INACTIVE
```

### 7.3 Hành động kiểm duyệt

```text
APPROVE
REJECT
HIDE
RESTORE
```

### 7.4 Mã loại thuộc tính ban đầu

```text
ROOM
STUDIO
APARTMENT
HOUSE
DORMITORY
```

### 7.5 Mã tiện nghi ban đầu

```text
AIR_CONDITIONING
WIFI
FURNISHED
PRIVATE_BATHROOM
KITCHEN
REFRIGERATOR
WASHING_MACHINE
PARKING
ELEVATOR
SECURITY
BALCONY
PET_FRIENDLY
```

Điểm cuối tra cứu chỉ trả về giá trị danh mục hiện hoạt. Danh sách hiện tại có thể tiếp tục hiển thị và được lọc theo các giá trị đã ngừng hoạt động. Việc gửi không phải là một lựa chọn tra cứu mới, do đó, một giá trị đã biết đã được liên kết có thể vẫn còn sau khi ngừng hoạt động và bản thân nó không ngăn cản việc gửi.

## 8. Biểu diễn dữ liệu được chia sẻ

Ví dụ xác định tên trường và ranh giới quyền riêng tư. Các giá trị có thể rỗng xuất hiện dưới dạng `null`; các trường được mô tả rõ ràng là có điều kiện sẽ bị bỏ qua khi không được phép hoặc không áp dụng được.

### 8.1 Hồ sơ người dùng

```json
{
  "id": 17,
  "role": "LANDLORD",
  "email": "lan.nguyen@example.com",
  "phone": "+84901234567",
  "isActive": true,
  "createdAt": "2026-07-20T04:10:00.000Z",
  "updatedAt": "2026-07-29T07:15:00.000Z"
}
```

`phone` có thể là `null` dành cho người thuê và quản trị viên. Dữ liệu mật khẩu không bao giờ được đại diện.

### 8.2 Loại tài sản

```json
{
  "code": "STUDIO",
  "label": "Studio"
}
```

### 8.3 Tiện nghi

```json
{
  "code": "WIFI",
  "label": "Wi-Fi"
}
```

### 8.4 Hình ảnh công khai

```json
{
  "url": "https://res.cloudinary.com/rentmate/image/upload/v1/listings/studio-101.webp",
  "altText": "Bright studio room with a window",
  "displayOrder": 1
}
```

Hình ảnh công khai bỏ qua ID hình ảnh cơ sở dữ liệu và Cloudinary ID công khai.

### 8.5 Hình ảnh chủ sở hữu/quản trị viên

```json
{
  "id": 91,
  "url": "https://res.cloudinary.com/rentmate/image/upload/v1/listings/studio-101.webp",
  "format": "webp",
  "width": 1600,
  "height": 1200,
  "byteSize": 384210,
  "displayOrder": 1,
  "altText": "Bright studio room with a window",
  "createdAt": "2026-07-28T05:00:00.000Z"
}
```

Cloudinary ID công khai vẫn tồn tại trong nội bộ ngay cả trong phản hồi của chủ sở hữu/quản trị viên.

### 8.6 Tóm tắt niêm yết công khai

```json
{
  "id": 42,
  "title": "Bright studio near Ben Thanh Market",
  "monthlyRent": 7500000,
  "roomAreaSqm": 28.5,
  "areaName": "Ben Thanh, District 1",
  "latitude": 10.772,
  "longitude": 106.698,
  "propertyType": {
    "code": "STUDIO",
    "label": "Studio"
  },
  "amenities": [
    {
      "code": "WIFI",
      "label": "Wi-Fi"
    }
  ],
  "coverImage": {
    "url": "https://res.cloudinary.com/rentmate/image/upload/v1/listings/studio-101.webp",
    "altText": "Bright studio room with a window",
    "displayOrder": 1
  },
  "updatedAt": "2026-07-29T07:15:00.000Z"
}
```

Ngoài ra, kết quả bán kính còn bao gồm `distanceKm` dưới dạng số JSON không âm. Tọa độ công khai được làm tròn tới `0.001` độ gần nhất. Lọc và sắp xếp khoảng cách vẫn sử dụng tọa độ được lưu trữ chính xác.

Khi hình ảnh tồn tại, `coverImage` là hình ảnh có `displayOrder` nhỏ nhất. Danh sách công khai/không phải bản nháp thường có ảnh bìa vì danh sách không phải bản nháp phải giữ lại ít nhất một hình ảnh. Đối tượng ảnh bìa công khai sử dụng cách thể hiện hình ảnh công khai và không bao giờ hiển thị ID cơ sở dữ liệu hình ảnh.

### 8.7 Chi tiết danh sách công khai

Chi tiết công khai chứa mọi trường tóm tắt công khai ngoại trừ `coverImage`, cộng thêm:

```json
{
  "description": "Private furnished studio with natural light and secure entry.",
  "images": [
    {
      "url": "https://res.cloudinary.com/rentmate/image/upload/v1/listings/studio-101.webp",
      "altText": "Bright studio room with a window",
      "displayOrder": 1
    }
  ]
}
```

Nó không bao giờ chứa `addressText`, tọa độ chính xác, ID chủ nhà/dữ liệu liên hệ, dữ liệu kiểm duyệt hoặc siêu dữ liệu của nhà cung cấp.

### 8.8 Làm giàu chi tiết về đối tượng thuê đang hoạt động

Chỉ `TENANT` hiện đang hoạt động xem chi tiết danh sách công khai mới nhận được:

```json
{
  "landlordContact": {
    "email": "lan.nguyen@example.com",
    "phone": "+84901234567"
  }
}
```

Trường này bị bỏ qua đối với người dùng ẩn danh, chủ nhà, quản trị viên sử dụng tuyến đường công cộng, cookie không hợp lệ, cookie hết hạn và tài khoản không hoạt động.

### 8.9 Tóm tắt danh sách chủ nhà

```json
{
  "id": 42,
  "status": "PENDING",
  "title": "Bright studio near Ben Thanh Market",
  "monthlyRent": 7500000,
  "areaName": "Ben Thanh, District 1",
  "propertyType": {
    "code": "STUDIO",
    "label": "Studio"
  },
  "coverImage": {
    "id": 91,
    "url": "https://res.cloudinary.com/rentmate/image/upload/v1/listings/studio-101.webp",
    "format": "webp",
    "width": 1600,
    "height": 1200,
    "byteSize": 384210,
    "displayOrder": 1,
    "altText": "Bright studio room with a window",
    "createdAt": "2026-07-28T05:00:00.000Z"
  },
  "currentModerationReason": null,
  "updatedAt": "2026-07-29T07:15:00.000Z"
}
```

Các trường nháp có thể là `null`. `coverImage` là `null` khi danh sách chủ sở hữu không có hình ảnh; nếu không thì đó là ảnh chủ sở hữu có `displayOrder` nhỏ nhất. `currentModerationReason` chỉ được điền khi trạng thái hiện tại là `REJECTED` hoặc `HIDDEN`.

### 8.10 Chi tiết danh sách chủ nhà

```json
{
  "id": 42,
  "status": "DRAFT",
  "title": "Bright studio near Ben Thanh Market",
  "description": "Private furnished studio with natural light and secure entry.",
  "monthlyRent": 7500000,
  "roomAreaSqm": 28.5,
  "addressText": "101 Example Street, Ben Thanh Ward, District 1, Ho Chi Minh City",
  "areaName": "Ben Thanh, District 1",
  "latitude": 10.772341,
  "longitude": 106.697912,
  "propertyType": {
    "code": "STUDIO",
    "label": "Studio"
  },
  "amenities": [],
  "images": [],
  "currentModerationReason": null,
  "createdAt": "2026-07-28T04:30:00.000Z",
  "updatedAt": "2026-07-29T07:15:00.000Z"
}
```

Chi tiết về chủ sở hữu sử dụng tọa độ chính xác và hình ảnh đại diện của chủ sở hữu/quản trị viên. Các trường nháp có thể rỗng được biểu diễn dưới dạng `null`.

### 8.11 Tóm tắt danh sách quản trị viên

```json
{
  "id": 42,
  "status": "PENDING",
  "title": "Bright studio near Ben Thanh Market",
  "areaName": "Ben Thanh, District 1",
  "landlord": {
    "id": 17,
    "email": "lan.nguyen@example.com",
    "phone": "+84901234567",
    "isActive": true
  },
  "updatedAt": "2026-07-29T07:15:00.000Z"
}
```

### 8.12 Chi tiết danh sách quản trị viên

Chi tiết quản trị viên chứa chi tiết danh sách chủ sở hữu cộng thêm:

```json
{
  "landlord": {
    "id": 17,
    "role": "LANDLORD",
    "email": "lan.nguyen@example.com",
    "phone": "+84901234567",
    "isActive": true
  }
}
```

Chi tiết về quản trị viên có thể tiết lộ địa chỉ chính xác, tọa độ chính xác, siêu dữ liệu hình ảnh của chủ sở hữu/quản trị viên và lý do kiểm duyệt hiện tại có thể áp dụng. Toàn bộ lịch sử được lấy từ bộ sưu tập hành động kiểm duyệt.

### 8.13 Mục lịch sử kiểm duyệt

```json
{
  "id": 301,
  "listingId": 42,
  "adminId": 3,
  "previousStatus": "PENDING",
  "newStatus": "REJECTED",
  "reason": "The public area description does not match the submitted address.",
  "createdAt": "2026-07-29T08:20:00.000Z"
}
```

### 8.14 Ứng cử viên mã hóa địa lý

```json
{
  "displayName": "Ben Thanh Ward, District 1, Ho Chi Minh City, Vietnam",
  "latitude": 10.772341,
  "longitude": 106.697912
}
```

Các trường Nominatim dành riêng cho nhà cun…10219 tokens truncated…i cục bộ, nhưng mỗi lệnh gọi đều gọi nhà cung cấp bên ngoài; khách hàng không được gọi mỗi lần nhấn phím.

### V1-23 — NHẬN `/api/v1/favorites`

- **Mục đích:** Trả lại danh sách đã lưu công khai hiện tại của người thuê.
- **Xác thực/vai trò:** Hoạt động `TENANT`.
- **Truy vấn:** `page`, `pageSize` only.
- **Sắp xếp:** Yêu thích `createdAt DESC`, sau đó liệt kê ID `DESC`.
- **Thành công:** `200 OK` với danh sách công khai được phân trang tóm tắt.
- **Lỗi quan trọng:** `401`; `403`; `422`.
- **Tầm nhìn:** Tham gia niêm yết và chủ nhà; yêu cầu `APPROVED` và chủ nhà tích cực. Các hàng yêu thích không công khai vẫn được lưu trữ nhưng bị bỏ qua.
- **Quyền riêng tư:** Chỉ chiếu tóm tắt công khai; không liên hệ với chủ nhà.
- **Idempotence:** An toàn và bình thường.

### V1-24 — PUT `/api/v1/favorites/:listingId`

- **Mục đích:** Đảm bảo danh sách được người thuê yêu thích.
- **Xác thực/vai trò:** Đang hoạt động `TENANT`.
- **Tiêu đề:** Được phép `Origin` bắt buộc.
- **Đường dẫn:** ID danh sách tích cực.
- **Nội dung:** Không có.
- **Khả năng hiển thị:** Mục tiêu hiện phải là `APPROVED` với hoạt động chủ nhà.
- **Thành công:** `204 No Content` cho lần bổ sung đầu tiên và lặp lại.
- **Lỗi quan trọng:** `404` đối với mục tiêu bị thiếu/không công khai; `401`; `403`; `422`.
- **Giao dịch:** Chèn mối quan hệ hoặc giữ lại mối quan hệ hiện có mà không trùng lặp.
- **Idempotency:** Hoàn toàn bình thường.

### V1-25 — XÓA `/api/v1/favorites/:listingId`

- **Mục đích:** Đảm bảo mối quan hệ yêu thích của người thuê/danh sách không tồn tại.
- **Xác thực/vai trò:** Hoạt động `TENANT`.
- **Tiêu đề:** Được phép `Origin` bắt buộc.
- **Đường dẫn:** ID danh sách tích cực.
- **Nội dung:** Không có.
- **Khả năng hiển thị:** Khả năng hiển thị và tồn tại của danh sách hiện tại không cần thiết cho mối quan hệ loại bỏ.
- **Thành công:** `204 No Content` liệu mối quan hệ hiện có tồn tại hay không.
- **Lỗi quan trọng:** `401`; `403`; `422` ID không đúng định dạng.
- **Idempotency:** Hoàn toàn bình thường.

### V1-26 — NHẬN `/api/v1/admin/listings`

- **Mục đích:** Trả lại danh sách cho công việc kiểm duyệt.
- **Xác thực/vai trò:** Đang hoạt động `ADMIN`.
- **Truy vấn:** `status` (tùy chọn, mặc định là `PENDING`), `page`, `pageSize`.
- **Đặt hàng:** `updatedAt DESC`, sau đó `id DESC`.
- **Thành công:** `200 OK` với danh sách quản trị viên được phân trang tóm tắt.
- **Lỗi quan trọng:** `401`; `403`; `422`.
- **Quyền riêng tư:** Có thể bao gồm tài khoản/thông tin liên hệ của chủ nhà được quản trị viên ủy quyền. Bí mật mật khẩu/nhà cung cấp không bao giờ được bao gồm.
- **Idempotency:** An toàn và bình thường.

### V1-27 — NHẬN `/api/v1/admin/listings/:listingId`

- **Mục đích:** Trả lại danh sách chính xác và dữ liệu chủ nhà cần thiết để kiểm duyệt.
- **Xác thực/vai trò:** Đang hoạt động `ADMIN`.
- **Đường dẫn:** ID danh sách tích cực.
- **Thành công:** `200 OK` với `{ "data": <AdminListingDetail> }`.
- **Lỗi quan trọng:** `401`; `403`; `404`; `422`.
- **Quyền riêng tư:** Có thể bao gồm địa chỉ/tọa độ chính xác, tài khoản chủ nhà/dữ liệu liên hệ, siêu dữ liệu hình ảnh chủ sở hữu/quản trị viên và lý do kiểm duyệt hiện tại. Nó bỏ qua dữ liệu mật khẩu và Cloudinary ID công cộng.
- **Idempotency:** An toàn và bình thường.

### V1-28 — NHẬN `/api/v1/admin/listings/:listingId/moderation-actions`

- **Mục đích:** Trả về lịch sử kiểm duyệt có thẩm quyền cho một danh sách.
- **Xác thực/vai trò:** Đang hoạt động `ADMIN`.
- **Đường dẫn:** ID danh sách khẳng định.
- **Truy vấn:** `page`, `pageSize`.
- **Đặt hàng:** `createdAt DESC`, sau đó là ID lịch sử `DESC`.
- **Thành công:** `200 OK` với các mục lịch sử kiểm duyệt được phân trang.
- **Lỗi quan trọng:** `401`; `403`; `404`; `422`.
- **Lưu giữ:** Lịch sử chỉ được thêm vào.
- **Idempotency:** An toàn và bình thường.

### V1-29 — ĐĂNG `/api/v1/admin/listings/:listingId/moderation-actions`

- **Mục đích:** Thực hiện một chuyển đổi kiểm duyệt đã được phê duyệt và tạo mục lịch sử của nó.
- **Xác thực/vai trò:** Hoạt động `ADMIN`.
- **Tiêu đề:** JSON; được phép `Origin` bắt buộc.
- **Đường dẫn:** ID danh sách khẳng định.
- **Nội dung:**

```json
{
  "action": "REJECT",
  "reason": "The public area description does not match the submitted address."
}
```

- **Hành động/chuyển tiếp được phép:**
  - `APPROVE`: `PENDING -> APPROVED`
  - `REJECT`: `PENDING -> REJECTED`
  - `HIDE`: `APPROVED -> HIDDEN`
  - `RESTORE`: `HIDDEN -> APPROVED`
- **Lý do:** Bắt buộc, được cắt bớt và các ký tự 1–1000 cho `REJECT`/`HIDE`; ghi chú không trống có thể rỗng tùy chọn cho `APPROVE`/`RESTORE`.
- **Thành công:** `201 Created` với `{ "data": <ModerationHistoryItem> }`.
- **Lỗi quan trọng:** `404`; `409 INVALID_LISTING_TRANSITION` hoặc `CONCURRENT_MODIFICATION`; `422`.
- **Giao dịch:** Khóa danh sách; xác minh trạng thái; xác nhận hành động/lý do; cập nhật trạng thái và `updatedAt`; chèn chính xác một hàng lịch sử; cam kết cả hai hoặc không.
- **Hành động cũ:** `409`; không có hàng lịch sử nào được chèn vào.
- **Idempotency:** Được bảo vệ xung đột, không bình thường.

### V1-30 — NHẬN `/api/v1/admin/users`

- **Mục đích:** Trả về danh sách người dùng cơ bản để quản lý tài khoản.
- **Xác thực/vai trò:** Hoạt động `ADMIN`.
- **Truy vấn:** `role` (tùy chọn), `isActive` (boolean tùy chọn), `page`, `pageSize`.
- **Sắp xếp:** `createdAt DESC`, sau đó `id DESC`.
- **Thành công:** `200 OK` với được phân trang hồ sơ người dùng.
- **Lỗi quan trọng:** `401`; `403`; `422`.
- **Quyền riêng tư:** Chỉ các trường liên hệ/tài khoản được quản trị viên ủy quyền; không bao giờ mật khẩu/dữ liệu băm.
- **Phạm vi:** Có thể liệt kê `ADMIN` tài khoản, nhưng đột biến kích hoạt vẫn bị cấm đối với chúng.
- **Idempotency:** An toàn và bình thường.

### V1-31 — VÁ `/api/v1/admin/users/:userId/activation`

- **Mục đích:** Đặt trạng thái hoạt động của tài khoản người thuê nhà hoặc chủ nhà.
- **Xác thực/vai trò:** Hoạt động `ADMIN`.
- **Tiêu đề:** JSON; được phép `Origin` bắt buộc.
- **Đường dẫn:** ID người dùng tích cực.
- **Nội dung:**

```json
{
  "isActive": false
}
```

Không có lĩnh vực khác được chấp nhận.

- **Ủy quyền mục tiêu:** Vai trò mục tiêu phải là `TENANT` hoặc `LANDLORD`. `ADMIN` mục tiêu trả về `403`.
- **Thành công:** `200 OK` với `{ "data": <UserProfile> }` được cập nhật. Việc lặp lại giá trị hiện tại là không thành công.
- **Lỗi quan trọng:** `401`; `403`; `404`; `422`.
- **Hiệu ứng chủ nhà:** Chỉ thay đổi tài khoản người dùng. Không thay đổi trạng thái danh sách hoặc tạo lịch sử kiểm duyệt. Các truy vấn công khai/yêu thích sẽ chặn danh sách sở hữu ngay lập tức; kích hoạt lại khôi phục danh sách vẫn `APPROVED`.
- **Hiện tại JWT:** Xác thực được bảo vệ kiểm tra hoạt động hiện tại, do đó JWT hiện tại của người dùng đã vô hiệu hóa không còn ủy quyền các yêu cầu được bảo vệ.
- **Giao dịch:** Khóa hoặc cập nhật có điều kiện người dùng mục tiêu sau khi xác minh vai trò mục tiêu.
- **Idempotency:** Idempotent.

## 16. Cloudinary và tính nhất quán của hình ảnh

### 16.1 Tải lên

1. Xác thực xác thực, vai trò, quyền sở hữu sơ bộ, cú pháp nhiều phần, kích thước và loại.
2. Tải lên nội dung của nhà cung cấp.
3. Bắt đầu giao dịch cơ sở dữ liệu và khóa/kiểm tra lại quyền sở hữu danh sách, trạng thái và số lượng hiện tại.
4. Chèn siêu dữ liệu và áp dụng các thay đổi/`updatedAt` chỉnh sửa quan trọng.
5. Cam kết.
6. Nếu việc duy trì lâu dài không thành công sau khi nhà cung cấp thành công, hãy thử loại bỏ nhà cung cấp với nỗ lực tốt nhất ngay lập tức và dọn dẹp nhật ký thất bại.

### 16.2 Xóa hình ảnh

1. Bắt đầu và khóa/kiểm tra lại danh sách cũng như hình ảnh liên quan.
2. Xác minh số lượng hình ảnh tối thiểu không phải bản nháp.
3. Xóa siêu dữ liệu và áp dụng các thay đổi trạng thái/`updatedAt` chỉnh sửa quan trọng.
4. Cam kết.
5. Cố gắng loại bỏ nhà cung cấp.

Lỗi xóa sau cam kết được ghi lại và không trở thành `502`.

### 16.3 thay thế giao diện người dùng

Không có hoạt động thay thế nguyên tử:

- Ít hơn tám hình ảnh: tải hình ảnh mới lên, sau đó xóa hình ảnh cũ.
- Chính xác là tám hình ảnh: xóa hình ảnh cũ, sau đó tải hình ảnh mới lên.

Mỗi yêu cầu cam kết độc lập. Trên `APPROVED` hoặc `INACTIVE`, đột biến đầu tiên sẽ chuyển danh sách sang `PENDING`; cái thứ hai vẫn hợp pháp trên `PENDING`. Đột biến ẩn rời khỏi danh sách `HIDDEN`.

hành vi ## 17. Nominatim

- Mã hóa địa lý chuyển tiếp chỉ phụ trợ.
- Xác thực chủ nhà đang hoạt động.
- Chỉ yêu cầu rõ ràng do người dùng kích hoạt.
- Giới hạn thời gian chờ và tối đa năm ứng viên.
- Giới hạn tỷ lệ phù hợp cho mỗi người dùng/nhà cung cấp.
- Dự báo ứng viên chuẩn hóa.
- Sử dụng kết quả trống `200`.
- Hết thời gian/thất bại của nhà cung cấp trước khi thành công, hãy sử dụng `502`.
- Từ chối giới hạn tỷ lệ sử dụng `429`.
- Không tự động hoàn thành, mã hóa địa lý đảo ngược, mã hóa địa lý nền, hiển thị phản hồi thô hoặc bộ đệm mã hóa địa lý riêng biệt API.

## 18. Yêu cầu về giao dịch và đồng thời

Sử dụng một ứng dụng khách PostgreSQL đã được kiểm xuất từ ​​`BEGIN` đến `COMMIT`/`ROLLBACK` cho mọi quy trình làm việc nhiều lần ghi.

Khóa hàng danh sách được chia sẻ trên:

- gửi
- nội dung/tiện ích PATCH
- tải lên/xóa/sắp xếp lại hình ảnh
- xóa cứng
- hủy kích hoạt/kích hoạt lại
- kiểm duyệt
- gửi ẩn

Nhóm nguyên tử cần thiết:

- Nội dung danh sách, thay thế tiện ích, trạng thái vòng đời và `updatedAt`.
- Đột biến siêu dữ liệu hình ảnh, trạng thái vòng đời và `updatedAt`.
- Cập nhật trạng thái kiểm duyệt và một phần chèn lịch sử kiểm duyệt.
- Xóa danh sách đủ điều kiện và xóa con theo tầng cơ sở dữ liệu.

Xung đột trạng thái mong đợi hoặc ghi có điều kiện trả về `409`. Hành động kiểm duyệt cũ không thành công sẽ không chèn sự kiện nào. Các nhà cung cấp bên ngoài không bao giờ tham gia vào các giao dịch PostgreSQL; chỉ áp dụng hành vi bồi thường được ghi lại.

Những thay đổi về khả năng hiển thị công khai do kích hoạt chủ nhà gây ra không yêu cầu viết danh sách và không có sự kiện kiểm duyệt.

## 19. Sự bất lực

Không có hệ thống `Idempotency-Key` nào tồn tại.

|Hoạt động|Hành vi|
|---|---|
|LẤY|Tự nhiên an toàn/bình thường|
|Đăng xuất|Luôn hội tụ để xóa cookie; `204`|
|PUT/DELETE yêu thích|Luôn hội tụ về trạng thái quan hệ được yêu cầu; `204`|
|BẢNG Kích hoạt|Việc đặt giá trị hiện tại là `200` không được phép|
|Hồ sơ/danh sách không hoạt động PATCH|Không hoạt động; không có `updatedAt` thay đổi|
|PUT thứ tự hình ảnh|Đơn hàng hoàn chỉnh giống nhau là không hoạt động|
|Hành động vòng đời|Bảo vệ xung đột; lặp lại sau khi thành công trở lại `409`|
|Hành động kiểm duyệt|Bảo vệ xung đột; không có lịch sử trùng lặp|
|Sự đăng ký|Thử lại sau khi tạo cam kết có thể trả về email trùng lặp `409`|
|Tải lên hình ảnh|Không bình thường; không có thử lại mù tự động|
|Danh sách/hình ảnh XÓA|Nhà nước là bình thường; lặp lại có thể quay lại `404`|

## 20. Các quy tắc về quyền riêng tư và bảo mật

- Không bao giờ trả về các hàng cơ sở dữ liệu thô.
- Không bao giờ trả lại mật khẩu văn bản gốc, hàm băm, JWT, cookie, thông tin xác thực của nhà cung cấp, lỗi SQL hoặc dấu vết ngăn xếp.
- Không bao giờ ghi nhật ký các nội dung yêu cầu nhạy cảm hoặc thông tin liên hệ đầy đủ.
- Xác thực tất cả đầu vào bên ngoài, bao gồm giá trị đường dẫn/truy vấn và siêu dữ liệu nhiều phần.
- Sử dụng SQL được tham số hóa.
- Xác thực không an toàn `Origin`; CORS không phải là bảo vệ CSRF.
- Định cấu hình nhận biết thông tin xác thực CORS với nguồn gốc giao diện người dùng chính xác và không có ký tự đại diện.
- Giữ giao diện người dùng sản xuất và API cùng một trang web và sử dụng HTTPS.
- Sử dụng các phép chiếu công khai hẹp để tránh chọn các trường liên hệ/địa chỉ riêng tư.
- Tính toán bán kính bằng tọa độ chính xác; chỉ làm tròn tọa độ công khai được trả về.
- Tìm kiếm văn bản công khai chỉ sử dụng `title` và `area_name`.
- Danh tính công khai của chủ nhà không bị lộ.
- Lý do/lịch sử kiểm duyệt là dữ liệu chủ sở hữu/quản trị viên, không bao giờ là dữ liệu công khai hoặc danh sách yêu thích.

## 21. Yêu cầu về hiệu suất

- Tìm kiếm công cộng thống nhất ngăn chặn việc triển khai truy vấn bản đồ/bán kính trùng lặp.
- Các kho lưu trữ tìm kiếm phải tránh các truy vấn hình ảnh/tiện ích N+1. Sử dụng truy vấn tổng hợp hoặc truy vấn hàng loạt có giới hạn cho trang đã chọn.
- Áp dụng mức độ hiển thị công khai và các bộ lọc thông thường trước Haversine nếu có thể.
- Tính toán Haversine một lần cho mỗi truy vấn ứng viên và sử dụng lại nó để lọc/đặt hàng.
- Không chạy truy vấn tổng số lượng.
- Giới hạn các trang/điểm đánh dấu bản đồ công khai ở `pageSize <= 100`.
- Mã hóa địa lý rõ ràng và không được kích hoạt trên mọi gõ phím.
- Các truy vấn công khai/chi tiết không nên tải các cột riêng tư chỉ để loại bỏ chúng.

## 22. Khả năng nằm ngoài phạm vi API

MVP API không bao gồm:

- sao chép tài nguyên của người dùng hiện tại
- một đột biến trạng thái danh sách chung do khách hàng kiểm soát
- bộ sưu tập bản đồ hoặc bán kính riêng biệt
- thay thế hình ảnh nguyên tử
- làm mới/quản lý phiên
- quy trình đặt lại mật khẩu hoặc thay đổi email
- đăng ký quản trị viên công khai
- phân cấp quản trị viên hoặc `SUPER_ADMIN`
- đảo ngược mã hóa địa lý hoặc tự động hoàn thành
- Các khái niệm API dành riêng cho PostGIS
- nhắn tin, thông báo, đặt chỗ, thanh toán, cho thuê, đánh giá, đề xuất hoặc phân tích
- chỉnh sửa hình ảnh hoặc kiểm duyệt hình ảnh tự động
- điểm cuối kiểm tra tổng quát

## 23. Ghi chú thực hiện liên quan đến hợp đồng

- Bốn mô-đun kinh doanh vẫn là `auth`, `users`, `listings`, và `favorites`.
- Tìm kiếm, phối hợp hình ảnh và kiểm duyệt vẫn là mối quan tâm nội bộ của `listings`.
- Nominatim và Cloudinary vẫn là khách hàng tích hợp.
- DTO kho lưu trữ và API DTO phản hồi phải khác biệt ở nơi tồn tại các cột riêng.
- PostgreSQL `numeric` giá trị phải được ánh xạ có chủ ý. Phạm vi giá thuê được phê duyệt phù hợp với số nguyên JSON an toàn.
- `updatedAt` được quản lý bởi ứng dụng; không giả định kích hoạt dấu thời gian.
- Điểm cuối tra cứu công khai trả về giá trị hiện hoạt, trong khi truy vấn chi tiết/bộ lọc vẫn có thể biểu thị các giá trị đã ngừng hoạt động.
- Thứ tự cơ sở dữ liệu hình ảnh là 1-based trong API phản hồi.
- Sức khỏe là điểm cuối duy nhất được miễn khỏi phạm vi `{ "data": ... }` thông thường.

## 24. Quyết định cố định cuối cùng

- Chính xác 31 các điểm cuối được phiên bản cộng với biểu mẫu điểm cuối sức khỏe riêng biệt API v1.
- Bộ sưu tập danh sách là điểm cuối duyệt/bản đồ/bán kính công khai duy nhất.
- Truy xuất và cập nhật người dùng hiện tại trực tiếp dưới `users`.
- Vòng đời của chủ nhà sử dụng các hành động gửi, hủy kích hoạt và kích hoạt lại rõ ràng.
- `INACTIVE` cộng với bất kỳ chỉnh sửa quan trọng nào đều trở thành `PENDING` ngay lập tức.
- Các chỉnh sửa ẩn vẫn được ẩn cho đến khi được gửi rõ ràng; không cần bằng chứng sửa đổi.
- Khả năng hiển thị công khai luôn yêu cầu cả danh sách được phê duyệt và chủ nhà đang hoạt động.
- Khám phá công khai không bao giờ tìm kiếm địa chỉ chính xác và không bao giờ trả về tọa độ chính xác.
- Các mục yêu thích sử dụng ngữ nghĩa mối quan hệ bình thường và lọc khả năng hiển thị công khai hiện tại khi truy xuất.
- Thay thế hình ảnh được cấu thành từ tải lên/xóa.
- Trạng thái kiểm duyệt và tạo lịch sử là nguyên tử.
- Lịch sử kiểm duyệt được giữ nguyên và vẫn hạn chế việc xóa danh sách.
- Xóa cứng yêu cầu một `DRAFT`.
- Email vẫn là mã định danh đăng nhập không thể thay đổi, bắt buộc, chỉ dành cho email.
- Đột biến kích hoạt quản trị viên chỉ nhắm mục tiêu đến người thuê và chủ nhà.
- PostgreSQL không có PostGIS, lọc hộp giới hạn và PostgreSQL Haversine vẫn cố định.
- Không có quyết định lược đồ cơ sở dữ liệu nào được đưa ra bởi hợp đồng HTTP này.

Tài liệu này bị treo RentMate MVP API Thông số kỹ thuật v1.
