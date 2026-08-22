# RentMate Đặc tả thiết kế cơ sở dữ liệu v1

## 1. Tổng quan về thiết kế cơ sở dữ liệu

RentMate sử dụng một cơ sở dữ liệu PostgreSQL làm nơi lưu trữ chính thức cho MVP đã được phê duyệt. Cơ sở dữ liệu hỗ trợ dữ liệu xác thực người dùng, dữ liệu liên hệ tài khoản, giá trị danh sách được kiểm soát, nội dung và tọa độ danh sách, siêu dữ liệu hình ảnh, mục yêu thích của người thuê và lịch sử kiểm duyệt danh sách.

Lược đồ này được thiết kế cho một chương trình phụ trợ nguyên khối theo mô-đun sử dụng máy khách `pg` và SQL được tham số hóa. PostgreSQL sở hữu khả năng lưu trữ bền bỉ, tính toàn vẹn quan hệ, lọc, sắp xếp, phân trang, ghi giao dịch, lọc ứng viên hộp giới hạn và tính toán khoảng cách Haversine cuối cùng. Express các dịch vụ có quyền sở hữu, liệt kê các quyết định về quy trình công việc, ánh xạ phản hồi nhận thức về quyền riêng tư và phối hợp với các nhà cung cấp bên ngoài.

Cơ sở dữ liệu cuối cùng chứa hai loại PostgreSQL enum và tám bảng. Nó cố tình không chứa các đối tượng PostGIS, siêu dữ liệu ORM, bảng phiên hoặc mã thông báo làm mới, bảng sửa đổi danh sách, bảng kiểm tra tổng quát, bộ đệm mã hóa địa lý, dữ liệu nhắn tin, dữ liệu đặt chỗ hoặc cấu trúc phân tích đầu cơ.

## 2. Mục tiêu và phạm vi thiết kế

Mục tiêu thiết kế là:

- Chỉ đại diện cho MVP tám tuần đã được phê duyệt.
- Bảo toàn tính toàn vẹn quan hệ mà không trùng lặp dữ liệu kinh doanh.
- Cho phép các bản nháp danh sách không đầy đủ trong khi ngăn chặn các danh sách không phải bản nháp không đầy đủ.
- Lưu trữ tọa độ nội bộ chính xác và hỗ trợ hộp giới hạn cộng với tìm kiếm Haversine mà không cần PostGIS.
- Giữ địa chỉ riêng và dữ liệu liên hệ của chủ nhà tách biệt với các trường danh sách an toàn công cộng.
- Thực thi các quy tắc cấu trúc ổn định trong PostgreSQL.
- Giữ ủy quyền tác nhân và điều phối quy trình công việc trong lớp dịch vụ nơi cần có bối cảnh hàng chéo hoặc bảng chéo.
- Làm cho bước di chuyển sau này mang tính quyết định mà không yêu cầu các quyết định lược đồ mới.
- Giữ lược đồ dễ hiểu và có thể duy trì cho một nhà phát triển.

Cơ sở dữ liệu không lập mô hình thanh toán, đặt chỗ, cho thuê, nhắn tin, thông báo, đánh giá, đề xuất, đăng nhập mạng xã hội, nội dung đa ngôn ngữ hoặc nhiều loại tiền tệ.

## 3. PostgreSQL quy ước

Lược đồ sử dụng các quy ước sau:

- Lược đồ PostgreSQL `public` mặc định là đủ cho MVP.
- Mã định danh sử dụng chữ thường không trích dẫn `snake_case`.
- Các bảng sử dụng tên số nhiều.
- Khóa kinh doanh chính sử dụng `integer GENERATED ALWAYS AS IDENTITY`.
- Các khóa tra cứu được kiểm soát nhỏ sử dụng `smallint GENERATED ALWAYS AS IDENTITY`.
- Bảng kết nối thuần túy sử dụng khóa chính tổng hợp và không có thay thế định danh.
- Cột khóa ngoại kết thúc bằng `_id`.
- Cột dấu thời gian kết thúc bằng `_at`.
- Cột mang đơn vị bao gồm đơn vị của chúng, chẳng hạn như `_sqm` và `_e164`.
- Instant sử dụng `timestamptz`.
- Giá trị tiền tệ sử dụng chính xác `numeric`, không bao giờ sử dụng loại dấu phẩy động.
- Các tọa độ sử dụng `double precision` vì chúng là đầu vào cho các phép tính phạm vi và lượng giác.
- Các tên ràng buộc rõ ràng sử dụng `pk_`, `fk_`, `uq_` và `ck_`.
- Các chỉ mục không ràng buộc rõ ràng sử dụng `idx_`.
- Các mã định danh khóa ngoài là bất biến; tất cả các khóa ngoại sử dụng `ON UPDATE RESTRICT`.
- `GENERATED ALWAYS AS IDENTITY` được sử dụng thay vì `serial`.
- Việc di chuyển SQL sẽ được sắp xếp và lập phiên bản, nhưng không có sự di chuyển nào được tạo như một phần của thông số kỹ thuật này.

## 4. PostgreSQL các loại enum

### 4.1 `user_role`

`user_role` enum chứa:

```text
TENANT
LANDLORD
ADMIN
```

Việc đăng ký người thuê nhà và chủ nhà có thể được công khai. Tài khoản quản trị viên được cung cấp thông qua các quy trình quản lý hoặc hạt giống được kiểm soát; đăng ký quản trị công cộng bị cấm bởi lớp dịch vụ.

### 4.2 `listing_status`

`listing_status` enum chứa:

```text
DRAFT
PENDING
APPROVED
REJECTED
HIDDEN
INACTIVE
```

