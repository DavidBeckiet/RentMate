# RentMate Đặc tả yêu cầu v1

## 1. Mục tiêu dự án

RentMate là một nền tảng quản lý danh sách và tìm kiếm phòng cho thuê thông minh, dựa trên bản đồ.

Mục đích của nó là giúp người thuê tìm phòng phù hợp thông qua danh sách có thể tìm kiếm và bản đồ tương tác, đồng thời cho phép chủ nhà gửi và quản lý danh sách cho thuê theo quy trình kiểm duyệt của quản trị viên.

Hệ thống sẽ được triển khai dưới dạng nguyên khối mô-đun. MVP nhắm mục tiêu vào một thành phố hoặc khu vực được xác định và tập trung vào việc cho thuê phòng hàng tháng.

## 2. Diễn viên

### Người thuê nhà

Người dùng đã đăng ký tìm kiếm danh sách cho thuê đã được phê duyệt, xem chi tiết và vị trí của họ, lưu danh sách ưa thích và truy cập thông tin liên hệ của chủ nhà để sắp xếp xem hoặc thuê.

### Chủ nhà

Người dùng đã đăng ký tạo, gửi, cập nhật và quản lý danh sách cho thuê của riêng họ và cung cấp thông tin liên hệ cho người thuê được xác thực.

### Quản trị viên

Người dùng có đặc quyền xem xét danh sách, kiểm soát mức độ hiển thị của danh sách và quản lý tài khoản người dùng khi cần thiết.

### Dịch vụ bên ngoài

- **Nominatim:** Chuyển đổi các địa chỉ danh sách đã nhập thành tọa độ kinh độ và vĩ độ.
- **Cloudinary:** Lưu trữ và cung cấp hình ảnh danh sách.
- **OpenStreetMap và Leaflet:** Cung cấp các ô bản đồ và chức năng bản đồ tương tác.

## 3. Yêu cầu chức năng của tác nhân

### 3.1 Yêu cầu của người thuê nhà

Hệ thống sẽ cho phép người thuê:

- Đăng ký làm người thuê nhà.
- Đăng nhập và đăng xuất an toàn.
- Chỉ duyệt các danh sách hiển thị công khai: danh sách có trạng thái `APPROVED` có tài khoản chủ nhà đang hoạt động.
- Tìm kiếm danh sách theo tiêu đề hoặc khu vực gần đúng an toàn công cộng.
- Xem danh sách trong cả danh sách và bản đồ tương tác định dạng.
- Xem điểm đánh dấu danh sách trên bản đồ.
- Tìm kiếm danh sách trong bán kính đã chọn của một điểm trên bản đồ đã chọn hoặc vị trí hiện tại của người dùng.
- Lọc danh sách theo:
  - Giá tối thiểu và tối đa hàng tháng
  - Diện tích hoặc kích thước phòng
  - Bất động sản hoặc phòng loại
  - Tiện nghi sẵn có
- Xem chi tiết danh sách, bao gồm:
  - Tiêu đề
  - Tiền thuê hàng tháng
  - Mô tả
  - Địa chỉ hoặc vị trí gần đúng
  - Bản đồ vị trí
  - Phòng khu vực
  - Tiện nghi
  - Hình ảnh
- Xem số điện thoại và địa chỉ email của chủ nhà trên trang chi tiết danh sách được phê duyệt hiển thị công khai khi được xác thực là người thuê nhà.
- Không xem thông tin liên hệ của chủ nhà khi không được xác thực.
- Thêm danh sách được phê duyệt hiển thị công khai vào favorites.
- Xóa danh sách khỏi favorites.
- Xem danh sách yêu thích đã lưu của họ.

### 3.2 Yêu cầu của chủ nhà

Hệ thống sẽ cho phép chủ nhà:

- Đăng ký với tư cách chủ nhà.
- Đăng nhập và đăng xuất an toàn.
- Cung cấp email đăng nhập cần thiết và số điện thoại cần thiết để liên hệ với người thuê nhà; điện thoại không phải là mã định danh xác thực và không có quy trình xác minh SMS.
- Tạo danh sách cho thuê.
- Lưu danh sách dưới dạng bản nháp trước khi gửi.
- Nhập thông tin danh sách bắt buộc:
  - Tiêu đề
  - Tiền thuê hàng tháng
  - Địa chỉ
  - Tài sản hoặc loại phòng
  - Diện tích phòng
  - Mô tả
  - Tiện nghi
  - Hình ảnh
