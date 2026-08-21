import type { PublicListingSummary } from "../../types/api";
import type { IconName } from "../../components/ui/icon";

export const demoPropertyTypes = [
  { code: "ROOM", label: "Phòng trọ" },
  { code: "STUDIO", label: "Studio" },
  { code: "APARTMENT", label: "Căn hộ" },
  { code: "SHARED", label: "Ở ghép" }
] as const;

export const demoListings: readonly PublicListingSummary[] = [
  {
    id: 9101,
    title: "Studio nhiều nắng, ban công xanh ngay Thảo Điền",
    monthlyRent: 7_800_000,
    roomAreaSqm: 32,
    areaName: "Thảo Điền, TP. Thủ Đức",
    latitude: 10.802,
    longitude: 106.733,
    propertyType: demoPropertyTypes[1],
    amenities: [
      { code: "WIFI", label: "Wi-Fi" },
      { code: "BALCONY", label: "Ban công" },
      { code: "PARKING", label: "Chỗ để xe" }
    ],
    coverImage: {
      url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=85",
      altText: "Studio sáng với nội thất gỗ và cửa sổ lớn",
      displayOrder: 1
    },
    updatedAt: "2026-08-21T08:00:00.000Z"
  },
  {
    id: 9102,
    title: "Căn hộ mini phong cách retro, 5 phút đến Landmark 81",
    monthlyRent: 9_200_000,
    roomAreaSqm: 38,
    areaName: "Bình Thạnh, TP. Hồ Chí Minh",
    latitude: 10.793,
    longitude: 106.719,
    propertyType: demoPropertyTypes[2],
    amenities: [
      { code: "AIR_CON", label: "Máy lạnh" },
      { code: "ELEVATOR", label: "Thang máy" }
    ],
    coverImage: {
      url: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=85",
      altText: "Căn hộ mini phong cách retro",
      displayOrder: 1
    },
    updatedAt: "2026-08-20T09:30:00.000Z"
  },
  {
    id: 9103,
    title: "Phòng gác lửng tối giản, hẻm xe hơi yên tĩnh",
    monthlyRent: 4_600_000,
    roomAreaSqm: 26,
    areaName: "Phú Nhuận, TP. Hồ Chí Minh",
    latitude: 10.799,
    longitude: 106.681,
    propertyType: demoPropertyTypes[0],
    amenities: [
      { code: "WIFI", label: "Wi-Fi" },
      { code: "PRIVATE_HOURS", label: "Giờ giấc tự do" }
    ],
    coverImage: {
      url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=85",
      altText: "Phòng gác lửng tối giản tông trắng",
      displayOrder: 1
    },
    updatedAt: "2026-08-19T04:15:00.000Z"
  },
  {
    id: 9104,
    title: "Căn hộ một phòng ngủ cạnh công viên, có bếp riêng",
    monthlyRent: 8_500_000,
    roomAreaSqm: 42,
    areaName: "Quận 7, TP. Hồ Chí Minh",
    latitude: 10.735,
    longitude: 106.721,
    propertyType: demoPropertyTypes[2],
    amenities: [
      { code: "KITCHEN", label: "Bếp riêng" },
      { code: "SECURITY", label: "Bảo vệ 24/7" }
    ],
    coverImage: {
      url: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=85",
      altText: "Căn hộ một phòng ngủ có bếp mở",
      displayOrder: 1
    },
    updatedAt: "2026-08-18T12:00:00.000Z"
  }
];

export const neighborhoods = [
  {
    name: "Thảo Điền",
    note: "Sống xanh · cà phê · quốc tế",
    count: "128 chỗ ở",
    color: "lime",
    image: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=900&q=85"
  },
  {
    name: "Bình Thạnh",
    note: "Trung tâm · trẻ · thuận tiện",
    count: "216 chỗ ở",
    color: "blue",
    image: "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=900&q=85"
  },
  {
    name: "Phú Nhuận",
    note: "Yên tĩnh · kết nối nhanh",
    count: "94 chỗ ở",
    color: "coral",
    image: "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=900&q=85"
  }
] as const;

export const productSteps: readonly {
  number: string;
  title: string;
  description: string;
  icon: IconName;
}[] = [
  {
    number: "01",
    title: "Nói nơi bạn muốn sống",
    description: "Tìm theo khu vực, loại hình, ngân sách hoặc mở bản đồ để khoanh vùng chính xác hơn.",
    icon: "search"
  },
  {
    number: "02",
    title: "Đọc căn phòng như một hồ sơ",
    description: "Ảnh, tiện ích, diện tích, giá và vị trí xấp xỉ được trình bày rõ để bạn so sánh nhanh.",
    icon: "sparkles"
  },
  {
    number: "03",
    title: "Kết nối đúng người",
    description: "Người thuê đã đăng nhập có thể liên hệ trực tiếp chủ nhà khi tin vẫn đang công khai.",
    icon: "key"
  }
];

export const userReviews = [
  {
    quote:
      "Mình tìm được studio gần chỗ làm sau đúng một buổi tối. Phần bản đồ giúp loại nhanh những khu đi lại bất tiện.",
    name: "Thu Phương",
    role: "Thiết kế sản phẩm · TP.HCM",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&q=80"
  },
  {
    quote: "Giao diện cho mình cảm giác đang khám phá một khu phố, không phải lạc trong cả trăm mẫu tin giống nhau.",
    name: "Minh Đức",
    role: "Lập trình viên · Bình Thạnh",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&q=80"
  },
  {
    quote: "Tôi đăng tin, thêm ảnh và theo dõi trạng thái duyệt ngay trong một luồng. Mọi thứ rõ ràng và dễ kiểm soát.",
    name: "Bảo Hải",
    role: "Chủ căn hộ mini · Gò Vấp",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&q=80"
  }
] as const;

export const landlordBenefits: readonly { icon: IconName; title: string; text: string }[] = [
  { icon: "plus", title: "Tạo tin từng bước", text: "Bắt đầu bằng bản nháp và hoàn thiện khi bạn sẵn sàng." },
  { icon: "shield", title: "Kiểm duyệt minh bạch", text: "Theo dõi trạng thái và lý do duyệt ngay trên workspace." },
  { icon: "users", title: "Tiếp cận đúng người", text: "Tin được duyệt xuất hiện trong tìm kiếm công khai." }
];

export const faqItems = [
  {
    q: "RentMate có thu phí người tìm phòng không?",
    a: "Không. Người tìm phòng có thể duyệt tin, dùng bộ lọc và xem vị trí xấp xỉ hoàn toàn miễn phí."
  },
  {
    q: "Vị trí trên bản đồ có phải địa chỉ chính xác không?",
    a: "Không. Bản đồ công khai chỉ hiển thị tọa độ đã làm tròn để bảo vệ riêng tư; địa chỉ chính xác không được công khai."
  },
  {
    q: "Làm sao để lưu một tin ưng ý?",
    a: "Đăng nhập bằng tài khoản người thuê, sau đó chọn nút lưu trên thẻ hoặc trang chi tiết của tin đang công khai."
  },
  {
    q: "Tin của chủ nhà được hiển thị ngay không?",
    a: "Tin cần có đủ thông tin, ít nhất một ảnh và được quản trị viên duyệt trước khi xuất hiện công khai."
  }
] as const;
