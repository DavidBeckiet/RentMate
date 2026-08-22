# RentMate Đặc tả kiến ​​trúc hệ thống v1

## 1. Tổng quan về kiến ​​trúc

RentMate sử dụng kiến ​​trúc nguyên khối mô-đun ba tầng được thiết kế cho MVP kéo dài tám tuần do một sinh viên phát triển.

Hệ thống bao gồm:

1. Một giao diện Next.js chịu trách nhiệm trình bày và tương tác với trình duyệt.
2. Một ứng dụng Express duy nhất được chia thành các mô-đun kinh doanh nội bộ.
3. Một cơ sở dữ liệu PostgreSQL duy nhất.

Phần phụ trợ là một cơ sở mã, quy trình và đơn vị triển khai. Ranh giới mô-đun là ranh giới logic bên trong ứng dụng và không phải là các dịch vụ được triển khai độc lập. Các mô-đun giao tiếp thông qua các lệnh gọi hàm TypeScript thông thường. RentMate không sử dụng vi dịch vụ, hàng đợi tin nhắn, Redis, bus sự kiện, cổng API hoặc giao dịch phân tán trong MVP.

Giao diện người dùng giao tiếp với phần phụ trợ thông qua REST/JSON. Phần phụ trợ là thành phần duy nhất giao tiếp với PostgreSQL và các API của nhà cung cấp yêu cầu quyền truy cập hoặc thông tin xác thực được kiểm soát.

## 2. Ngăn xếp công nghệ

### Giao diện người dùng

- Next.js với Bộ định tuyến ứng dụng
- React
- TypeScript
- Tailwind CSS
- Leaflet
- OpenStreetMap ô

### Phần cuối

- Node.js
- Express.js
- TypeScript
- `pg` PostgreSQL client
- JWT xác thực
- băm mật khẩu bcrypt

### Cơ sở dữ liệu

- PostgreSQL
- Lưu trữ kinh độ và vĩ độ trực tiếp
- Di chuyển SQL được phiên bản
- Không có PostGIS trong MVP

### Dịch vụ bên ngoài

- Nominatim để chuyển tiếp mã hóa địa lý
- Cloudinary để lưu trữ và phân phối hình ảnh danh sách

## 3. Thành phần hệ thống

### Trình duyệt và giao diện người dùng

Trình duyệt hiển thị ứng dụng Next.js, quản lý các biểu mẫu tương tác và điều khiển bản đồ, gửi các yêu cầu API đã được xác thực tới Express, tải xuống các ô bản đồ từ OpenStreetMap và hiển thị hình ảnh được cung cấp bởi Cloudinary.

### Express nguyên khối mô-đun

Ứng dụng Express hiển thị RentMate API và sở hữu xác thực, ủy quyền, xác thực, quy tắc kinh doanh, vòng đời danh sách, tìm kiếm, kiểm duyệt, tích hợp nhà cung cấp, định hình phản hồi, ghi nhật ký và xử lý lỗi.

### PostgreSQL

PostgreSQL là kho lưu trữ chính thức cho dữ liệu ứng dụng. Nó chỉ được truy cập bởi các kho lưu trữ phụ trợ thông qua nhóm kết nối được chia sẻ và SQL được tham số hóa.

### Nhà cung cấp bên ngoài

Nominatim và Cloudinary được coi là sự tích hợp cơ sở hạ tầng có thể thay thế được. Các định dạng yêu cầu và phản hồi dành riêng cho nhà cung cấp không được rò rỉ vào các thành phần giao diện người dùng hoặc dịch vụ kinh doanh.

## 4. Kiến trúc giao diện người dùng

Giao diện người dùng sử dụng Next.js App Router và sắp xếp các trang theo quy trình làm việc của người dùng:

- Chi tiết tìm kiếm và danh sách công khai
- Xác thực
- Người thuê nhà yêu thích
- Quản lý danh sách chủ nhà
- Kiểm duyệt quản trị và quản lý người dùng cơ bản

Thành phần máy chủ nên được sử dụng cho bố cục và cấu trúc trang không tương tác khi thực tế. Thành phần Máy khách được sử dụng cho Leaflet bản đồ, biểu mẫu, bộ lọc, nội dung tải lên, mục yêu thích và các tương tác khác phụ thuộc vào trình duyệt.

Leaflet chỉ được tải trong trình duyệt vì nó phụ thuộc vào API của trình duyệt và không phù hợp để hiển thị phía máy chủ thông thường.

Trạng thái giao diện người dùng vẫn đơn giản:

- Trạng thái phản ứng cục bộ cho các biểu mẫu và tương tác thành phần
- Các tham số truy vấn URL cho bộ lọc tìm kiếm, giới hạn bản đồ, bán kính, sắp xếp và phân trang
- Chỉ bối cảnh xác thực nhỏ nếu thông tin người dùng hiện tại là cần thiết trên các thành phần máy khách
- Một ứng dụng khách API được chia sẻ cho URL cơ sở phụ trợ, `credentials: "include"`, xử lý JSON và chuyển đổi lỗi nhất quán

