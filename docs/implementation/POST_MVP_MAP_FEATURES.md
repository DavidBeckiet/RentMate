# RentMate — Kế hoạch tính năng bản đồ hậu MVP

> Trạng thái: kế hoạch triển khai chi tiết; chưa mở rộng code trong tài liệu này.
>
> Phạm vi: cải thiện trải nghiệm tìm phòng bằng bản đồ, nhưng vẫn giữ nguyên privacy, API và quy tắc tìm kiếm hiện tại của RentMate.

## 1. Mục tiêu

Bản đồ cần giúp tenant trả lời nhanh ba câu hỏi:

1. Phòng nằm ở khu vực nào?
2. Có những phòng nào quanh vị trí đang quan tâm?
3. Phòng đang xem có phù hợp với khu vực tìm kiếm hay không?

Bản đồ là một phần của trang tìm kiếm, không tạo một sản phẩm bản đồ riêng.

## 2. Khả năng hiện tại

Các nền tảng đã có trong RentMate:

- [x] Hiển thị bản đồ Leaflet trong luồng tìm kiếm.
- [x] Tìm theo vùng bản đồ sau khi tenant chủ động xác nhận tìm kiếm.
- [x] Tìm theo bán kính quanh một tâm bản đồ.
- [x] Chọn tâm thủ công hoặc dùng vị trí hiện tại của trình duyệt.
- [x] Hiển thị vị trí công khai ở dạng gần đúng.
- [x] Landlord chọn và xác nhận vị trí khi đăng tin qua luồng backend phù hợp.
- [x] Giữ attribution của OpenStreetMap.

Các giới hạn này tiếp tục được giữ nguyên:

- Không công khai địa chỉ và tọa độ chính xác của listing.
- Di chuyển bản đồ không tự động gọi API; tenant phải bấm hành động tìm kiếm rõ ràng.
- Không theo dõi vị trí nền của tenant.
- Không dùng autocomplete hoặc reverse geocoding công khai.

## 3. Thứ tự ưu tiên

### P0 — Cải thiện ngay trong trang tìm kiếm

#### 3.1 Đồng bộ danh sách và bản đồ

- Khi tenant chọn một card, marker tương ứng được làm nổi bật.
- Khi tenant chọn marker, card tương ứng được làm nổi bật hoặc cuộn tới.
- Trạng thái chọn không làm thay đổi query nếu tenant chưa bấm tìm kiếm.
- Trên desktop dùng bố cục danh sách — bản đồ; trên mobile ưu tiên chuyển đổi rõ ràng giữa hai chế độ.

#### 3.2 Gom marker gần nhau

- Các marker gần nhau được hiển thị thành cluster có số lượng.
- Bấm cluster sẽ phóng to bản đồ và tách thành các marker con.
- Số lượng cluster chỉ phản ánh các listing public hợp lệ trong kết quả hiện tại.
- Không để cluster làm lộ tọa độ chính xác hơn mức public projection cho phép.

#### 3.3 Popup xem nhanh từ marker

Popup chỉ hiển thị thông tin public tối thiểu:

- Ảnh đại diện.
- Tiêu đề.
- Giá và diện tích.
- Trạng thái còn phòng nếu có.
- Nút xem chi tiết.

Popup không hiển thị contact landlord, địa chỉ chính xác, tọa độ thô hoặc dữ liệu moderation.

### P1 — Kết nối với hành vi quay lại

#### 3.4 Lưu khu vực bản đồ cùng saved search

- Lưu bounds hoặc bán kính cùng các bộ lọc đã chọn.
- Cho phép tenant bật/tắt thông báo.
- Không tạo một cơ chế lưu khác nếu saved search hiện tại đã đáp ứng contract.
- Listing được thông báo phải tiếp tục đi qua public visibility và business status hiện tại.

#### 3.5 Trạng thái khu vực rõ ràng

- Hiển thị nhãn khu vực đang xem và số kết quả.
- Có nút `Tìm trong khu vực này` khi viewport thay đổi.
- Có nút đặt lại viewport về kết quả hiện tại.
- Có loading, empty, lỗi mạng và retry mà không làm mất bộ lọc đã nhập.

