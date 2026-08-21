export interface PopularLocation {
  readonly city: string;
  readonly count: string;
  readonly image: string;
}

export interface UserReview {
  readonly name: string;
  readonly role: string;
  readonly avatar: string;
  readonly content: string;
  readonly rating: number;
}

export interface BlogPost {
  readonly title: string;
  readonly category: string;
  readonly date: string;
  readonly readTime: string;
  readonly image: string;
  readonly excerpt: string;
}

export interface FaqItem {
  readonly q: string;
  readonly a: string;
}

export const popularLocations: readonly PopularLocation[] = [
  {
    city: "TP. Hồ Chí Minh",
    count: "542+ phòng",
    image: "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=600&q=80"
  },
  {
    city: "Hà Nội",
    count: "189+ phòng",
    image: "https://images.unsplash.com/photo-1509030450996-93f2e3d84074?w=600&q=80"
  },
  {
    city: "Bình Dương",
    count: "94+ phòng",
    image: "https://images.unsplash.com/photo-1565182999561-18d7dc61c393?w=600&q=80"
  },
  {
    city: "Cần Thơ",
    count: "46+ phòng",
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&q=80"
  }
];

export const userReviews: readonly UserReview[] = [
  {
    name: "Nguyễn Thu Phương",
    role: "Sinh viên ĐH Bách Khoa TP.HCM",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&q=80",
    content: "Rentmate giúp mình tìm được phòng trọ gác lửng giá chỉ 2.8tr gần trường trong vòng 20 phút. Gọi trực tiếp chủ nhà không qua môi giới!",
    rating: 5
  },
  {
    name: "Hoàng Minh Đức",
    role: "Lập trình viên - Quận 10",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80",
    content: "Bản đồ tìm phòng bán kính gần trường rất tiện lợi. Hình ảnh phòng đúng thực tế 100%, thông tin minh bạch tuyệt đối.",
    rating: 5
  },
  {
    name: "Trần Bảo Hải",
    role: "Chủ chuỗi căn hộ mini Gò Vấp",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&q=80",
    content: "Tôi đăng 3 căn studio lên Rentmate buổi sáng thì chiều đã có khách hẹn xem phòng. Đăng tin hoàn toàn miễn phí và rất hiệu quả.",
    rating: 5
  }
];

export const blogPosts: readonly BlogPost[] = [
  {
    title: "5 Dấu hiệu nhận biết bẫy lừa đảo cọc phòng trọ năm 2026",
    category: "Kinh nghiệm thuê phòng",
    date: "12/08/2026",
    readTime: "4 phút đọc",
    image: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&q=80",
    excerpt: "Hướng dẫn cách kiểm tra giấy tờ chính chủ, hợp đồng đặt cọc và những thủ đoạn lừa tiền phổ biến sinh viên cần né tránh."
  },
  {
    title: "Checklist 10 điều cần kiểm tra trước khi ký hợp đồng thuê nhà",
    category: "Mẹo thuê nhà",
    date: "08/08/2026",
    readTime: "6 phút đọc",
    image: "https://images.unsplash.com/photo-1450133064473-71024230f91b?w=600&q=80",
    excerpt: "Kiểm tra đồng hồ điện nước, tình trạng chống thấm, quy định cọc và phí quản lý để không phát sinh chi phí bất ngờ."
  },
  {
    title: "Top 5 khu vực phòng trọ giá rẻ gần Làng Đại Học Thủ Đức",
    category: "Gợi ý vị trí",
    date: "01/08/2026",
    readTime: "5 phút đọc",
    image: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=600&q=80",
    excerpt: "Tổng hợp danh sách các tuyến đường an ninh, thuận tiện xe buýt dành cho tân sinh viên các trường ĐHQG."
  }
];