Không cần Redux hoặc khung quản lý nhà nước toàn cầu khác cho MVP.

Kiểm tra tuyến đường giao diện người dùng cải thiện khả năng điều hướng và trải nghiệm người dùng, nhưng chúng không phải là biện pháp kiểm soát bảo mật. Phần phụ trợ Express vẫn có thẩm quyền đối với các vai trò, quyền sở hữu, trạng thái tài nguyên và các trường được bảo vệ.

## 5. Kiến trúc mô-đun phụ trợ

Phần phụ trợ chứa bốn mô-đun kinh doanh chính:

- `auth`
- `users`
- `listings`
- `favorites`

Tìm kiếm và kiểm duyệt vẫn nằm trong mô-đun danh sách vì chúng phụ thuộc trực tiếp vào các quy tắc hiển thị, vòng đời và phản hồi của danh sách.

Phần phụ trợ cũng chứa cơ sở hạ tầng dùng chung để cấu hình, truy cập cơ sở dữ liệu, phần mềm trung gian, ghi nhật ký, xác thực, lỗi, kiểm tra tình trạng và các máy khách dịch vụ bên ngoài.

Nominatim và Cloudinary là các máy khách tích hợp chứ không phải là các mô-đun kinh doanh:

- `nominatim.client.ts`
- `cloudinary.client.ts`

Phần phụ trợ không được đưa ra ranh giới triển khai độc lập giữa các mô-đun này.

## 6. Trách nhiệm của mô-đun phụ trợ

|Mô-đun hoặc thành phần|Trách nhiệm|
|---|---|
|`auth`|Đăng ký người thuê và chủ nhà, đăng nhập, đăng xuất, xử lý mật khẩu bcrypt, JWT tạo và xác minh cũng như ngăn chặn đăng ký quản trị viên công cộng|
|`users`|Hồ sơ người dùng, vai trò, trạng thái kích hoạt tài khoản, email đăng nhập không thể thay đổi bắt buộc, số điện thoại của chủ nhà, điện thoại của người thuê tùy chọn và quyền truy cập thông tin liên hệ được ủy quyền|
|`listings`|Liệt kê các bản nháp, quyền sở hữu, cập nhật, xóa các bản nháp thuộc sở hữu đủ điều kiện, chuyển đổi vòng đời, chi tiết công khai, lọc, tìm kiếm bản đồ, tìm kiếm bán kính, phối hợp siêu dữ liệu hình ảnh, kiểm duyệt và lịch sử kiểm duyệt|
|`favorites`|Thêm, xóa và truy xuất các mục yêu thích của người thuê bằng cách kiểm tra khả năng hiển thị của người thuê và danh sách|
|`nominatim.client`|Nominatim xây dựng yêu cầu, xử lý thời gian chờ, xác định tiêu đề, chuẩn hóa phản hồi và chuyển đổi lỗi của nhà cung cấp|
|`cloudinary.client`|Cloudinary các hoạt động tải lên và xóa và chuyển đổi lỗi của nhà cung cấp|
|`db`|PostgreSQL tổng hợp kết nối, kiểm tra tình trạng, trợ giúp giao dịch và tắt kết nối|
|`health`|Báo cáo nhẹ về tính khả dụng của cơ sở dữ liệu và API|
|`shared`|Phần mềm trung gian phổ biến, trình trợ giúp xác thực, loại lỗi, quy ước phản hồi và tiện ích ghi nhật ký|

Mô-đun người dùng sở hữu thông tin liên hệ của chủ nhà. Mô-đun danh sách quyết định xem thông tin đó có thể được đưa vào phản hồi danh sách cụ thể hay không.

## 7. Chiến lược phân lớp chọn lọc

Tuyến đường → Bộ điều khiển → Dịch vụ → Kho lưu trữ chỉ được sử dụng khi mỗi lớp bổ sung thêm trách nhiệm rõ ràng.

### Tuyến đường

- Xác định HTTP đường dẫn và phương pháp.
- Đính kèm xác thực, vai trò, phần mềm trung gian xác thực nguồn gốc và xác thực yêu cầu.
- Ủy quyền cho một bộ điều khiển hoặc một trình xử lý nhỏ.

### Bộ điều khiển

- Đọc HTTP đầu vào đã được xác thực.
- Gọi một dịch vụ.
- Chuyển kết quả dịch vụ thành HTTP phản hồi.
- Không chứa SQL hoặc các quy tắc kinh doanh quan trọng.

### Dịch vụ

- Áp dụng các quy tắc kinh doanh.
- Thực thi quyền sở hữu và các quy tắc trạng thái tài nguyên.
- Điều phối các giao dịch.
- Điều phối các kho lưu trữ và ứng dụng khách tích hợp.
- Không chứa logic phản hồi cụ thể Express.

### Kho lưu trữ