### P2 — Chỉ làm khi có nhu cầu sử dụng thực tế

#### 3.6 Tìm theo thời gian di chuyển

Ví dụ: tìm phòng cách trường hoặc nơi làm việc dưới 20 phút.

Phần này cần dịch vụ routing bên ngoài, chính sách giới hạn request, xử lý giờ cao điểm và cách hiển thị sai số. Chưa đưa vào giai đoạn đầu.

#### 3.7 Lớp địa điểm lân cận

Có thể hiển thị trường học, trạm xe buýt, bệnh viện hoặc chợ ở mức tổng quan. Chỉ triển khai sau khi chốt nguồn dữ liệu, giấy phép sử dụng và quy tắc privacy.

## 4. Luồng UX đề xuất

```text
Tenant chọn bộ lọc
        ↓
Xem danh sách + bản đồ
        ↓
Chọn card hoặc marker
        ↓
Xem popup tóm tắt
        ↓
Mở chi tiết listing
```

Khi tenant kéo bản đồ:

```text
Viewport thay đổi → hiện “Tìm trong khu vực này” → tenant xác nhận → gọi search API
```

Không nên tạo một nút nổi toàn trang hoặc một trang map riêng ở giai đoạn đầu.

## 5. Ranh giới kỹ thuật và privacy

- Giữ Leaflet ở client-side theo quy tắc frontend hiện tại.
- Giữ OSM attribution luôn hiển thị.
- Dùng public projection hiện tại cho marker và bounds; không truyền exact coordinates ra frontend.
- Geocoding vẫn là backend-only, có timeout, rate limit và header nhận diện.
- Không lưu vị trí hiện tại của tenant vào database nếu tenant chưa chủ động gửi trong query.
- Không thêm bảng hoặc endpoint mới cho P0 nếu có thể dùng search contract hiện tại.
- Không để thao tác chọn marker hoặc di chuyển map vô tình ghi analytics nhạy cảm.

## 6. Checklist kiểm thử

- [ ] Marker và card đồng bộ hai chiều.
- [ ] Cluster hoạt động khi nhiều listing gần nhau.
- [ ] Popup không lộ địa chỉ, tọa độ chính xác hoặc contact.
- [ ] Di chuyển map không tự gọi search API.
- [ ] Nút `Tìm trong khu vực này` dùng đúng bounds mới.
- [ ] Radius và bounds không bị gửi đồng thời.
- [ ] Có loading, empty, error và retry.
- [ ] Responsive tại 375, 768, 1024 và 1440px.
- [ ] Keyboard focus và touch target hoạt động.
- [ ] OpenStreetMap attribution vẫn hiển thị.

## 7. Ngoài phạm vi hiện tại

- Chỉ đường thời gian thực.
- Theo dõi vị trí nền.
- Công khai địa chỉ chính xác cho người xem bất kỳ.
- Heatmap giá hoặc mật độ nếu chưa có dữ liệu đủ tin cậy.
- Một microservice bản đồ riêng.

## 8. Kết quả rà soát codebase hiện tại

Kế hoạch này bám theo các seam đã có, không giả định xây lại trang tìm kiếm:

- `frontend/components/map/map-base.tsx` là boundary chung, tải Leaflet client-side và đang nhận marker, viewport, click bản đồ và drag marker.
- `frontend/components/map/leaflet-map.tsx` đang sở hữu `MapContainer`, `TileLayer`, `Marker`, `Tooltip`, radius circle và bridge sự kiện `moveend`.
- `frontend/features/listings/search-map.tsx` chuyển `PublicListingSummary` thành marker và hiển thị nút `Tìm trong khu vực này` khi viewport thay đổi.
- `frontend/features/listings/search-page.tsx` sở hữu kết quả, URL query, pending viewport, radius center, trạng thái mở map mobile và card kết quả.
- `frontend/features/listings/listing-card.tsx` hiện được dùng ở nhiều màn hình, nên props đồng bộ map phải là tùy chọn và không làm thay đổi card ngoài trang search.
- `frontend/features/listings/search-query.ts` đã bảo vệ bounds/radius loại trừ lẫn nhau, serialize state vào URL và giữ sort hợp lệ theo từng mode.
- Saved search hiện đã lưu đủ ba mode `ordinary`, `bounds`, `radius` trong `frontend/features/saved-searches/saved-search-query.ts` và Engagement Service.
- Public summary đã có toàn bộ dữ liệu cần cho popup: ảnh cover, tiêu đề, giá, diện tích, sức chứa, khu vực, tiện ích, business status và tọa độ public đã làm tròn.