Logic ứng dụng phải so sánh các giá trị enum một cách rõ ràng và không được phụ thuộc vào thứ tự khai báo của chúng.

Enum thích hợp cho các vai trò và trạng thái danh sách vì chúng có ngữ nghĩa quy trình công việc ổn định. Các loại tài sản và tiện nghi vẫn là dữ liệu tra cứu thay vì liệt kê.

## 5. Danh sách bảng cuối cùng

|Bàn|Mục đích|Khóa chính|Khóa ngoại chính|
|---|---|---|---|
|`users`|Danh tính xác thực, vai trò, dữ liệu liên hệ và trạng thái tài khoản|`id`|Không có|
|`property_types`|Danh mục loại thuộc tính được kiểm soát|`id`|Không có|
|`amenities`|Danh mục tiện nghi được kiểm soát|`id`|Không có|
|`listings`|Danh sách cho thuê thuộc sở hữu của chủ nhà và dữ liệu vị trí chính xác|`id`|`landlord_id`, `property_type_id`|
|`listing_images`|Đã đặt hàng Cloudinary siêu dữ liệu hình ảnh|`id`|`listing_id`|
|`listing_amenities`|Mối quan hệ nhiều-nhiều giữa danh sách với tiện ích|`(listing_id, amenity_id)`|`listing_id`, `amenity_id`|
|`favorites`|Mối quan hệ đã lưu giữa người thuê và danh sách|`(tenant_id, listing_id)`|`tenant_id`, `listing_id`|
|`moderation_history`|Quá trình kiểm tra kiểm duyệt danh sách chỉ nối thêm|`id`|`listing_id`, `admin_id`|

## 6. Định nghĩa bảng chi tiết

### 6.1 `users`

Bảng `users` lưu trữ thông tin nhận dạng đăng nhập một lần, hàm băm mật khẩu bcrypt, vai trò, trạng thái kích hoạt tài khoản và dữ liệu liên hệ cấp tài khoản. Thông tin liên hệ không được sao chép vào danh sách.

|Cột|PostgreSQL loại|Tính vô hiệu|Mặc định|Sự miêu tả|
|---|---|---|---|---|
|`id`|`integer GENERATED ALWAYS AS IDENTITY`|`NOT NULL`|Danh tính|Khóa chính|
|`role`|`user_role`|`NOT NULL`|Không có|Vai trò ủy quyền|
|`email`|`varchar(320)`|`NOT NULL`|Không có|Email đăng nhập được chuẩn hóa|
|`phone_e164`|`varchar(16)`|Có thể rỗng|`NULL`|Điện thoại liên lạc tùy chọn ngoại trừ chủ nhà|
|`password_hash`|`varchar(100)`|`NOT NULL`|Không có|băm mật khẩu bcrypt|
|`is_active`|`boolean`|`NOT NULL`|`true`|Trạng thái kích hoạt tài khoản|
|`created_at`|`timestamptz`|`NOT NULL`|`CURRENT_TIMESTAMP`|Sáng tạo ngay lập tức|
|`updated_at`|`timestamptz`|`NOT NULL`|`CURRENT_TIMESTAMP`|Cập nhật tức thì do ứng dụng quản lý gần đây nhất|

Phím và ràng buộc:

- `pk_users`: khóa chính trên `id`.
- `uq_users_email`: ràng buộc duy nhất trên `email`.
- `ck_users_email_normalized`: `email` phải không trống và bằng `lower(btrim(email))`.
- `ck_users_phone_e164`: `phone_e164` là null hoặc khớp với `^\+[1-9][0-9]{7,14}$`.
- `ck_users_landlord_phone`: `role <> 'LANDLORD' OR phone_e164 IS NOT NULL`.

Email là mã định danh đăng nhập duy nhất, được yêu cầu đối với mọi người thuê nhà, chủ nhà và quản trị viên và không thể thay đổi thông qua quy trình làm việc của hồ sơ MVP. `phone_e164` không phải là duy nhất và không bao giờ được sử dụng để xác thực. Ứng dụng xác thực cú pháp email trước khi lưu giữ lâu dài; cơ sở dữ liệu thực thi sự hiện diện, chuẩn hóa, độ dài và tính duy nhất.

Cơ sở dữ liệu không cố gắng xác thực định dạng bcrypt bằng biểu thức chính quy. Chỉ dịch vụ xác thực mới có thể tạo hoặc thay thế `password_hash` và mật khẩu văn bản gốc không bao giờ được lưu trữ.

### 6.2 `property_types`

Bảng `property_types` chứa danh mục thuộc tính được xác định trước được sử dụng bởi các danh sách.

|Cột|PostgreSQL loại|Tính vô hiệu|Mặc định|Sự miêu tả|
|---|---|---|---|---|
|`id`|`smallint GENERATED ALWAYS AS IDENTITY`|`NOT NULL`|Danh tính|Khóa chính|
|`code`|`varchar(32)`|`NOT NULL`|Không có|Mã có thể đọc được bằng máy ổn định|
|`label`|`varchar(80)`|`NOT NULL`|Không có|Nhãn có thể đọc được|
|`is_active`|`boolean`|`NOT NULL`|`true`|Liệu giá trị có thể được chọn cho những thay đổi mới hay không|

Phím và ràng buộc:

- `pk_property_types`: khóa chính trên `id`.
- `uq_property_types_code`: ràng buộc duy nhất trên `code`.
- `uq_property_types_label`: ràng buộc duy nhất trên `label`.
- `ck_property_types_code`: `code` khớp với `^[A-Z][A-Z0-9_]*$`.
- `ck_property_types_label`: `label` không trống và bằng `btrim(label)`.

