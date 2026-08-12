export default function HomePage() {
  return (
    <section className="max-w-2xl" aria-labelledby="home-heading">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Nền tảng RentMate</p>
      <h1 id="home-heading" className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
        Một nền tảng rõ ràng cho hành trình thuê nhà
      </h1>
      <p className="mt-6 text-base leading-7 text-slate-700 sm:text-lg sm:leading-8">
        RentMate đang xây dựng trải nghiệm kết nối người thuê và chủ nhà tại Thành phố Hồ Chí Minh. Các tính năng tìm
        kiếm và quản lý chỗ ở sẽ được bổ sung trong những bước tiếp theo.
      </p>
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Nền tảng giao diện đã sẵn sàng</h2>
        <p className="mt-2 leading-7 text-slate-600">
          Khung ứng dụng hỗ trợ điều hướng thích ứng, trạng thái tài khoản và kết nối API dùng chung.
        </p>
      </div>
    </section>
  );
}