- Tải lên một số hình ảnh danh sách có giới hạn.
- Yêu cầu mã hóa địa lý của địa chỉ danh sách thông qua Nominatim.
- Lưu trữ các giá trị kinh độ và vĩ độ thu được.
- Xác nhận hoặc điều chỉnh thủ công vị trí danh sách trên bản đồ trước khi gửi.
- Gửi danh sách để kiểm duyệt.
- Xem danh sách của riêng họ và trạng thái kiểm duyệt hiện tại của họ.
- Cập nhật danh sách của riêng họ.
- Vô hiệu hóa danh sách có sẵn của họ khi chúng không còn nữa có sẵn.
- Xem lý do từ chối khi danh sách bị từ chối.

Chủ nhà cho thuê không được xem, chỉnh sửa, gửi, hủy kích hoạt hoặc xóa danh sách của chủ nhà khác.

### 3.3 Yêu cầu của quản trị viên

Hệ thống sẽ cho phép quản trị viên:

- Đăng nhập an toàn.
- Xem danh sách được gửi để kiểm duyệt.
- Xem chi tiết danh sách, hình ảnh, địa chỉ, vị trí trên bản đồ và thông tin liên hệ của chủ nhà trước khi kiểm duyệt.
- Phê duyệt danh sách đang chờ xử lý.
- Từ chối danh sách đang chờ xử lý và đưa ra lý do từ chối.
- Ẩn danh sách đã phê duyệt không phù hợp, gian lận hoặc hoặc không còn phù hợp để hiển thị công khai.
- Xem lịch sử kiểm duyệt danh sách.
- Xem tài khoản người dùng.
- Vô hiệu hóa hoặc kích hoạt lại tài khoản `TENANT` và `LANDLORD` khi cần thiết; MVP API sẽ không hủy kích hoạt hoặc kích hoạt lại tài khoản `ADMIN`.

## 4. Chức năng hệ thống chia sẻ

### 4.1 Xác thực và ủy quyền

Hệ thống sẽ:

- Hỗ trợ đăng ký tài khoản người thuê và chủ nhà.
- Chỉ lưu trữ mật khẩu dưới dạng băm mật khẩu bcrypt.
- Sử dụng xác thực dựa trên JWT cho các yêu cầu API được bảo vệ.
- Thực thi kiểm soát truy cập dựa trên vai trò đối với các chức năng của người thuê, chủ nhà và quản trị viên.
- Thực thi kiểm tra quyền sở hữu đối với danh sách chủ nhà 
- Từ chối các yêu cầu trái phép hoặc bị cấm với phản hồi lỗi API rõ ràng.

### 4.2 Vòng đời của danh sách

Mỗi danh sách sẽ có một trong các trạng thái sau:

0​ công khai.
- `HIDDEN`: Bị quản trị viên xóa khỏi chế độ hiển thị công khai.
- `INACTIVE`: Được chủ nhà đánh dấu là không có sẵn.

Hệ thống sẽ thực thi các chuyển đổi trạng thái niêm yết hợp lệ.

- Chủ nhà có thể chuyển danh sách từ `DRAFT` sang `PENDING`.
- Quản trị viên có thể chuyển danh sách `PENDING` sang `APPROVED` hoặc `REJECTED`.
- Quản trị viên có thể chuyển danh sách `APPROVED` sang `HIDDEN`.
- Chủ nhà có thể đánh dấu danh sách của chính họ là `INACTIVE`.
- Những thay đổi đáng kể đối với danh sách đã được phê duyệt nên trả nó về `PENDING` để kiểm duyệt lại.
- Chủ nhà chỉ có thể xóa vĩnh viễn danh sách thuộc sở hữu khi nó là `DRAFT` và chưa bao giờ tạo ra lịch sử kiểm duyệt nhập cảnh. Một danh sách đã được kiểm duyệt trước đó không thể bị xóa cứng ngay cả khi lần chỉnh sửa sau đó trả nó về `DRAFT`.
- Chủ nhà có thể gửi một danh sách `HIDDEN` một cách rõ ràng để xem xét, thay đổi nó thành `PENDING`. MVP không yêu cầu bằng chứng về sự khác biệt về nội dung trước lần gửi này.