Hệ quả thiết kế:

- Đồng bộ card–marker, popup và trạng thái viewport không cần endpoint hoặc migration mới.
- Hạng mục “lưu khu vực bản đồ” chủ yếu là hoàn thiện UX và regression test cho saved search hiện có.
- Clustering là phần duy nhất có thể cần dependency frontend; quyết định dependency phải được tách riêng và kiểm tra tương thích trước khi thêm.

## 9. Quyết định thiết kế trước khi triển khai

### 9.1 Nguồn sở hữu state

`SearchPage` tiếp tục là nguồn dữ liệu duy nhất cho kết quả tìm kiếm và sở hữu thêm:

- `activeListingId`: listing đang được chọn từ card hoặc marker.
- `interactionSource`: `CARD` hoặc `MAP`, dùng để tránh vòng lặp cuộn/focus.
- `pendingViewport`: viewport mới chưa được tenant xác nhận, giữ cơ chế hiện tại.
- `mobileMapOpen`: giữ nguyên hành vi mở/đóng map mobile.

Không lưu `activeListingId` vào URL, localStorage hoặc database vì đây chỉ là state trình bày tạm thời.

Khi query, trang hoặc kết quả thay đổi:

1. Nếu listing đang chọn vẫn còn trong `items`, giữ lựa chọn.
2. Nếu listing không còn trong kết quả, xóa lựa chọn và đóng popup.
3. Không tự động chọn listing đầu tiên.
4. Không tự động pan map chỉ vì card xuất hiện lại sau loading.

### 9.2 Boundary component bản đồ

`MapBase` chỉ nhận khả năng chung, không nhận DTO listing trực tiếp. Phần mở rộng dự kiến:

- Marker có trạng thái được chọn.
- Callback chọn marker, tách khỏi callback drag marker.
- Slot hoặc renderer popup mang tính trình bày, do `SearchMap` cung cấp.
- Cluster mode là tùy chọn; owner/admin map một marker vẫn giữ hành vi cũ.

Nội dung listing-specific như giá, ảnh và link chi tiết nằm trong feature listing, không đưa vào component map dùng chung.

### 9.3 Quy tắc card–marker

- Hover card trên thiết bị có con trỏ chỉ highlight marker; không mở popup và không đổi URL.
- Focus card bằng bàn phím cũng highlight marker.
- Click card hoặc nút “Xem trên bản đồ” chọn marker và mở map nếu đang ở mobile.
- Click marker chọn card, mở popup và cuộn card vào vùng nhìn thấy khi phù hợp.
- Không cướp focus bàn phím sau thao tác pointer.
- Dùng `aria-current` hoặc mô tả tương đương để thông báo card đang được chọn trên map.

### 9.4 Quy tắc viewport

- `moveend` chỉ cập nhật `pendingViewport`.
- Chỉ nút `Tìm trong khu vực này` mới chuyển pending viewport thành bounds query.
- Click marker, mở popup và hover không tạo search request.
- Zoom do mở cluster vẫn chỉ tạo pending viewport; không tự tìm lại.
- Khi tenant chuyển sang radius mode, bounds pending cũ phải bị xóa.

### 9.5 Quyết định clustering

Trước khi thêm package, thực hiện một spike nhỏ với tối đa 20 marker trên trang hiện tại:

1. Kiểm tra khả năng cluster theo zoom, spiderfy marker trùng vị trí và keyboard interaction.
2. Kiểm tra tương thích với Leaflet `1.9.4`, React Leaflet `5.0.0`, React `19.1.0` và Next `16.3.2`.
3. Chỉ chọn dependency maintained, không kéo theo map framework thứ hai và không thay tile provider.
4. Nếu không có dependency phù hợp, dừng riêng hạng mục cluster; vẫn có thể hoàn tất card–marker và popup.

Không tự viết thuật toán geospatial clustering phức tạp chỉ để tránh một dependency đã được đánh giá phù hợp.

## 10. Kế hoạch triển khai theo giai đoạn

### Giai đoạn 0 — Khóa baseline và contract

Mục tiêu: chứng minh hành vi hiện tại trước khi thêm interaction.

Công việc:

- Bổ sung test baseline rằng `moveend` chỉ tạo pending viewport và chưa gọi search.
- Bổ sung test radius/bounds vẫn loại trừ lẫn nhau.
- Xác nhận popup sẽ dùng đúng `PublicListingSummary`, không gọi detail API cho từng marker và không tạo N+1.
- Ghi nhận ảnh chụp baseline ở 375, 768, 1024 và 1440px vào thư mục tạm ngoài repository.

File dự kiến:

- `frontend/components/map/map-base.test.tsx`
- `frontend/features/listings/search-map.test.tsx`
- `frontend/features/listings/search-page.test.tsx`

Điều kiện hoàn thành:

- Test mô tả đúng hành vi hiện tại và pass trước khi code chức năng.
- Không thay API, database hoặc business logic.

### Giai đoạn 1 — Đồng bộ card và marker

Mục tiêu: tenant nhận biết ngay card nào tương ứng với marker nào.

Công việc backend/database:

- Không có.

Công việc frontend:

1. Mở rộng type marker và marker event ở map boundary.
2. Thêm selected visual state cho marker mà không thay owner/admin marker.
3. Đưa `activeListingId` lên `SearchPage`.
4. Truyền callback tùy chọn vào `ListingCard` chỉ ở variant search.
5. Tạo anchor/reference cho card để cuộn có kiểm soát khi chọn từ map.
6. Xóa selection khi kết quả mới không còn listing đang chọn.
7. Giữ favorite, compare, link detail và analytics hiện tại hoạt động độc lập.

File dự kiến sửa:

- `frontend/components/map/map-base.tsx`
- `frontend/components/map/leaflet-map.tsx`
- `frontend/components/map/map-base.test.tsx`
- `frontend/features/listings/search-map.tsx`
- `frontend/features/listings/search-map.test.tsx`
- `frontend/features/listings/search-page.tsx`
- `frontend/features/listings/search-page.module.css`
- `frontend/features/listings/search-page.test.tsx`
- `frontend/features/listings/listing-card.tsx`
- `frontend/features/listings/listing-card.module.css`
- `frontend/features/listings/listing-card.test.tsx`

Test bắt buộc:

- Chọn card làm đúng marker nổi bật.
- Chọn marker làm đúng card nổi bật.
- Hover/focus không gọi search API.
- Đổi trang xóa selection không còn hợp lệ.
- Card ở homepage, similar, favorites và recently viewed không đổi hành vi.

Điều kiện hoàn thành:

- Đồng bộ hai chiều hoạt động bằng pointer và keyboard.
- Không có request phát sinh ngoài search/favorite/analytics hiện có.
- Không có horizontal overflow ở bốn breakpoint.

Commit dự kiến: `dong bo danh sach va ban do`

### Giai đoạn 2 — Popup xem nhanh

Mục tiêu: tenant xem đủ thông tin quyết định có mở detail hay không.

Công việc:

1. Tạo component popup listing riêng trong feature search.
2. Render popup trong marker đang chọn.
3. Tái sử dụng formatter giá/diện tích và public image hiện có.
4. Link “Xem chi tiết” dùng route `/listings/:listingId` hiện tại.
5. Popup đóng khi chọn marker khác, đóng map mobile hoặc kết quả thay đổi.
6. Không fetch detail và không render contact.

File dự kiến tạo:

- `frontend/features/listings/search-map-listing-popup.tsx`
- `frontend/features/listings/search-map-listing-popup.test.tsx`