export const faqItems: readonly FaqItem[] = [
  {
    q: "Rentmate có thu phí người tìm phòng không?",
    a: "Hoàn toàn không. Rentmate miễn phí 100% cho người tìm phòng trọ, bạn có thể xem phòng và liên hệ trực tiếp với chủ nhà mà không mất bất kỳ khoản phí môi giới nào."
  },
  {
    q: "Làm thế nào để phân biệt tin đăng chính chủ đã xác minh?",
    a: "Tất cả bài đăng có huy hiệu 'Đã xác minh' đều đã được đội ngũ Rentmate kiểm tra giấy tờ căn cước công dân và hình ảnh thực tế của căn hộ."
  },
  {
    q: "Chủ nhà đăng tin cho thuê phòng có mất phí không?",
    a: "Hiện tại Rentmate hỗ trợ chủ nhà đăng tin cho thuê miễn phí không giới hạn số lượng bài viết."
  },
  {
    q: "Vị trí trên bản đồ có phải địa chỉ chính xác không?",
    a: "Để bảo vệ quyền riêng tư và an toàn của chủ nhà, vị trí hiển thị công khai trên bản đồ là tọa độ xấp xỉ đã được làm tròn an toàn."
  }
];

export const landlordBenefits = [
  {
    icon: "camera" as const,
    title: "Đăng tin nhanh chóng",
    text: "Chỉ 2 phút để tạo tin với ảnh, bản đồ và thông tin liên hệ."
  },
  {
    icon: "users" as const,
    title: "Tiếp cận khách thuê",
    text: "Tin đăng hiển thị ngay cho hàng nghìn người đang tìm phòng."
  },
  {
    icon: "shield" as const,
    title: "An toàn & minh bạch",
    text: "Xác minh danh tính, đánh giá từ cộng đồng, không qua trung gian."
  }
] as const;

export const threeStepsGuide = [
  {
    step: "01",
    title: "1. Tìm kiếm thông minh",
    text: "Nhập địa chỉ, chọn khu vực hoặc trường đại học để lọc danh sách phòng phù hợp ngân sách."
  },
  {
    step: "02",
    title: "2. Xác minh thông tin",
    text: "Xem hình ảnh thực tế, tiện nghi phòng và kiểm tra huy hiệu xác minh chủ nhà uy tín."
  },
  {
    step: "03",
    title: "3. Liên hệ trực tiếp",
    text: "Gọi điện trực tiếp cho chủ nhà để hẹn lịch xem phòng, không qua trung gian hay mất phí môi giới."
  }
] as const;

export const homepageCapabilities = [
  {
    title: "Tìm kiếm linh hoạt",
    role: "Lọc theo nhu cầu",
    description: "Chọn khu vực, loại hình, mức giá và tiện ích từ dữ liệu tin công khai."
  },
  {
    title: "Bản đồ trực quan",
    role: "Vị trí xấp xỉ",
    description: "Khám phá khu vực và vị trí xấp xỉ trước khi mở chi tiết tin đăng."
  },
  {
    title: "Tin công khai rõ ràng",
    role: "Theo quyền hệ thống",
    description: "Xem thông tin phù hợp với quyền tài khoản và trạng thái hiện tại của tin."
  }
] as const;

export const homepageGuides = [
  {
    category: "Kinh nghiệm xem phòng",
    title: "Kiểm tra thông tin trước khi thuê",
    excerpt: "Đọc kỹ tiêu đề, giá thuê, diện tích, tiện ích và khu vực trước khi liên hệ."
  },
  {
    category: "Cách tìm chỗ ở",
    title: "Lọc danh sách theo nhu cầu thực tế",
    excerpt: "Bắt đầu từ khu vực và loại hình, sau đó thu hẹp kết quả bằng các bộ lọc phù hợp."
  },
  {
    category: "Quản lý lựa chọn",
    title: "Lưu tin để so sánh sau",
    excerpt: "Tài khoản người thuê có thể lưu những tin công khai phù hợp để xem lại khi cần."
  }
] as const;