### 4.3 Lịch sử kiểm duyệt

Hệ thống sẽ ghi lại mục nhập lịch sử kiểm duyệt khi quản trị viên thay đổi trạng thái kiểm duyệt của danh sách.

Lịch sử kiểm duyệt là có thẩm quyền và không được xóa để làm cho danh sách được kiểm duyệt trước đó đủ điều kiện để xóa vĩnh viễn.

Mỗi mục sẽ bao gồm:

- Số nhận dạng danh sách
- Số nhận dạng quản trị viên
- Trạng thái trước
- Trạng thái mới
- Lý do từ chối hoặc kiểm duyệt nếu có
- Dấu thời gian

### 4.4 Hiển thị thông tin liên hệ

Hệ thống sẽ lưu trữ số điện thoại được yêu cầu của chủ nhà và email đăng nhập được yêu cầu làm thông tin liên hệ của tài khoản.

Hệ thống sẽ:

- Chỉ hiển thị thông tin liên hệ của chủ nhà trên các trang chi tiết đối với các danh sách được phê duyệt hiển thị công khai.
- Chỉ hiển thị thông tin liên hệ cho người dùng được xác thực với vai trò là người thuê nhà.
- Không bao gồm số điện thoại hoặc địa chỉ email của chủ nhà trong các phản hồi dành cho người dùng ẩn danh.
- Không tiết lộ thông tin liên hệ trên thẻ danh sách công khai, kết quả tìm kiếm hoặc điểm đánh dấu trên bản đồ.
- Cho phép chủ nhà cập nhật thông tin liên hệ của họ thông tin liên hệ có thể thay đổi, cụ thể là số điện thoại họ yêu cầu; email đăng nhập vẫn không thay đổi trong MVP.
- Cho phép quản trị viên xem thông tin liên hệ của chủ nhà cho mục đích kiểm duyệt và quản lý tài khoản.

MVP chỉ được hiển thị thông tin liên hệ trực tiếp. Nó sẽ không bao gồm tính năng nhắn tin, trò chuyện, yêu cầu liên hệ hoặc theo dõi liên lạc trong ứng dụng.

### 4.5 Tìm kiếm, lọc và phân trang

Hệ thống sẽ:

</ khu vực.
- Cung cấp trạng thái tải, kết quả trống và lỗi trong giao diện người dùng.

### 4.6 Xử lý hình ảnh

Hệ thống sẽ:

- Lưu trữ hình ảnh danh sách thông qua Cloudinary.
- Xác thực loại tệp hình ảnh được phép.
- Thực thi kích thước hình ảnh và số lượng hình ảnh tối đa cho mỗi danh sách.
- Lưu trữ URL hình ảnh và siêu dữ liệu có liên quan trong cơ sở dữ liệu ứng dụng.
- Ngăn chặn người dùng trái phép thay đổi hình ảnh danh sách của chủ nhà khác.

## 5. Yêu cầu phi chức năng

### An ninh

- Mật khẩu sẽ được băm bằng bcrypt.
- Các điểm cuối được bảo vệ sẽ yêu cầu xác thực JWT hợp lệ.
- Vai trò và quyền sở hữu phải được kiểm tra phía máy chủ.
- Tất cả đầu vào bên ngoài phải được xác thực.
- Các điểm cuối xác thực nên sử dụng tốc độ giới hạn.
- Tải lên hình ảnh sẽ hạn chế loại tệp, kích thước tệp và số lượng hình ảnh.

### Hiệu suất

- Kết quả liệt kê sẽ sử dụng phân trang.
- Các trường tìm kiếm phổ biến như trạng thái, giá cả, loại tài sản và số nhận dạng chủ nhà nên được lập chỉ mục.
- Các tìm kiếm bán kính sẽ sử dụng bộ lọc trước hộp giới hạn trước khi áp dụng tính toán khoảng cách Haversine khi hữu ích.
- MVP được thiết kế cho một tập dữ liệu nhỏ trong một thành phố hoặc khu vực.

### Độ tin cậy