Các hàng được kiểm soát ban đầu:

|Mã số|Nhãn|
|---|---|
|`ROOM`|`Room`|
|`STUDIO`|`Studio`|
|`APARTMENT`|`Apartment`|
|`HOUSE`|`House`|
|`DORMITORY`|`Dormitory`|

Mã không thể thay đổi sau khi sử dụng. Các giá trị được loại bỏ bằng `is_active = false`, không bị xóa.

### 6.3 `amenities`

Bảng `amenities` chứa danh mục tiện nghi được xác định trước.

|Cột|PostgreSQL loại|Tính vô hiệu|Mặc định|Sự miêu tả|
|---|---|---|---|---|
|`id`|`smallint GENERATED ALWAYS AS IDENTITY`|`NOT NULL`|Danh tính|Khóa chính|
|`code`|`varchar(40)`|`NOT NULL`|Không có|Mã có thể đọc được bằng máy ổn định|
|`label`|`varchar(80)`|`NOT NULL`|Không có|Nhãn có thể đọc được|
|`is_active`|`boolean`|`NOT NULL`|`true`|Liệu giá trị có thể được chọn cho những thay đổi mới hay không|

Phím và ràng buộc:

- `pk_amenities`: khóa chính trên `id`.
- `uq_amenities_code`: ràng buộc duy nhất trên `code`.
- `uq_amenities_label`: ràng buộc duy nhất trên `label`.
- `ck_amenities_code`: `code` khớp với `^[A-Z][A-Z0-9_]*$`.
- `ck_amenities_label`: `label` không trống và bằng `btrim(label)`.

Các hàng được kiểm soát ban đầu:

|Mã số|Nhãn|
|---|---|
|`AIR_CONDITIONING`|`Air conditioning`|
|`WIFI`|`Wi-Fi`|
|`FURNISHED`|`Furnished`|
|`PRIVATE_BATHROOM`|`Private bathroom`|
|`KITCHEN`|`Kitchen`|
|`REFRIGERATOR`|`Refrigerator`|
|`WASHING_MACHINE`|`Washing machine`|
|`PARKING`|`Parking`|
|`ELEVATOR`|`Elevator`|
|`SECURITY`|`Security`|
|`BALCONY`|`Balcony`|
|`PET_FRIENDLY`|`Pet-friendly`|

Mã không thể thay đổi sau khi sử dụng. Các giá trị được loại bỏ bằng `is_active = false`, không bị xóa.

### 6.4 `listings`

Bảng `listings` lưu trữ phiên bản hiện tại của mỗi danh sách chủ nhà. MVP không có bảng sửa đổi danh sách.

|Cột|PostgreSQL loại|Tính vô hiệu|Mặc định|Sự miêu tả|
|---|---|---|---|---|
|`id`|`integer GENERATED ALWAYS AS IDENTITY`|`NOT NULL`|Danh tính|Khóa chính|
|`landlord_id`|`integer`|`NOT NULL`|Không có|Sở hữu người dùng|
|`property_type_id`|`smallint`|Có thể rỗng cho bản nháp|`NULL`|Loại tài sản được kiểm soát|
|`status`|`listing_status`|`NOT NULL`|`'DRAFT'`|Trạng thái vòng đời hiện tại|
|`title`|`varchar(160)`|Có thể rỗng cho bản nháp|`NULL`|Tiêu đề công khai|
|`description`|`text`|Có thể rỗng cho bản nháp|`NULL`|Mô tả công khai, tối đa 5,000 ký tự|
|`monthly_rent`|`numeric(12,0)`|Có thể rỗng cho bản nháp|`NULL`|Tiền thuê hàng tháng bằng VNĐ|
|`room_area_sqm`|`numeric(8,2)`|Có thể rỗng cho bản nháp|`NULL`|Diện tích phòng tính bằng mét vuông|
|`address_text`|`varchar(500)`|Có thể rỗng cho bản nháp|`NULL`|Địa chỉ nội bộ chính xác|
|`area_name`|`varchar(120)`|Có thể rỗng cho bản nháp|`NULL`|Khu vực gần đúng an toàn công cộng|
|`latitude`|`double precision`|Có thể rỗng cho bản nháp|`NULL`|Vĩ độ bên trong chính xác|
|`longitude`|`double precision`|Có thể rỗng cho bản nháp|`NULL`|Kinh độ nội bộ chính xác|
|`created_at`|`timestamptz`|`NOT NULL`|`CURRENT_TIMESTAMP`|Sáng tạo ngay lập tức|
|`updated_at`|`timestamptz`|`NOT NULL`|`CURRENT_TIMESTAMP`|Cập nhật tức thì do ứng dụng quản lý gần đây nhất|

Khóa và khóa ngoại:

- `pk_listings`: khóa chính trên `id`.
- `fk_listings_landlord`: `landlord_id -> users.id`, `ON DELETE RESTRICT`, `ON UPDATE RESTRICT`.
- `fk_listings_property_type`: `property_type_id -> property_types.id`, `ON DELETE RESTRICT`, `ON UPDATE RESTRICT`.

Kiểm tra giá trị:

- `ck_listings_title`: `title` là null hoặc không trống và bằng `btrim(title)`.
- `ck_listings_description`: `description` là null hoặc `btrim(description)` là không trống và `char_length(description) <= 5000`.
- `ck_listings_monthly_rent`: `monthly_rent` là null hoặc lớn hơn 0.
- `ck_listings_room_area`: `room_area_sqm` là null hoặc lớn hơn 0.
- `ck_listings_address_text`: `address_text` là null hoặc không trống và bằng `btrim(address_text)`.
- `ck_listings_area_name`: `area_name` là null hoặc không trống và bằng `btrim(area_name)`.
- `ck_listings_latitude`: `latitude` là null hoặc giữa `-90` và `90`.
- `ck_listings_longitude`: `longitude` là null hoặc giữa `-180` và `180`.
- `ck_listings_coordinate_pair`: vĩ độ và kinh độ đều là null hoặc cả hai không rỗng.

Tính đầy đủ phụ thuộc vào trạng thái:

- `ck_listings_non_draft_complete`: khi `status <> 'DRAFT'`, `property_type_id`, `title`, `description`, `monthly_rent`, `room_area_sqm`, `address_text`, `area_name`, `latitude`, và `longitude` đều phải không rỗng.

`address_text` không bao giờ là một trường công cộng. Tìm kiếm công khai chủ yếu sử dụng `title` và `area_name`. Tọa độ chính xác được sử dụng nội bộ, trong khi phản hồi của đối tượng thuê và ẩn danh nhận được tọa độ được làm tròn đến ba chữ số thập phân bằng API ánh xạ phản hồi.

### 6.5 `listing_images`

Bảng `listing_images` lưu trữ siêu dữ liệu được trả về bởi Cloudinary và thứ tự hiển thị do ứng dụng xác định.

|Cột|PostgreSQL loại|Tính vô hiệu|Mặc định|Sự miêu tả|
|---|---|---|---|---|
|`id`|`integer GENERATED ALWAYS AS IDENTITY`|`NOT NULL`|Danh tính|Khóa chính|
|`listing_id`|`integer`|`NOT NULL`|Không có|Sở hữu danh sách|
|`cloudinary_public_id`|`varchar(255)`|`NOT NULL`|Không có|Cloudinary định danh tài sản|
|`secure_url`|`varchar(2048)`|`NOT NULL`|Không có|HTTPS URL giao hàng|
|`format`|`varchar(16)`|`NOT NULL`|Không có|Định dạng hình ảnh được chuẩn hóa|
|`width`|`integer`|`NOT NULL`|Không có|Chiều rộng tính bằng pixel|
|`height`|`integer`|`NOT NULL`|Không có|Chiều cao tính bằng pixel|
|`byte_size`|`integer`|`NOT NULL`|Không có|Kích thước hình ảnh đã tải lên tính bằng byte|
|`display_order`|`smallint`|`NOT NULL`|Không có|Khe hiển thị từ 1 đến 8|
|`alt_text`|`varchar(255)`|Có thể rỗng|`NULL`|Văn bản thay thế có ý nghĩa tùy chọn|
|`created_at`|`timestamptz`|`NOT NULL`|`CURRENT_TIMESTAMP`|Sáng tạo ngay lập tức|

Phím và ràng buộc:

- `pk_listing_images`: khóa chính trên `id`.
- `fk_listing_images_listing`: `listing_id -> listings.id`, `ON DELETE CASCADE`, `ON UPDATE RESTRICT`.
- `uq_listing_images_cloudinary_public_id`: ràng buộc duy nhất trên `cloudinary_public_id`.
- `uq_listing_images_listing_display_order`: ràng buộc duy nhất trên `(listing_id, display_order)`, `DEFERRABLE INITIALLY IMMEDIATE`.
- `ck_listing_images_public_id`: `cloudinary_public_id` không trống và bằng `btrim(cloudinary_public_id)`.
- `ck_listing_images_secure_url`: `secure_url` bắt đầu bằng `https://`.
- `ck_listing_images_format`: `format` không trống và bằng `lower(btrim(format))`.
- `ck_listing_images_dimensions`: `width > 0 AND height > 0`.
- `ck_listing_images_byte_size`: `byte_size BETWEEN 1 AND 5242880`.
- `ck_listing_images_display_order`: `display_order BETWEEN 1 AND 8`.
- `ck_listing_images_alt_text`: `alt_text` là null hoặc `btrim(alt_text)` không trống.

Tám khe hiển thị duy nhất có thể thực thi tối đa tám hàng hình ảnh cho mỗi danh sách. Khoảng trống được cho phép. Sắp xếp lại giao dịch trì hoãn ràng buộc duy nhất về danh sách/đơn hàng cho đến khi giao dịch được thực hiện và phải để lại thứ tự cuối cùng duy nhất hợp lệ.

### 6.6 `listing_amenities`

Bảng nối `listing_amenities` thể hiện mối quan hệ nhiều-nhiều giữa danh sách và tiện nghi.

|Cột|PostgreSQL loại|Tính vô hiệu|Mặc định|Sự miêu tả|
|---|---|---|---|---|
|`listing_id`|`integer`|`NOT NULL`|Không có|Danh sách|
|`amenity_id`|`smallint`|`NOT NULL`|Không có|Tiện nghi|

Phím và ràng buộc:

- `pk_listing_amenities`: khóa chính tổng hợp trên `(listing_id, amenity_id)`.
- `fk_listing_amenities_listing`: `listing_id -> listings.id`, `ON DELETE CASCADE`, `ON UPDATE RESTRICT`.
- `fk_listing_amenities_amenity`: `amenity_id -> amenities.id`, `ON DELETE RESTRICT`, `ON UPDATE RESTRICT`.

Không có định danh thay thế và không có dấu thời gian. Khóa chính tổng hợp ngăn chặn việc gán tiện ích trùng lặp.

### 6.7 `favorites`

Bảng `favorites` ghi lại mối quan hệ niêm yết đã lưu của người thuê.