- Thực thi SQL được tham số hóa.
- Ánh xạ kết quả cơ sở dữ liệu vào dữ liệu ứng dụng.
- Không chứa Express đối tượng yêu cầu hoặc phản hồi.
- Không chứa HTTP quyết định trạng thái.

Xác thực, người dùng, danh sách và mục yêu thích có thể sử dụng cấu trúc đầy đủ. Kiểm tra tình trạng có thể gọi trực tiếp chức năng tình trạng của cơ sở dữ liệu. Nominatim và Cloudinary vẫn là những khách hàng nhỏ được gọi bởi các dịch vụ niêm yết. Không cần phải có bộ điều khiển cơ sở chung, dịch vụ cơ sở, kho lưu trữ cơ sở và khung tiêm phụ thuộc.

## 8. Trách nhiệm với cơ sở dữ liệu

PostgreSQL chịu trách nhiệm về dữ liệu ứng dụng bền vững, tính toàn vẹn quan hệ, cập nhật giao dịch, lọc, sắp xếp, phân trang và tính toán khoảng cách Haversine cuối cùng.

Phần phụ trợ sử dụng nhóm kết nối `pg` được chia sẻ hiện có và SQL được tham số hóa. ORM không cần thiết cho MVP. Các kho lưu trữ tách biệt SQL khỏi HTTP và logic nghiệp vụ.

Các giao dịch cơ sở dữ liệu được sử dụng khi nhiều lần ghi phải thành công hoặc thất bại cùng nhau, đặc biệt là cập nhật trạng thái kiểm duyệt và tạo lịch sử kiểm duyệt.

PostgreSQL lưu trữ trực tiếp các giá trị kinh độ và vĩ độ chính xác. PostGIS bị loại trừ rõ ràng khỏi MVP.

Các bảng, cột, kiểu dữ liệu SQL, khóa, ràng buộc, chỉ mục, mối quan hệ và ERD chi tiết được chuyển sang bước Thiết kế cơ sở dữ liệu.

## 9. Tích hợp dịch vụ bên ngoài

### OpenStreetMap

Trình duyệt yêu cầu OpenStreetMap xếp qua Leaflet. Thuộc tính nhà cung cấp ô phải vẫn hiển thị. Ứng dụng phải tránh các yêu cầu xếp ô không cần thiết.

### Nominatim

Chỉ các cuộc gọi phụ trợ Nominatim. Việc tích hợp được giới hạn ở các yêu cầu mã hóa địa lý chuyển tiếp rõ ràng do chủ nhà khởi xướng. Không bao gồm tính năng tự động hoàn thành, mã hóa địa lý đảo ngược, mã hóa địa lý nền và bộ đệm mã hóa địa lý riêng.

### Cloudinary

Phần phụ trợ kiểm soát việc tải lên hình ảnh và các nỗ lực xóa. Cloudinary thông tin xác thực vẫn chỉ dành cho phần phụ trợ. Trình duyệt truy xuất hình ảnh được lưu trữ trực tiếp từ Cloudinary URL phân phối.

Tất cả các lệnh gọi bên ngoài phải sử dụng thời gian chờ có giới hạn và chuyển lỗi của nhà cung cấp cụ thể thành lỗi ứng dụng nhất quán.

## 10. Kiến trúc xác thực và ủy quyền

Việc đăng ký người thuê nhà và chủ nhà được công khai. Đăng ký quản trị viên bị cấm. Tài khoản quản trị viên được cấp phép thủ công hoặc thông qua dữ liệu hạt giống được kiểm soát.

Trong quá trình đăng ký, phần phụ trợ xác thực yêu cầu, chuẩn hóa và lưu trữ email được yêu cầu, băm mật khẩu bằng bcrypt và lưu trữ vai trò người dùng được phép. Email là mã định danh đăng nhập duy nhất và không thể thay đổi thông qua API hồ sơ MVP. Sau khi tạo tài khoản người thuê hoặc chủ nhà thành công, việc đăng ký sẽ ngay lập tức tạo phiên xác thực thông thường bằng cách cấp JWT hai giờ và đặt cookie HttpOnly chỉ dành cho máy chủ đã được phê duyệt. Trong quá trình đăng nhập, phần phụ trợ sẽ xác minh mật khẩu và trạng thái kích hoạt tài khoản trước khi cấp JWT và cookie tương tự.

JWT chỉ chứa các yêu cầu nhận dạng và ủy quyền mà MVP yêu cầu, bao gồm mã định danh người dùng, vai trò, thời gian cấp và hết hạn. Thời gian tồn tại của JWT là hai giờ. MVP không có hệ thống mã thông báo làm mới; người dùng đăng nhập lại sau khi hết hạn mã thông báo.

Việc ủy ​​quyền được thực thi thông qua bốn lần kiểm tra nếu có:

1. Xác thực: JWT hợp lệ và tài khoản vẫn hoạt động.
2. Vai trò: người dùng có vai trò `TENANT`, `LANDLORD` hoặc `ADMIN` được yêu cầu.
3. Quyền sở hữu: chủ nhà sở hữu danh sách được yêu cầu.
4. Chính sách trường và tài nguyên: trạng thái danh sách cho phép hành động và người yêu cầu có thể nhận được các trường được yêu cầu.

Bảo vệ tuyến đường Frontend không thay thế ủy quyền phụ trợ.

## 11. JWT cookie, CORS, Chiến lược xác thực CSRF/Nguồn gốc

JWT được lưu trữ trong cookie HttpOnly chỉ dành cho máy chủ. Ứng dụng không được đặt thuộc tính cookie `Domain` rộng trừ khi việc triển khai trong tương lai yêu cầu và chứng minh điều đó.

Cài đặt cookie là:

|Cài đặt|Phát triển|Sản xuất|
|---|---|---|
|`HttpOnly`|`true`|`true`|
|`SameSite`|`Lax`|`Lax`|
|`Secure`|`false`|`true`|
|Trọn đời|2 giờ|2 giờ|
|Con đường|`/`|`/`|

Giao diện sản xuất và phụ trợ phải ở cùng một trang. Việc triển khai ưu tiên là một miền có `/api` được định tuyến tới Express hoặc giao diện người dùng và API tên miền phụ trong cùng một miền gốc. HTTPS là cần thiết trong sản xuất.

Máy khách API giao diện người dùng gửi `credentials: "include"` cho các yêu cầu được xác thực.

Khi giao diện người dùng và chương trình phụ trợ có nguồn gốc chéo, chẳng hạn như các cổng cục bộ `3000` và `4000`, cấu hình Express CORS phải sử dụng:

- Nguồn gốc giao diện người dùng được định cấu hình chính xác
- `credentials: true`
- Không có nguồn gốc ký tự đại diện

CORS không được coi là bảo vệ CSRF. Đối với các phương thức không an toàn—`POST`, `PUT`, `PATCH` và `DELETE`—phần phụ trợ xác thực tiêu đề `Origin` dựa trên nguồn gốc giao diện người dùng đã được định cấu hình. Các hoạt động thay đổi trạng thái không bao giờ được sử dụng `GET`.

Sự kết hợp giữa triển khai tại cùng một địa điểm, `SameSite=Lax`, nhận biết thông tin xác thực chính xác CORS, xác thực nguồn gốc phương pháp không an toàn và sản xuất HTTPS là chiến lược MVP đã được phê duyệt. Không cần có hệ thống mã thông báo CSRF riêng cho mô hình triển khai này.

## 12. Chính sách hiển thị thông tin liên hệ của người dùng

Thông tin liên hệ của chủ nhà thuộc về hồ sơ người dùng, không thuộc danh sách cá nhân.

Mọi người dùng phải cung cấp một email hợp lệ, đó là mã định danh đăng nhập MVP bất biến. Chủ nhà phải cung cấp thêm số điện thoại hợp lệ. Điện thoại là tùy chọn đối với người thuê và không bao giờ được sử dụng để xác thực. Tính hợp lệ của điện thoại có nghĩa là xác thực định dạng phía máy chủ; Xác minh qua SMS không được bao gồm trong MVP.

API áp dụng chính sách hiển thị cấp trường sau:

- Tìm kiếm ẩn danh, bản đồ, thẻ danh sách và phản hồi chi tiết danh sách không chứa số điện thoại hoặc email của chủ nhà.
- Người thuê nhà được xác thực xem chi tiết danh sách `APPROVED` có thể nhận được số điện thoại và email của chủ nhà.
- Chủ nhà có thể xem thông tin liên hệ tài khoản của chính họ và cập nhật số điện thoại được yêu cầu của họ.
- API hồ sơ MVP không cho phép bất kỳ người dùng nào thay đổi email đăng nhập của họ.
- Quản trị viên có thể xem thông tin liên hệ của chủ nhà để kiểm duyệt. và quản lý người dùng.
- Chủ nhà được xác thực không nhận được các trường liên hệ riêng tư của chủ nhà khác chỉ bằng cách xem danh sách công khai.

Các đối tượng phản hồi công khai phải được ánh xạ rõ ràng. Các hàng cơ sở dữ liệu thô chứa các trường liên hệ riêng tư không được trả về trực tiếp.

### Khả năng hiển thị danh sách công khai

Danh sách được hiển thị công khai khi và chỉ khi cả hai điều kiện sau đều đúng:

- `listings.status = 'APPROVED'`
- Chủ nhà sở hữu `users.is_active = true`

Vị từ tương tự áp dụng cho tìm kiếm danh sách công khai, chi tiết danh sách công khai, tìm kiếm theo bản đồ, tìm kiếm bán kính và truy xuất mục yêu thích của người thuê nhà. Các truy vấn kho lưu trữ công khai và đối tượng thuê phải tham gia vào hàng `users` sở hữu và thực thi cả hai điều kiện.