- Hệ thống sẽ xử lý lỗi mã hóa địa lý mà không làm mất dữ liệu danh sách đã nhập.
- Chủ nhà có thể điều chỉnh tọa độ theo cách thủ công thông qua bản đồ nếu mã hóa địa lý không chính xác.
- Lỗi tải lên hình ảnh sẽ tạo ra phản hồi rõ ràng và không xuất bản danh sách không đầy đủ.
- API phản hồi sẽ sử dụng các định dạng lỗi nhất quán.

### Khả năng sử dụng và khả năng tiếp cận

- Giao diện sẽ hoạt động trên các kích cỡ màn hình máy tính để bàn và thiết bị di động.
- Bộ lọc tìm kiếm và điều khiển bản đồ phải dễ hiểu và dễ cài đặt lại.
- Thông tin danh sách sẽ vẫn có sẵn ở dạng danh sách, không chỉ thông qua các điểm đánh dấu trên bản đồ.
- Các điều khiển tương tác nên hỗ trợ sử dụng bàn phím khi thực tế.
- Hình ảnh danh sách sẽ bao gồm văn bản thay thế có ý nghĩa nếu có.

### Quyền riêng tư

- Số điện thoại và địa chỉ email của chủ nhà sẽ chỉ được hiển thị cho những người thuê nhà đã được xác thực trên các trang chi tiết đối với các danh sách đã được phê duyệt.
- Người dùng ẩn danh sẽ không nhận được thông tin liên hệ của chủ nhà từ các API công khai hoặc các trang giao diện người dùng.
- Thông tin liên hệ sẽ không xuất hiện trong thẻ danh sách, kết quả tìm kiếm, điểm đánh dấu bản đồ hoặc siêu dữ liệu công khai.
- Việc hiển thị vị trí chính xác phải được xem xét cẩn thận để bảo vệ chủ nhà và người thuê nhà sự riêng tư.

### Khả năng bảo trì

- Ứng dụng sẽ sử dụng kiến ​​trúc mô-đun-nguyên khối.
- Phần phụ trợ sẽ tách biệt các mối quan tâm trên bốn mô-đun kinh doanh chính: `auth`, `users`, `listings` và `favorites`. Quy trình tìm kiếm, kiểm duyệt và liệt kê hình ảnh vẫn là mối quan tâm của mô-đun `listings`, trong khi Nominatim và Cloudinary vẫn là các máy khách tích hợp cơ sở hạ tầng thay vì các mô-đun kinh doanh bổ sung.
- TypeScript sẽ được sử dụng trong cả cơ sở mã giao diện người dùng và phụ trợ.
- API điểm cuối, mô hình cơ sở dữ liệu và các quy tắc kinh doanh chính sẽ được ghi lại.

## 6. phạm vi MVP

MVP sẽ bao gồm:

- Next.js, React, TypeScript, và Tailwind CSS.
- Node.js, Express.js, và phần phụ trợ TypeScript.
- PostgreSQL cơ sở dữ liệu.
- Đăng ký và đăng nhập của người thuê và chủ nhà.
- JWT xác thực và kiểm soát truy cập dựa trên vai trò.
- Chủ nhà cung cấp và cập nhật số điện thoại được yêu cầu, với email đăng nhập không thể thay đổi.
- Hiển thị trực tiếp số điện thoại và email của chủ nhà chỉ dành cho những người thuê nhà đã được xác thực trên các trang chi tiết để hiển thị công khai danh sách đã được phê duyệt.
- Bản thảo danh sách chủ nhà, gửi, chỉnh sửa, xem trạng thái và hủy kích hoạt.
- Cloudinary tải lên hình ảnh với xác nhận và giới hạn cơ bản.
- Nominatim mã hóa địa chỉ địa chỉ.
- Xác nhận hoặc điều chỉnh ghim bản đồ trước khi gửi danh sách.
- Quản trị viên phê duyệt danh sách, từ chối có lý do, ẩn và lịch sử kiểm duyệt.
-  Duyệt công khai các danh sách được phê duyệt và sở hữu bởi người đang hoạt động chủ nhà.
- Leaflet/OpenStreetMap bản đồ danh sách.
- Tìm kiếm và lọc giá, diện tích phòng, loại bất động sản và tiện nghi.
- Tìm kiếm danh sách theo khu vực và bán kính.
-  Lọc trước hộp giới hạn và tính toán Haversine cho bán kính tìm kiếm.
- Danh sách các trang chi tiết.
- Người thuê yêu thích.
- Phân trang, trạng thái tải, phản hồi xác thực và xử lý lỗi cơ bản.