|Cột|PostgreSQL loại|Tính vô hiệu|Mặc định|Sự miêu tả|
|---|---|---|---|---|
|`tenant_id`|`integer`|`NOT NULL`|Không có|Người dùng thuê|
|`listing_id`|`integer`|`NOT NULL`|Không có|Danh sách đã lưu|
|`created_at`|`timestamptz`|`NOT NULL`|`CURRENT_TIMESTAMP`|Lưu ngay lập tức|

Phím và ràng buộc:

- `pk_favorites`: khóa chính tổng hợp trên `(tenant_id, listing_id)`.
- `fk_favorites_tenant`: `tenant_id -> users.id`, `ON DELETE CASCADE`, `ON UPDATE RESTRICT`.
- `fk_favorites_listing`: `listing_id -> listings.id`, `ON DELETE CASCADE`, `ON UPDATE RESTRICT`.

Khóa chính tổng hợp ngăn người thuê lưu cùng một danh sách nhiều lần. Vai trò của tác nhân và khả năng hiển thị danh sách hiện tại là các quy tắc kinh doanh trên nhiều bảng được thực thi bởi dịch vụ.

### 6.8 `moderation_history`

Bảng `moderation_history` là bản kiểm tra doanh nghiệp có thẩm quyền, chỉ bổ sung cho việc kiểm duyệt danh sách quản trị viên.

|Cột|PostgreSQL loại|Tín…7870 tokens truncated…a cặp tọa độ.
- Bắt buộc phải có vô hướng tính đầy đủ bên ngoài `DRAFT`.
- Tất cả các mối quan hệ khóa ngoại.
- Ngăn chặn tiện ích và yêu thích trùng lặp.
- Tối đa tám vị trí hình ảnh.
- Số nhận dạng công khai Cloudinary duy nhất.
- Các cặp chuyển tiếp lịch sử kiểm duyệt hợp lệ.
- Lý do từ chối và ẩn không trống.
- Giới hạn độ dài trường được phê duyệt.

## 30. Các quy tắc do dịch vụ và ứng dụng thực thi

Lớp dịch vụ Express thực thi:

- Xác thực cú pháp email trước khi duy trì.
- băm bcrypt và xác minh mật khẩu.
- Đăng nhập chỉ bằng email.
- Tính bất biến của email đăng nhập thông qua quy trình làm việc của hồ sơ MVP.
- Ngăn chặn đăng ký quản trị viên công cộng.
- Tính bất biến của vai trò người dùng.
- Kiểm tra tài khoản hoạt động đối với các yêu cầu được bảo vệ.
- Chủ sở hữu danh sách có hoạt động `LANDLORD` vai trò.
- Chủ sở hữu yêu thích có vai trò `TENANT` đang hoạt động.
- Người kiểm duyệt có vai trò `ADMIN` đang hoạt động.
- Chỉ các loại bất động sản và tiện nghi đang hoạt động mới có thể được chọn mới.
- Quyền sở hữu và ủy quyền.
- Tối thiểu một hình ảnh trước khi gửi.
- Các chuyển đổi vòng đời của danh sách hợp lệ.
- Kích hoạt các chỉnh sửa đáng kể kiểm duyệt lại.
- Các chỉnh sửa nội dung quan trọng áp dụng chuyển đổi trạng thái đã được phê duyệt trong cùng một giao dịch đã kiểm tra, bao gồm `INACTIVE -> PENDING`.
- Các cập nhật không hoạt động không tạo ra thay đổi nội dung chuẩn hóa sẽ không gây ra chuyển đổi trạng thái.
- Việc xóa cứng yêu cầu một `DRAFT` được sở hữu mà không có hàng lịch sử kiểm duyệt; một bản nháp không đủ điều kiện trả về `409 Conflict` với `LISTING_DELETE_NOT_ALLOWED`.
- Xác thực các loại MIME hình ảnh đã được phê duyệt (`image/jpeg`, `image/png`, và `image/webp`) và phối hợp Cloudinary.
- Cập nhật kiểm duyệt và chèn lịch sử là nguyên tử.
- Khả năng hiển thị danh sách công khai yêu cầu cả `listings.status = 'APPROVED'` và chủ nhà sở hữu đang hoạt động.
- Việc truy xuất mục yêu thích áp dụng cùng trạng thái danh sách và vị ngữ hoạt động của chủ nhà.
- Các dự đoán về quyền riêng tư liên hệ, địa chỉ chính xác và tọa độ chính xác.
- Đầu vào tiền thuê VNĐ là một số nguyên trước khi cưỡng chế cơ sở dữ liệu.

Trình kích hoạt không được đưa vào chỉ để di chuyển các quy tắc quy trình làm việc này vào PostgreSQL.

## 31. Yêu cầu về giao dịch và đồng thời

Mọi quy trình làm việc nhiều lần ghi đều sử dụng một ứng dụng khách `pg` đã được kiểm xuất từ ​​`BEGIN` đến `COMMIT` hoặc `ROLLBACK`.

### Nộp danh sách

Việc nộp hồ sơ phải:

1. Bắt đầu giao dịch.
2. Khóa danh sách bằng `SELECT ... FOR UPDATE`.
3. Xác minh chủ sở hữu, vai trò chủ nhà đang hoạt động và trạng thái hiện tại là `DRAFT` hoặc `HIDDEN`.
4. Xác minh tính đầy đủ vô hướng và các tham chiếu loại tài sản và tiện nghi hiện có giải quyết các hàng tra cứu đã biết. Đệ trình không phải là một lựa chọn mới, vì vậy các tài liệu tham khảo đã biết được chọn hợp lệ trước khi nghỉ hưu vẫn được chấp nhận; các tham chiếu không xác định hoặc bị hỏng là không hợp lệ.
5. Đếm các hàng hình ảnh vẫn tồn tại và yêu cầu ít nhất một.
6. Cập nhật trạng thái lên `PENDING` với một vị từ trạng thái dự kiến.
7. Cập nhật `updated_at`.
8. Commit.