File dự kiến sửa:

- `frontend/components/map/map-base.tsx`
- `frontend/components/map/leaflet-map.tsx`
- `frontend/features/listings/search-map.tsx`
- Các test map liên quan.

Test bắt buộc:

- Popup hiển thị đúng title, giá, diện tích, khu vực và trạng thái còn phòng.
- Ảnh có alt text an toàn.
- Không có landlord contact, exact address, raw coordinates, report hoặc moderation data.
- Link detail đúng listing và hoạt động bằng bàn phím.

Điều kiện hoàn thành:

- Popup không làm map nhảy viewport ngoài ý muốn.
- Không tạo N+1 request.
- Public privacy projection giữ nguyên.

Commit dự kiến: `them xem nhanh phong tren ban do`

### Giai đoạn 3 — Gom marker

Mục tiêu: tránh chồng marker khi nhiều phòng có tọa độ public gần hoặc giống nhau.

Công việc:

1. Hoàn tất dependency spike và ghi lý do chọn/không chọn package trong diff handoff.
2. Nếu thêm dependency, chỉ cập nhật `frontend/package.json` và lockfile npm hiện tại.
3. Cluster chỉ nhận marker trong trang kết quả hiện tại; không tự fetch thêm listing.
4. Click cluster zoom/focus nhưng không tự gọi search.
5. Cluster count cập nhật khi kết quả, filter hoặc trang thay đổi.
6. Marker được chọn vẫn có visual state rõ khi cluster bung ra.

File dự kiến:

- `frontend/package.json` và `frontend/package-lock.json` nếu thật sự cần dependency.
- `frontend/components/map/leaflet-map.tsx`
- Có thể tạo `frontend/components/map/marker-cluster-layer.tsx` và test tương ứng.
- `frontend/components/map/map-base.test.tsx`
- `frontend/features/listings/search-map.test.tsx`

Test bắt buộc:

- Nhiều marker gần nhau tạo đúng cluster count.
- Marker ở xa không bị gom sai.
- Zoom cluster không gọi search API.
- Thay trang hoặc filter loại marker cũ khỏi cluster.
- Attribution vẫn hiển thị.

Điều kiện hoàn thành:

- Không có lỗi hydration hoặc SSR vì Leaflet vẫn client-side.
- Bundle và production build pass.
- Nếu dependency không đạt tiêu chí, hạng mục này được ghi blocked riêng, không chặn hai giai đoạn trước.

Commit dự kiến: `gom marker ket qua ban do`

### Giai đoạn 4 — Hoàn thiện lưu khu vực và trạng thái map

Mục tiêu: làm rõ rằng tenant đang lưu cả bộ lọc và khu vực map.

Công việc:

1. Đổi nhãn `Lưu bộ lọc` thành nội dung phù hợp theo mode, ví dụ `Lưu tìm kiếm khu vực này` khi có bounds/radius.
2. Hiển thị tóm tắt khu vực đã lưu trong trang saved searches.
3. Mở saved search phải khôi phục đúng viewport/query và sort.
4. Giữ notification dedupe và public visibility hiện tại.
5. Không tạo migration vì schema/query đã hỗ trợ bounds và radius.

File dự kiến:

- `frontend/features/saved-searches/save-search-control.tsx`
- `frontend/features/saved-searches/saved-search-query.ts`
- `frontend/features/saved-searches/saved-searches-page.tsx`
- Các test saved search tương ứng.

Test bắt buộc:

- Lưu/mở lại ordinary, bounds và radius.
- Radius luôn khôi phục `distance_asc`.
- Bounds không chứa radius và ngược lại.
- Anonymous vẫn được dẫn tới login; role khác không thấy control tenant.

Điều kiện hoàn thành:

- Không thay database hoặc API saved search.
- URL khôi phục chính xác khu vực và filter.

Commit dự kiến: `hoan thien luu khu vuc ban do`

### Giai đoạn 5 — Visual QA và regression

Mục tiêu: đóng hạng mục map mà không làm giảm chất lượng trang search.

Kiểm tra tự động:

```text
frontend: npm test -- components/map/map-base.test.tsx features/listings/search-map.test.tsx features/listings/search-page.test.tsx features/listings/listing-card.test.tsx
frontend: npm run typecheck
frontend: npm run lint
frontend: npm run format:check
frontend: npm run build
```

Kiểm tra Playwright/Chromium:

- 375x812: mở/đóng map, chọn marker, popup không vượt viewport.
- 768x1024: map và list không gây horizontal overflow.
- 1024x768 và 1440x900: selection hai chiều, cluster, popup, viewport pending.
- Keyboard-only: đi qua card, nút map, popup và link detail.
- `prefers-reduced-motion`: không có animation bắt buộc.

Screenshot và script QA tạm phải nằm ngoài repository.

Commit dự kiến nếu chỉ có test/QA source cần lưu: `bo sung regression ban do tim phong`

## 11. Ma trận thay đổi contract

| Hạng mục | Frontend | Gateway/API | Database | External provider |
|---|---|---|---|---|
| Đồng bộ card–marker | Có | Không | Không | Không |
| Popup marker | Có | Không | Không | Không |
| Cluster marker | Có | Không | Không | Có thể thêm library frontend |
| Lưu bounds/radius | UX và test | Dùng contract hiện có | Dùng schema hiện có | Không |
| Thời gian di chuyển | Để sau | Cần contract mới | Chưa chốt | Cần routing provider |
| POI lân cận | Để sau | Cần contract mới | Chưa chốt | Cần nguồn dữ liệu |

## 12. Rủi ro và cách kiểm soát

- Marker public có thể trùng vị trí vì tọa độ được làm tròn: cluster/spiderfy phải xử lý mà không suy đoán exact coordinates.
- Card có nhiều action lồng nhau: không biến toàn bộ card thành button gây xung đột với favorite/compare/link.
- Leaflet chạy client-side: mọi module đụng `window` phải nằm sau dynamic import, tránh hydration mismatch.
- Map event dễ tạo request ngoài ý muốn: test phải đếm số lần gọi search API sau từng hover, marker click, zoom và move.
- Popup ảnh có thể làm layout shift: đặt kích thước cố định và fallback khi ảnh lỗi.
- Clustering dependency có thể ảnh hưởng bundle: kiểm tra production build và chỉ giữ package khi giá trị rõ ràng.
- Mobile map có diện tích hẹp: popup ưu tiên nội dung ngắn, touch target tối thiểu 44px và có cách đóng rõ ràng.

## 13. Definition of done cho nhóm Map P0/P1

Nhóm Map được xem là hoàn thành khi:

- Card–marker đồng bộ hai chiều và popup public-safe hoạt động.
- Cluster đã hoàn thành hoặc có blocker dependency cụ thể được tách riêng.
- Map movement vẫn yêu cầu tenant bấm `Tìm trong khu vực này`.
- Bounds/radius/sort serialize và khôi phục ổn định.
- Saved search mở lại đúng khu vực mà không cần migration mới.
- Focus, keyboard, mobile touch và responsive pass.
- Typecheck, lint, focused tests, production build và Playwright pass.
- Diff không thay listing lifecycle, privacy projection, geocoding contract hoặc backend authorization.

## 14. Thứ tự commit đề xuất

1. `dong bo danh sach va ban do`
2. `them xem nhanh phong tren ban do`
3. `gom marker ket qua ban do`
4. `hoan thien luu khu vuc ban do`
5. `bo sung regression ban do tim phong`

Chỉ commit sau khi giai đoạn tương ứng có test pass; không gộp dependency clustering với thay đổi card–marker nếu chưa cần thiết.

## 15. Quy tắc thực hiện

- Mỗi chức năng độc lập hoàn tất phải được kiểm tra, review diff và commit riêng ngay sau đó.
- Không gộp nhiều chức năng hoàn tất vào một commit chỉ để giảm số lượng commit.
- Trên Windows, mọi script Python trong quá trình QA hoặc tooling phải chạy bằng lệnh `py`, không dùng lệnh `python`.
- Script tạm, screenshot và artifact QA vẫn phải nằm ngoài repository.