## 7. Tính năng ngoài phạm vi

Các tính năng sau được loại trừ rõ ràng khỏi MVP:

- Thanh toán trực tuyến, đặt cọc, đặt chỗ và đặt chỗ.
- Tạo hợp đồng thuê và chữ ký điện tử.
- Trò chuyện trong thời gian thực giữa người thuê và chủ nhà.
- Hệ thống nhắn tin trong ứng dụng hoặc yêu cầu liên hệ.
- Số điện thoại bị che giấu hoặc dịch vụ định tuyến cuộc gọi.
- Email, SMS, đẩy hoặc hệ thống thông báo trong ứng dụng.
- Xếp hạng và đánh giá.
- Đề xuất dựa trên AI, dự đoán giá hoặc phát hiện gian lận.
- Đăng nhập xã hội.
- Ứng dụng di động gốc.
- Hỗ trợ đa ngôn ngữ.
- Phân tích nâng cao bảng điều khiển.
- Quy trình quản trị người dùng phức tạp.
- Tự động hoàn thành địa chỉ nâng cao.
- Chỉnh sửa hình ảnh tùy chỉnh hoặc kiểm duyệt hình ảnh tự động.
- Tối ưu hóa tìm kiếm trên toàn quốc hoặc đa quốc gia.
- Tích hợp PostGIS.

## 8. Các tính năng kỹ thuật chính

### Tìm kiếm dựa trên bản đồ

Hệ thống sẽ hiển thị các vị trí danh sách đã được phê duyệt dưới dạng Leaflet điểm đánh dấu sử dụng các ô xếp OpenStreetMap.

Người dùng có thể tìm kiếm dựa trên vị trí bản đồ đã chọn, bán kính đã chọn hoặc khu vực bản đồ hiển thị.

### Lưu trữ vĩ độ và kinh độ

Đối với MVP, mỗi danh sách sẽ lưu trữ:

- `latitude`
- `longitude`

Tọa độ phải được xác nhận trước khi lưu trữ:

- Vĩ độ phải nằm trong khoảng từ `-90` đến `90`.
- Kinh độ phải nằm trong khoảng từ `-180` đến `180`.

### Tìm kiếm bán kính Haversine

Hệ thống sẽ tính toán khoảng cách giữa điểm tìm kiếm và tọa độ liệt kê bằng công thức Haversine.

Danh sách sẽ chỉ xuất hiện trong kết quả tìm kiếm bán kính khi khoảng cách tính toán của nó nhỏ hơn hoặc bằng bán kính đã chọn.

### Lọc trước hộp giới hạn

Trước khi thực hiện các phép tính khoảng cách Haversine, hệ thống phải lấy hộp giới hạn vĩ độ/kinh độ từ điểm trung tâm và bán kính đã chọn.

Truy vấn cơ sở dữ liệu trước tiên phải trả về danh sách ứng viên bên trong hộp giới hạn đó. Tính toán Haversine sau đó sẽ xác định danh sách cuối cùng trong bán kính được yêu cầu.

Điều này làm giảm các tính toán không cần thiết và phù hợp với kích thước tập dữ liệu MVP dự kiến.

### Mã hóa địa lý và hiệu chỉnh vị trí

Hệ thống sẽ sử dụng Nominatim để mã hóa địa lý các địa chỉ do chủ nhà nhập vào.

Vì mã hóa địa lý có thể trả về kết quả không chính xác hoặc mơ hồ nên chủ nhà có thể xem xét và điều chỉnh điểm đánh dấu trên bản đồ trước khi gửi danh sách.

### Quy trình kiểm duyệt

Danh sách sẽ chỉ hiển thị trong chế độ xem bản đồ và tìm kiếm đối diện với người thuê khi trạng thái của họ là `APPROVED` và tài khoản chủ nhà của họ đang hoạt động.

Các hành động kiểm duyệt sẽ được ghi lại trong lịch sử kiểm duyệt niêm yết.

### Bảo vệ thông tin liên hệ

Hệ thống sẽ tách dữ liệu danh sách công khai khỏi dữ liệu liên hệ của chủ nhà được bảo vệ.

Phần phụ trợ sẽ chỉ trả lại thông tin liên hệ của chủ nhà sau khi xác minh phiên người thuê được xác thực hợp lệ và quyền truy cập vào trang chi tiết danh sách đã được phê duyệt hiển thị công khai.