Giao dịch chỉ cho phép `DRAFT -> PENDING` và `HIDDEN -> PENDING`. Việc chọn mới một giá trị tra cứu không hoạt động vẫn bị cấm trong quá trình tạo danh sách hoặc PATCH.

### Xóa bản nháp

Xóa cứng phải:

1. Xác thực chủ nhà đang hoạt động và bắt đầu giao dịch.
2. Khóa danh sách sở hữu bằng `SELECT ... FOR UPDATE`.
3. Yêu cầu trạng thái hiện tại là `DRAFT`.
4. Yêu cầu không có hàng `moderation_history` nào tồn tại cho danh sách; nếu không thì quay lại và trả về `409 Conflict` bằng `LISTING_DELETE_NOT_ALLOWED`.
5. Chụp Cloudinary số nhận dạng công khai của danh sách trước khi xóa các hàng cơ sở dữ liệu.
6. Xóa danh sách, cho phép các tầng hiện có xóa siêu dữ liệu hình ảnh con, hàng tiện ích danh sách và bất kỳ hàng phụ thuộc nào khác được định cấu hình bằng `ON DELETE CASCADE`.
7. Commit.
8. Cố gắng Cloudinary dọn dẹp tài sản sau khi cam kết. Lỗi dọn dẹp được ghi lại và không đảo ngược hoặc thay đổi phản hồi xóa thành công.

Khóa ngoại `moderation_history.listing_id` không thay đổi vẫn giữ nguyên `ON DELETE RESTRICT` như điểm hỗ trợ toàn vẹn cuối cùng. Các hàng lịch sử kiểm duyệt không bao giờ bị xóa để làm cho danh sách đủ điều kiện.

### Đột biến hình ảnh so với việc gửi

Các thao tác thêm, xóa và sắp xếp lại hình ảnh sẽ khóa cùng một hàng danh sách được sử dụng khi gửi. Điều này tuần tự hóa các thay đổi về số lượng hình ảnh so với việc gửi. Sắp xếp lại trì hoãn ràng buộc duy nhất về danh sách/đặt hàng và phải kết thúc bằng các vị trí duy nhất.

Một đột biến nội dung hình ảnh, cập nhật `updated_at` chung và bất kỳ thay đổi trạng thái bắt buộc nào đều xảy ra trong cùng một giao dịch cơ sở dữ liệu. Một đột biến nội dung hình ảnh trên danh sách `INACTIVE` sẽ thay đổi nó thành `PENDING` ngay lập tức. Sắp xếp lại hình ảnh không gây ra sự chuyển đổi trạng thái. Các hoạt động Cloudinary vẫn nằm ngoài tính nguyên tử PostgreSQL và yêu cầu bồi thường bằng văn bản.

Không có quy trình làm việc thay thế nguyên tử. Việc thay thế cấp độ giao diện người dùng thực hiện một thao tác tải lên và một thao tác xóa dưới dạng các thao tác riêng biệt, theo thứ tự phụ thuộc vào số lượng được ghi trong quy tắc tính toàn vẹn của hình ảnh.

### Kiểm duyệt

Việc điều độ phải:

1. Bắt đầu giao dịch bằng cách sử dụng một khách hàng đã thanh toán.
2. Khóa hàng danh sách.
3. Xác minh vai trò quản trị viên đang hoạt động và trạng thái hiện tại dự kiến.
4. Xác thực quá trình chuyển đổi và lý do bắt buộc.
5. Cập nhật trạng thái danh sách và `updated_at`.
6. Chèn hàng `moderation_history` phù hợp.
7. Cam kết cả hai thay đổi hoặc khôi phục cả hai.

### Các thay đổi trạng thái khác

Các chỉnh sửa quan trọng, thay đổi tiện nghi, vô hiệu hóa, kích hoạt lại, khắc phục ẩn và gửi lại sử dụng khóa hàng hoặc cập nhật có điều kiện với trạng thái trước đó dự kiến. Các chỉnh sửa nội dung quan trọng áp dụng quá trình chuyển đổi trạng thái bắt buộc của chúng trong cùng một giao dịch. Đặc biệt, danh sách `INACTIVE` thay đổi thành `PENDING` ngay lập tức khi nội dung quan trọng thay đổi; kích hoạt lại trực tiếp là an toàn vì máy trạng thái đã chuyển mọi bản ghi không hoạt động được chỉnh sửa đáng kể sang `PENDING`. Quá trình chuyển đổi cũ hoặc đồng thời phải ảnh hưởng đến các hàng bằng 0 và trả về xung đột thay vì ghi đè lên trạng thái mới hơn.

## 32. Chiến lược chỉ số cuối cùng

Các khóa chính và các ràng buộc duy nhất tạo ra các chỉ mục riêng. Chỉ thêm các chỉ mục rõ ràng sau:

|chỉ mục|Sự định nghĩa|Mục đích|
|---|---|---|
|`idx_listings_status_updated_at`|`listings (status, updated_at DESC, id DESC)`|Chế độ xem trạng thái và hàng kiểm duyệt|
|`idx_listings_landlord_updated_at`|`listings (landlord_id, updated_at DESC, id DESC)`|Truy xuất danh sách chủ sở hữu|
|`idx_listings_approved_monthly_rent`|`listings (monthly_rent, id) WHERE status = 'APPROVED'`|Lọc giá công khai|
|`idx_listings_approved_property_type`|`listings (property_type_id, id) WHERE status = 'APPROVED'`|Lọc loại thuộc tính công cộng|
|`idx_listings_approved_room_area`|`listings (room_area_sqm, id) WHERE status = 'APPROVED'`|Lọc khu vực phòng công cộng|
|`idx_listings_approved_latitude`|`listings (latitude, id) WHERE status = 'APPROVED'`|Phạm vi hộp giới hạn vĩ độ|
|`idx_listings_approved_longitude`|`listings (longitude, id) WHERE status = 'APPROVED'`|Phạm vi hộp giới hạn kinh độ|
|`idx_listing_amenities_amenity_listing`|`listing_amenities (amenity_id, listing_id)`|Lọc tiện nghi theo danh sách|
|`idx_favorites_tenant_created_at`|`favorites (tenant_id, created_at DESC, listing_id DESC)`|Truy xuất đối tượng thuê mới nhất được lưu đầu tiên|
|`idx_moderation_history_listing_created_at`|`moderation_history (listing_id, created_at DESC, id DESC)`|Lịch sử niêm yết và lý do mới nhất|

Các chỉ mục kinh độ và vĩ độ được phê duyệt riêng biệt cho phép PostgreSQL xem xét kết hợp chỉ mục bitmap cho các ứng cử viên hộp giới hạn. Chúng không phải là sự thay thế cho một chỉ số không gian.

SQL kho lưu trữ công cộng phải sử dụng vị từ rõ ràng `status = 'APPROVED'` để PostgreSQL có thể nhận ra các chỉ mục một phần.

Các truy vấn công khai và hướng tới người thuê cũng liên kết `users` với chủ sở hữu danh sách và yêu cầu `users.is_active = true`. Hàng chủ nhà được tiếp cận thông qua khóa chính của nó và khối lượng công việc MVP dự kiến ​​không chứng minh được chỉ mục `is_active` hoặc bất kỳ cột/chỉ mục danh sách mới nào chỉ dành cho quy tắc này.

Ban đầu không thêm:

- Điện thoại, vai trò người dùng hoặc `is_active` chỉ mục.
- Tiêu đề hoặc `area_name` Chỉ mục cây B.
- Chỉ mục yêu thích đảo ngược.
- Chỉ mục kiểm duyệt-lịch sử-của-quản trị viên.
- `pg_trgm` hoặc chỉ mục tìm kiếm toàn văn bản.
- Chỉ mục PostGIS.

Chuỗi con `ILIKE` tìm kiếm trên `title` và `area_name` có thể sử dụng quá trình quét tuần tự cho tập dữ liệu MVP nhỏ dự kiến. Việc lập chỉ mục tìm kiếm chỉ được xem xét lại sau khi đo lường.

## 33. Quy ước đặt tên

- Bảng: tên chữ thường số nhiều, ví dụ `listing_images`.
- Cột: tên chữ thường số ít, ví dụ `listing_id`.
- Khóa ngoại: `<referenced_entity>_id`.
- Dấu thời gian: hậu tố mô tả `_at`.
- Đơn vị: được bao gồm trong các tên có vấn đề mơ hồ.
- Giá trị Enum và mã được kiểm soát: chữ hoa `SNAKE_CASE`.
- Khóa chính: `pk_<table>`.
- Khóa ngoại: `fk_<child_table>_<relationship>`.
- Ràng buộc duy nhất: `uq_<table>_<columns>`.
- Kiểm tra: `ck_<table>_<rule>`.
- Chỉ mục: `idx_<table>_<purpose>`.

Tên phải nằm dưới giới hạn định danh PostgreSQL của PostgreSQL.

## 34. Rủi ro cơ sở dữ liệu và sự đánh đổi