Khi quản trị viên vô hiệu hóa tài khoản chủ nhà, trạng thái hiện tại trong danh sách của chủ nhà đó không thay đổi và không có hàng nào được tạo. Danh sách biến mất khỏi kết quả công khai và kết quả dành cho người thuê vì chủ sở hữu không còn đáp ứng được vị từ hiển thị. Nếu tài khoản sau đó được kích hoạt lại, danh sách có trạng thái `APPROVED` sẽ được hiển thị công khai trở lại; danh sách ở bất kỳ tiểu bang nào khác vẫn không công khai.

## 13. Liệt kê các quy tắc về vòng đời và chuyển đổi trạng thái

Các trạng thái danh sách được phê duyệt là `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `INACTIVE` và `HIDDEN`.

|Trạng thái hiện tại|Hoạt động|Trạng thái tiếp theo|Tác nhân được ủy quyền|
|---|---|---|---|
|`DRAFT`|Gửi một danh sách đầy đủ|`PENDING`|chủ sở hữu chủ nhà|
|`DRAFT` không có lịch sử kiểm duyệt|Xóa vĩnh viễn|Đã xóa|chủ sở hữu chủ nhà|
|`PENDING`|Chấp thuận|`APPROVED`|Quản trị viên|
|`PENDING`|Từ chối có lý do|`REJECTED`|Quản trị viên|
|`REJECTED`|Chỉnh sửa nội dung bị từ chối|`DRAFT`|chủ sở hữu chủ nhà|
|`DRAFT` s…3134 tokens truncated…ịa lý không được chạy trên mỗi lần nhấn phím. Sau khi tọa độ được lưu, địa chỉ sẽ không được mã hóa lại trừ khi chủ nhà yêu cầu rõ ràng.

Nominatim thất bại không được loại bỏ dữ liệu dự thảo. Giao diện người dùng phải cho phép thử lại hoặc đặt điểm đánh dấu thủ công. Các vòng lặp thử lại tự động, mã hóa địa lý đảo ngược, tự động hoàn thành nâng cao và cơ sở hạ tầng bộ đệm riêng biệt đều bị loại trừ.

## 20. Kiến trúc tải lên hình ảnh

MVP sử dụng các tải lên Cloudinary qua trung gian phụ trợ.

1. Chủ nhà tạo bản nháp danh sách.
2. Giao diện người dùng gửi một hình ảnh dưới dạng dữ liệu biểu mẫu nhiều phần.
3. Phần phụ trợ xác minh xác thực, vai trò của chủ nhà, quyền sở hữu danh sách và trạng thái danh sách.
4. Phần phụ trợ xác thực số lượng hình ảnh, kích thước và loại được phép.
5. Khách hàng Cloudinary tải hình ảnh lên.
6. Phần phụ trợ lưu trữ mã định danh Cloudinary được trả về, URL phân phối an toàn và thứ tự hình ảnh thông qua kho danh sách.
7. Sau đó, trình duyệt sẽ tải hình ảnh trực tiếp từ Cloudinary.

Giới hạn là:

- Tối đa tám hình ảnh cho mỗi danh sách
- Tối đa 5 MiB (`5242880` byte) cho mỗi hình ảnh
- Các loại MIME được phép: `image/jpeg`, `image/png` và `image/webp`
- Hỗ trợ sắp xếp hình ảnh

Nội dung tải lên chỉ có thể được lưu giữ trong bộ nhớ trong giới hạn kích thước được thực thi. Phần phụ trợ không được giữ các tệp tải lên cục bộ vĩnh viễn.

Nếu Cloudinary thành công nhưng việc duy trì cơ sở dữ liệu không thành công, chương trình phụ trợ sẽ thực hiện nỗ lực tốt nhất ngay lập tức để xóa nội dung đã tải lên và ghi lại mọi lỗi dọn dẹp. Không có dịch vụ dọn dẹp hàng đợi hoặc nền nào được giới thiệu.

MVP không có sự thay thế hình ảnh nguyên tử chuyên dụng API và không có giao dịch thay thế nhà cung cấp/cơ sở dữ liệu riêng biệt. Thay thế cấp độ giao diện người dùng được tạo từ các hoạt động tải lên và xóa hiện có:

- Với ít hơn tám hình ảnh hiện tại, giao diện người dùng có thể tải hình ảnh mới lên trước khi xóa hình ảnh cũ.
- Với chính xác tám hình ảnh hiện tại, giao diện người dùng có thể xóa hình ảnh cũ trước rồi tải hình ảnh mới lên.

Mỗi lần tải lên hoặc xóa đều được ủy quyền, xác thực và tồn tại như hoạt động của chính nó. Danh sách không phải bản nháp phải giữ lại ít nhất một hình ảnh sau mỗi thao tác hoàn thành. Việc thêm hoặc xóa hình ảnh là một chỉnh sửa quan trọng và tuân theo các quy tắc trạng thái ở trên, bao gồm cả quá trình chuyển đổi ngay lập tức từ `INACTIVE` sang `PENDING` trong cùng một giao dịch cơ sở dữ liệu đã được kiểm tra như đột biến siêu dữ liệu. Việc sắp xếp lại các hình ảnh giống nhau là không đáng kể và không gây ra sự chuyển đổi trạng thái.

## 21. Chiến lược xử lý lỗi

Phần phụ trợ sử dụng phần mềm trung gian báo lỗi Express tập trung và một đường bao JSON nhất quán:

```json
{
  "error": {
    "code": "LISTING_NOT_FOUND",
    "message": "The requested listing was not found.",
    "requestId": "..."
  }
}
```

Các loại trạng thái dự kiến ​​là:

- `400` đối với các yêu cầu không đúng định dạng
- `401` đối với xác thực bị thiếu, không hợp lệ, hết hạn hoặc không hoạt động trên tuyến được bảo vệ
- `403` đối với người dùng được xác thực có vai trò sai, từ chối xuất xứ hoặc từ chối trường được bảo vệ
- `404` đối với tài nguyên bị thiếu, yêu cầu chi tiết công khai đối với danh sách không công khai và chủ nhà không phải là chủ sở hữu yêu cầu danh sách có phạm vi chủ sở hữu khác hoặc hình ảnh lồng nhau
- `409` cho chuyển đổi trạng thái không hợp lệ hoặc các mối quan hệ trùng lặp
- `422` đối với lỗi xác thực dữ liệu kinh doanh
- `429` đối với giới hạn tốc độ
- `502` đối với Nominatim hoặc Cloudinary lỗi
- `503` đối với cơ sở dữ liệu hoặc dịch vụ không có sẵn
- `500` đối với các lỗi nội bộ không mong muốn

Quy tắc `404` trong phạm vi chủ sở hữu cố tình ngăn chặn việc tiết lộ sự tồn tại tài nguyên riêng của chủ nhà khác. Nó không thay thế ủy quyền vai trò: người gọi được xác thực có vai trò sai vẫn nhận được `403` trước khi tra cứu tài nguyên trong phạm vi chủ sở hữu.

Các định dạng phản hồi của nhà cung cấp, lỗi SQL, dấu vết ngăn xếp, bí mật, mật khẩu, hàm băm, cookie và JWT không được xuất hiện trong phản hồi của khách hàng.

Máy khách API giao diện người dùng chuyển đổi các gói lỗi phụ trợ thành các lỗi ứng dụng có thể dự đoán được đối với phản hồi trường, lỗi của nhà cung cấp có thể thử lại, chuyển hướng xác thực và trạng thái lỗi chung.

## 22. Cấu hình và chiến lược môi trường

Phát triển cục bộ sử dụng kho lưu trữ gốc `.env` được tạo từ `.env.example`. Các giá trị dành riêng cho môi trường không được cam kết.

Cấu hình backend bao gồm:

- Cổng máy chủ
- Nguồn gốc giao diện người dùng chính xác
- PostgreSQL cài đặt kết nối
- JWT bí mật và hết hạn trong hai giờ
- chi phí bcrypt
- Cài đặt bảo mật cookie
- Cloudinary thông tin xác thực
- Nominatim URL cơ sở và nhận dạng ứng dụng
- Giới hạn hình ảnh
- Khu vực triển khai và `MAX_SEARCH_RADIUS_KM=50`
- Mức ghi nhật ký

Cấu hình công khai của giao diện người dùng chỉ sử dụng `NEXT_PUBLIC_` cho các giá trị an toàn để hiển thị cho trình duyệt, chẳng hạn như URL cơ sở API. Thông tin xác thực cơ sở dữ liệu, bí mật JWT, bí mật Cloudinary và thông tin xác thực phụ trợ khác không bao giờ được sử dụng `NEXT_PUBLIC_`.

Phần phụ trợ xác thực cấu hình sản xuất được yêu cầu trong quá trình khởi động và thất bại rõ ràng khi thiếu giá trị bắt buộc hoặc không hợp lệ.

Docker Compose vẫn tập trung vào PostgreSQL để phát triển địa phương. Kiến trúc MVP không yêu cầu việc chứa mọi thành phần.

## 23. Chiến lược ghi nhật ký

MVP sử dụng tính năng ghi nhật ký bảng điều khiển có cấu trúc mà không cần nền tảng ghi nhật ký riêng.

Nhật ký yêu cầu phải bao gồm:

- Dấu thời gian
- Mức nhật ký
- Số nhận dạng yêu cầu
- HTTP phương thức
- Đường dẫn yêu cầu
- Trạng thái phản hồi
- Thời lượng
- Số nhận dạng người dùng được xác thực khi có sẵn

Các sự kiện quan trọng bao gồm khởi động và tắt ứng dụng, tính khả dụng của cơ sở dữ liệu, các lần xác thực không thành công, hành động kiểm duyệt, lỗi của nhà cung cấp, lỗi không mong muốn và lỗi dọn dẹp.

Nhật ký không được bao gồm mật khẩu, hàm băm mật khẩu, JWT, cookie, bí mật của nhà cung cấp, thông tin liên hệ đầy đủ hoặc nội dung yêu cầu nhạy cảm. Nhật ký sản xuất không được để lộ dấu vết ngăn xếp cho khách hàng.

Lịch sử kiểm duyệt được lưu trữ trong PostgreSQL là dấu vết kiểm tra kinh doanh có thẩm quyền. Nhật ký thời gian chạy không thay thế nó.

## 24. Chiến lược di chuyển theo phiên bản

Các thay đổi về cơ sở dữ liệu sử dụng các tệp di chuyển SQL theo phiên bản, được sắp xếp theo thứ tự được cam kết kiểm soát nguồn.

Việc di chuyển phải:

- Chạy theo thứ tự phiên bản xác định
- Tái tạo cấu trúc cơ sở dữ liệu cần thiết từ cơ sở dữ liệu sạch
- Được áp dụng nhất quán trên các môi trường
- Tránh sửa đổi im lặng sau khi được chia sẻ hoặc áp dụng
- Giữ tách biệt với logic khởi động ứng dụng thông thường

Không có di chuyển nào được tạo trong bước kiến ​​trúc này. Công cụ di chuyển và cấu trúc cơ sở dữ liệu chi tiết sẽ được hoàn thiện trong quá trình Thiết kế cơ sở dữ liệu.

## 25. Cấu trúc thư mục đích được đề xuất

```text
RentMate/
├── docs/
│   ├── requirements/
│   │   └── REQUIREMENTS.md
│   └── architecture/
│       └── ARCHITECTURE.md
├── frontend/
│   ├── app/
│   │   ├── (public)/
│   │   ├── (auth)/
│   │   ├── (tenant)/
│   │   ├── (landlord)/
│   │   ├── (admin)/
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/
│   │   └── map/
│   ├── features/
│   │   ├── auth/
│   │   ├── listings/
│   │   └── favorites/
│   ├── lib/
│   │   ├── api/
│   │   └── auth/
│   └── types/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── db/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── listings/
│   │   │   └── favorites/
│   │   ├── integrations/
│   │   │   ├── nominatim.client.ts
│   │   │   └── cloudinary.client.ts
│   │   ├── shared/
│   │   │   ├── errors/
│   │   │   ├── middleware/
│   │   │   ├── validation/
│   │   │   └── logging/
│   │   ├── app.ts
│   │   └── server.ts
│   └── migrations/
├── docker-compose.yml
├── .env.example
└── README.md
```

Đây là cấu trúc đích, không phải hướng dẫn tạo thư mục trống. Chỉ nên thêm một thư mục hoặc lớp khi việc triển khai yêu cầu.

## 26. Rủi ro kiến ​​trúc và sự đánh đổi

|Rủi ro hoặc quyết định|Đánh đổi và giảm nhẹ|
|---|---|
|PostgreSQL không có PostGIS|Triển khai và triển khai đơn giản hơn nhưng khả năng mở rộng không gian địa lý yếu hơn. Giới hạn MVP ở một vùng và sử dụng tính năng lọc hộp giới hạn, Haversine, giới hạn và phân trang.|
|Haversine trong SQL|Tạo một truy vấn chuyên biệt khó hơn CRUD SQL thông thường. Cô lập nó trong một kho lưu trữ và xác minh nó với khoảng cách đã biết.|
|Tọa độ công cộng được làm tròn|Bảo vệ quyền riêng tư của vị trí nhưng làm cho các điểm đánh dấu được hiển thị gần đúng. Tính toán khoảng cách bằng cách sử dụng tọa độ chính xác và gắn nhãn các vị trí công cộng một cách thích hợp.|
|HttpOnly JWT cookie|Giảm mức độ hiển thị mã thông báo với JavaScript nhưng yêu cầu triển khai trên cùng một trang web, yêu cầu nhận biết thông tin xác thực và xác thực Nguồn gốc. Giữ nguyên giao diện sản xuất và API cùng một trang web.|
|Không có mã thông báo làm mới|Đơn giản hóa việc xác thực và giảm rủi ro quản lý mã thông báo nhưng yêu cầu đăng nhập sau hai giờ. Điều này có thể chấp nhận được đối với MVP.|
|Tải lên qua trung gian phụ trợ|Đơn giản hóa việc ủy ​​quyền và xác thực nhưng tiêu tốn bộ nhớ và băng thông phụ trợ. Thực thi giới hạn tám hình ảnh và năm megabyte.|
|Cloudinary/tính nhất quán của cơ sở dữ liệu|Hai hệ thống không thể chia sẻ một giao dịch. Thực hiện nỗ lực dọn dẹp và ghi nhật ký lỗi thay vì thêm hàng đợi.|
|Nominatim sự phụ thuộc|Giới hạn sử dụng công cộng và địa chỉ không rõ ràng có thể gây ra lỗi. Sử dụng các yêu cầu rõ ràng, kết quả hạn chế, thời gian chờ, điều tiết và điều chỉnh mã pin theo cách thủ công.|
|Kiểm duyệt lại tại chỗ|Tránh các bảng sửa đổi nhưng tạm thời xóa danh sách đã được phê duyệt đã chỉnh sửa khỏi kết quả công khai. Làm cho hành vi rõ ràng với chủ nhà.|
|Rò rỉ thông tin liên hệ|Các đối tượng tham gia hoặc kết quả thô có thể làm lộ dữ liệu riêng tư. Sử dụng ánh xạ phản hồi nhận biết vai trò rõ ràng và tách các truy vấn công khai/chi tiết nếu hữu ích.|
|Độ phức tạp chuyển đổi trạng thái|Các quy tắc có thể trở nên không nhất quán nếu được phân phối trên các bộ điều khiển. Tập trung chúng vào dịch vụ niêm yết và kiểm tra các chuyển đổi được phép và bị cấm.|
|Bản đồ và danh sách không nhất quán|Các truy vấn khác nhau có thể hiển thị các kết quả khác nhau. Sử dụng cùng tham số tìm kiếm phụ trợ và phản hồi cho cả hai chế độ xem.|
|Phân lớp quá mức|Các lớp kiến ​​trúc trống rỗng sẽ làm chậm quá trình phát triển đơn lẻ. Áp dụng ranh giới bộ điều khiển, dịch vụ và kho lưu trữ một cách có chọn lọc.|
|Lịch trình tám tuần|Tích hợp bên ngoài và hành vi bản đồ có thể tiêu tốn thời gian không tương xứng. Triển khai xác thực, vòng đời niêm yết và kiểm duyệt trước khi tích hợp.|

## 27. Lộ trình nâng cấp trong tương lai

PostGIS là bản nâng cấp khả năng mở rộng chính. Nếu khối lượng danh sách, phạm vi địa lý hoặc độ phức tạp của truy vấn không gian tăng lên, RentMate có thể di chuyển tọa độ chính xác sang bộ lưu trữ không gian địa lý tương thích với PostGIS, thêm chỉ mục không gian và thay thế SQL giới hạn hộp cộng với Haversine bằng các hàm khoảng cách PostGIS.

Các nâng cấp kiến ​​trúc khác trong tương lai có thể bao gồm:

- Nhóm điểm đánh dấu cho các tập hợp kết quả bản đồ lớn
- Tìm kiếm đa giác hoặc đa vùng nâng cao hơn
- Nhà cung cấp mã hóa địa lý chuyên dụng hoặc trả phí nếu Nominatim giới hạn không đủ
- Tải lên trực tiếp tớiCloudinary có chữ ký nếu lưu lượng tải lên phụ trợ trở nên quá mức
- Làm mới vòng quay mã thông báo nếu cần các phiên xác thực dài hơn
- Giám sát tập trung và tổng hợp nhật ký để triển khai ở quy mô sản xuất

Những nâng cấp này không phải là một phần của MVP và không được đưa ra trừ khi quy mô hoặc nhu cầu vận hành được chứng minh là phù hợp.

## 28. Sơ đồ kiến ​​trúc dựa trên văn bản cuối cùng

```text
┌──────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│                                                              │
│  Next.js UI ───── Leaflet ──────────────→ OpenStreetMap      │
│      │                                      map tiles         │
│      │                                                       │
│      └────────────────────────────────→ Cloudinary CDN        │
│                                       image delivery         │
└───────────────────────┬──────────────────────────────────────┘
                        │ REST/JSON
                        │ credentials: include
                        │ host-only HttpOnly JWT cookie
                        ▼
┌──────────────────────────────────────────────────────────────┐
│ Express modular monolith                                     │
│                                                              │
│  ┌────────┐  ┌────────┐  ┌──────────┐  ┌───────────┐         │
│  │  auth  │  │ users  │  │ listings │  │ favorites │         │
│  └────────┘  └────────┘  │          │  └───────────┘         │
│                          │ search   │                        │
│                          │ moderation│                        │
│                          └────┬─────┘                        │
│                               │                              │
│            ┌──────────────────┴──────────────────┐           │
│            ▼                                     ▼           │
│     Nominatim client                      Cloudinary client   │
│            │                                     │           │
│            ▼                                     ▼           │
│       Nominatim API                        Cloudinary API      │
│                                                              │
│  Routes → Controllers → Services → Repositories               │
│                         │                                    │
│                  Shared PostgreSQL pool                       │
└─────────────────────────┬────────────────────────────────────┘
                          │ parameterized SQL
                          ▼
               ┌──────────────────────────┐
               │ PostgreSQL               │
               │                          │
               │ Exact latitude/longitude │
               │ Bounding-box candidates  │
               │ Haversine calculation    │
               │ Versioned SQL migrations │
               │ No PostGIS in MVP        │
               └──────────────────────────┘
```