### Kiểm soát truy cập dựa trên vai trò

Phần phụ trợ sẽ thực thi các quyền dựa trên vai trò của người dùng và quyền sở hữu danh sách. Chỉ kiểm soát khả năng hiển thị của giao diện người dùng sẽ không được coi là kiểm soát bảo mật.

## 9. Các giả định và hạn chế chính

- Dự án sẽ được phát triển bởi một sinh viên trong vòng khoảng tám tuần.
- Sinh viên này đã có kinh nghiệm trước đó với các dự án full-stack nhỏ nhưng chưa có kinh nghiệm về PostGIS hoặc microservices.
- Kiến trúc sẽ vẫn là một khối nguyên khối mô-đun; các dịch vụ vi mô không phải là một phần của dự án.
- MV ban đầu sẽ hỗ trợ một thành phố hoặc khu vực được xác định.
- Số lượng danh sách dự kiến đủ nhỏ cho PostgreSQL, lọc trước hộp giới hạn và tính toán Haversine.
- Thời gian thuê chính là hàng tháng.
- Hệ thống sẽ hỗ trợ một tập hợp các loại phòng và phòng được xác định trước có giới hạn tiện nghi.
- Mỗi người dùng sẽ cung cấp email đăng nhập không thể thay đổi và chủ nhà sẽ cung cấp thêm số điện thoại; điện thoại của người thuê vẫn là tùy chọn.
- Thông tin liên hệ của chủ nhà sẽ chỉ được hiển thị trực tiếp cho những người thuê được xác thực; MVP không làm trung gian liên lạc giữa những người dùng.
- Việc hiển thị vị trí chính xác cần được xem xét cẩn thận để bảo vệ quyền riêng tư của chủ nhà và người thuê nhà.
- Cần có quyền truy cập Internet đối với các ô bản đồ, mã hóa địa lý Nominatim và các dịch vụ hình ảnh Cloudinary.
- Giới hạn sử dụng Nominatim công cộng yêu cầu tần suất yêu cầu được kiểm soát và, trong trường hợp thực tế, bộ nhớ đệm của kết quả mã hóa địa lý.
- Tính toán Haversine không cung cấp hỗ trợ chỉ mục không gian gốc và có thể trở nên chậm hơn khi số lượng danh sách hoặc phạm vi địa lý tăng lên.
- Dự án sẽ ưu tiên quy trình làm việc cốt lõi hoàn chỉnh, đáng tin cậy hơn các tính năng nâng cao.

## 10. Lộ trình nâng cấp trong tương lai

Khi dự án yêu cầu quy mô lớn hơn hoặc các tính năng vị trí nâng cao hơn, RentMate có thể được nâng cấp dần dần.

Những cải tiến tiềm năng trong tương lai bao gồm:

</ nhiều thành phố hoặc khu vực.
- Thêm tin nhắn trong ứng dụng giữa người thuê và chủ nhà.
- Thêm phê duyệt yêu cầu liên hệ trước khi người thuê có thể bắt đầu liên hệ.
- Thêm số điện thoại ẩn, định tuyến cuộc gọi hoặc phương thức liên hệ bảo vệ quyền riêng tư.
- Thêm email hoặc thông báo trong ứng dụng để biết kết quả kiểm duyệt và hoạt động niêm yết.
- Thêm đặt chỗ hoặc đặt chỗ quy trình làm việc.
- Thêm các công cụ đánh giá, xếp hạng và báo cáo.
- Thêm phân tích cho chủ nhà và quản trị viên.
- Thêm tính năng tự động hoàn thành địa chỉ thông qua nhà cung cấp mã hóa địa lý phù hợp.
- Thêm các công cụ chống lừa đảo mạnh mẽ hơn và hỗ trợ kiểm duyệt tự động.

PostGIS đã được đánh giá trong quá trình thiết kế nhưng bị cố tình trì hoãn để giành MVP. PostgreSQL với khả năng lưu trữ trực tiếp vĩ độ/kinh độ, lọc trước hộp giới hạn và tính toán Haversine cung cấp cách triển khai đơn giản hơn và lộ trình triển khai nhanh hơn cho tập dữ liệu ban đầu nhỏ dự kiến.