|Rủi ro hoặc quyết định|Đánh đổi và giảm nhẹ|
|---|---|
|PostgreSQL enum|Tính toàn vẹn giá trị mạnh mẽ nhưng những thay đổi đòi hỏi phải di chuyển. Vai trò và địa vị đủ ổn định cho sự đánh đổi này.|
|bản thảo chưa hoàn chỉnh|Nội dung có thể rỗng là cần thiết cho mục nhập lũy tiến. Việc kiểm tra tính đầy đủ không phải bản nháp sẽ ngăn chặn tình trạng không đầy đủ ở trạng thái xuất bản.|
|Mối quan hệ vai trò được thực thi bởi dịch vụ|Khóa ngoại thông thường không thể đảm bảo vai trò của người dùng được tham chiếu. Tập trung kiểm tra các dịch vụ và kiểm tra chúng.|
|Chuyển đổi bắt buộc dịch vụ|Việc kiểm tra không thể so sánh các hàng cũ và mới nếu không có trình kích hoạt. Sử dụng khóa hàng, vị từ trạng thái mong đợi và dịch vụ tập trung.|
|Không có bảng sửa đổi|Các chỉnh sửa quan trọng tạm thời xóa danh sách đã được phê duyệt khỏi kết quả công khai. Đây là sự đánh đổi đơn giản đã được phê duyệt.|
|Dữ liệu riêng tư chính xác trong cơ sở dữ liệu|Một truy vấn bất cẩn có thể làm lộ địa chỉ, tọa độ hoặc dữ liệu liên hệ chính xác. Sử dụng các phép chiếu SQL dành riêng cho vai trò hẹp và ánh xạ phản hồi rõ ràng.|
|Chỉ số tọa độ cây B|Thích hợp cho một tập dữ liệu một vùng nhỏ nhưng không lập chỉ mục không gian thực sự. Sử dụng các hộp giới hạn, giới hạn và phân trang.|
|Giá CPU Haversine|Chỉ áp dụng nó sau hộp giới hạn và các bộ lọc khác. Xác minh biểu thức được chia sẻ với các cặp tọa độ đã biết.|
|Các chỉ số được phê duyệt một phần|Các truy vấn phải chứa một vị từ trạng thái được phê duyệt có thể nhận dạng được người lập kế hoạch. SQL kho lưu trữ công cộng sử dụng vị từ theo nghĩa đen.|
|Không có chỉ mục bát quái/toàn văn|Tìm kiếm chuỗi con cuối cùng có thể trở nên chậm. Tập dữ liệu MVP dự kiến ​​sẽ vẫn còn nhỏ; đo trước khi thêm tiện ích mở rộng.|
|Được quản lý bởi ứng dụng `updated_at`|Các kho lưu trữ phải cập nhật nó một cách nhất quán. Các thử nghiệm nên xác minh đường dẫn cập nhật thay vì thêm trình kích hoạt.|
|Cloudinary/tính nhất quán của cơ sở dữ liệu|Tài sản bên ngoài và PostgreSQL không thể chia sẻ một giao dịch. Sử dụng tính năng dọn dẹp hiệu quả nhất và ghi nhật ký có cấu trúc.|
|`numeric` lập bản đồ|`pg` trả về số dưới dạng văn bản theo mặc định. Các kho phải ánh xạ giá trị 12 chữ số của VNĐ một cách có chủ ý.|
|Các mục yêu thích không công khai được giữ lại|Các mục yêu thích ẩn vẫn được lưu trữ. Việc truy xuất phải luôn kết hợp với trạng thái được phê duyệt hiện tại và khả năng hiển thị của chủ nhà đang hoạt động.|

## 35. Những cân nhắc nâng cấp PostGIS trong tương lai

PostGIS không phải là một phần của Thiết kế cơ sở dữ liệu v1.

Nếu số lượng danh sách, số lượng yêu cầu, phạm vi địa lý hoặc yêu cầu tìm kiếm đa giác vượt xa hộp giới hạn cộng với Haversine:

1. Kích hoạt PostGIS thông qua di chuyển theo phiên bản.
2. Thêm cột `geometry(Point, 4326)` hoặc `geography(Point, 4326)` sau khi chọn ngữ nghĩa khoảng cách dự kiến.
3. Hãy điền lại nó từ kinh độ và vĩ độ chính xác.
4. Thêm chỉ mục không gian GiST hoặc SP-GiST thích hợp.
5. Thay thế kho lưu trữ Haversine SQL bằng các biến vị ngữ khoảng cách PostGIS đã được kiểm tra.
6. Bảo toàn API làm tròn tọa độ và địa chỉ quyền riêng tư.
7. Chỉ gỡ bỏ các chỉ mục tọa độ cũ sau khi tính tương đương và hiệu suất của truy vấn được xác minh.

Các cột kinh độ và vĩ độ trực tiếp cung cấp nguồn di chuyển rõ ràng. Không yêu cầu giàn giáo tương thích PostGIS trong MVP.

## 36. ERD dựa trên văn bản cuối cùng

```text
USERS
  PK  id
      role
  UQ  email
      phone_e164
      password_hash
      is_active
      created_at
      updated_at
   |
   | 1
   | owns
   | N
   +------------------------------< LISTINGS
   |                                  PK  id
   |                                  FK  landlord_id -> USERS.id
   |                                  FK  property_type_id -> PROPERTY_TYPES.id
   |                                      status
   |                                      title
   |                                      description
   |                                      monthly_rent
   |                                      room_area_sqm
   |                                      address_text
   |                                      area_name
   |                                      latitude
   |                                      longitude
   |                                      created_at
   |                                      updated_at
   |                                       |
   |                       +---------------+-------------------+
   |                       | 1             | 1                 | 1
   |                       |               |                   |
   |                       | N             | N                 | N
   |                       v               v                   v
   |                 LISTING_IMAGES   LISTING_AMENITIES   MODERATION_HISTORY
   |                   PK id           PK/FK listing_id     PK id
   |                   FK listing_id   PK/FK amenity_id     FK listing_id
   |                   UQ public_id                         FK admin_id
   |                   UQ listing/order                    previous_status
   |                                                       new_status
   |                                                       reason
   |                                                       created_at
   |                                                           ^
   |                                                           |
   | 1 admin                                                   | N actions
   +-----------------------------------------------------------+
   |
   | 1 tenant
   | N saved relationships
   v
FAVORITES >---------------------------------------------- LISTINGS
  PK/FK tenant_id                 N favorites : 1 listing   PK id
  PK/FK listing_id
        created_at

PROPERTY_TYPES
  PK id
  UQ code
  UQ label
     is_active
   |
   | 1
   | N
   +----------------------------------------------< LISTINGS

AMENITIES
  PK id
  UQ code
  UQ label
     is_active
   |
   | 1
   | N
   +--------------------------------------< LISTING_AMENITIES

N:M relationships:
  LISTINGS N:M AMENITIES through LISTING_AMENITIES
  TENANT USERS N:M LISTINGS through FAVORITES
```

Thông số kỹ thuật này đóng băng thiết kế quan hệ RentMate MVP. Bước cơ sở dữ liệu tiếp theo có thể chuyển nó thành các quá trình di chuyển SQL được phiên bản xác định mà không cần thêm bảng hoặc đưa ra quyết định lược đồ mới.
