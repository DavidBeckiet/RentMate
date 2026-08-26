import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "../../components/ui/icon";

interface FaqItem {
  readonly question: string;
  readonly answer: ReactNode;
}

interface FaqGroup {
  readonly title: string;
  readonly items: readonly FaqItem[];
}

const faqGroups: readonly FaqGroup[] = [
  {
    title: "Tìm và xem phòng",
    items: [
      {
        question: "Làm sao để tìm phòng phù hợp?",
        answer: (
          <>
            Mở <Link className="font-bold text-teal-800 underline" href="/search">Tìm phòng</Link>, sau đó kết hợp
            khu vực, ngân sách, diện tích, số người ở, tiện ích và cách sắp xếp kết quả. Bạn có thể lưu bộ lọc để
            quay lại nhanh hơn.
          </>
        )
      },
      {
        question: "Vì sao vị trí trên bản đồ chỉ là vị trí gần đúng?",
        answer:
          "RentMate chỉ hiển thị vị trí công khai đã được làm tròn để bảo vệ địa chỉ chính xác của phòng. Hãy xác nhận địa chỉ và lối đi trực tiếp với chủ trọ trước khi quyết định."
      },
      {
        question: "Tin đã thuê có còn xuất hiện trong kết quả không?",
        answer:
          "Kết quả công khai chỉ dành cho tin đã được duyệt, chủ trọ còn hoạt động và tin vẫn được phép hiển thị. Chủ trọ cũng có thể cập nhật tình trạng thành đã thuê hoặc tạm dừng để tránh nhận liên hệ không cần thiết."
      },
      {
        question: "Tôi có thể xem lại các phòng vừa mở không?",
        answer: (
          <>
            Có. Trang <Link className="font-bold text-teal-800 underline" href="/recently-viewed">Đã xem</Link> lưu
            danh sách phòng gần đây trên thiết bị của bạn. Lịch sử này không chứa tin nhắn, mật khẩu hay thông tin riêng
            tư khác.
          </>
        )
      }
    ]
  },
  {
    title: "Liên hệ và tài khoản",
    items: [
      {
        question: "Làm sao để nhắn tin cho chủ trọ?",
        answer:
          "Đăng nhập bằng tài khoản người thuê, mở trang chi tiết một tin công khai và chọn Nhắn tin cho chủ trọ. Tin nhắn và phản hồi sẽ được giữ trong cuộc trò chuyện của RentMate."
      },
      {
        question: "Tôi có thể so sánh nhiều tin đăng không?",
        answer: (
          <>
            Chọn các tin muốn đối chiếu rồi mở trang <Link className="font-bold text-teal-800 underline" href="/compare">So
            sánh tin</Link>. Chức năng này giúp xem nhanh giá, diện tích, khu vực, loại phòng và tiện ích.
          </>
        )
      },
      {
        question: "Badge xác minh chủ trọ có ý nghĩa gì?",
        answer:
          "Badge cho biết hồ sơ chủ trọ đã được RentMate duyệt theo quy trình xác minh hiện có. Bạn vẫn nên xem phòng, kiểm tra thông tin và tự đánh giá giao dịch trước khi chuyển tiền."
      }
    ]
  }
];

const safetyRules = [
  "Không chuyển tiền đặt cọc hoặc phí giữ chỗ trước khi bạn đã xác minh phòng, người cho thuê và điều kiện thuê.",
  "Không gửi mật khẩu, mã OTP, giấy tờ nhạy cảm hoặc thông tin ngân hàng qua cuộc trò chuyện.",
  "Ưu tiên trao đổi trong RentMate, kiểm tra tình trạng tin và hỏi rõ các khoản cần thanh toán trước khi đi xem.",
  "Nếu gặp dấu hiệu lừa đảo, spam hoặc quấy rối, hãy dùng chức năng báo cáo để RentMate tiếp nhận và xử lý."
] as const;

export function HelpCenter() {
  return (
    <section className="rm-workspace my-4 space-y-8" aria-labelledby="help-center-heading">
      <header className="border-2 border-heroDark-950 bg-rent-accent p-6 shadow-glass sm:p-8">
        <span className="rm-eyebrow">
          <Icon name="message" className="h-4 w-4" /> HỖ TRỢ RENTMATE
        </span>
        <h1 id="help-center-heading" className="mt-4 max-w-3xl font-display text-4xl font-bold tracking-[-0.055em] sm:text-6xl">
          Tìm câu trả lời, thuê phòng an toàn hơn.
        </h1>
        <p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-slate-700">
          Hướng dẫn ngắn gọn về tìm phòng, liên hệ và những điều nên kiểm tra trước khi thuê.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <section className="space-y-5" aria-labelledby="help-faq-heading">
          <div>
            <span className="rm-eyebrow">CÂU HỎI THƯỜNG GẶP</span>
            <h2 id="help-faq-heading" className="mt-3 font-display text-3xl font-bold tracking-[-0.045em]">
              Giải đáp nhanh
            </h2>
          </div>
          <div className="space-y-4">
            {faqGroups.map((group) => (
              <section key={group.title} className="border-2 border-heroDark-950 bg-rent-surface p-4 shadow-glass-sm sm:p-5">
                <h3 className="font-display text-xl font-bold">{group.title}</h3>
                <div className="mt-3 divide-y-2 divide-heroDark-950 border-t-2 border-heroDark-950">
                  {group.items.map((item) => (
                    <details key={item.question} className="group py-4">
                      <summary className="flex min-h-11 list-none items-center justify-between gap-4 font-bold outline-none marker:hidden focus-visible:ring-4 focus-visible:ring-rent-coral">
                        <span>{item.question}</span>
                        <span aria-hidden="true" className="font-display text-2xl leading-none transition-transform group-open:rotate-45">
                          +
                        </span>
                      </summary>
                      <p className="max-w-2xl pt-3 text-sm leading-6 text-rent-secondary">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <aside className="space-y-5" aria-labelledby="help-safety-heading">
          <section className="border-2 border-heroDark-950 bg-rent-coral p-5 shadow-glass sm:p-6">
            <span className="rm-eyebrow bg-white">
              <Icon name="shield" className="h-4 w-4" /> AN TOÀN TRƯỚC TIÊN
            </span>
            <h2 id="help-safety-heading" className="mt-4 font-display text-3xl font-bold tracking-[-0.045em]">
              Checklist trước khi thuê
            </h2>
            <ul className="mt-5 space-y-4 text-sm font-semibold leading-6">
              {safetyRules.map((rule, index) => (
                <li key={rule} className="flex gap-3">
                  <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center border-2 border-heroDark-950 bg-white font-display text-sm font-bold">
                    {index + 1}
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="border-2 border-heroDark-950 bg-rent-yellow p-5 shadow-glass-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-700">Cần hỗ trợ thêm?</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.04em]">Gửi yêu cầu cho đội ngũ RentMate</h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Nếu FAQ chưa giải đáp được vấn đề của bạn, hãy gửi yêu cầu hỗ trợ để đội ngũ tiếp nhận và phản hồi trong ứng dụng.
            </p>
            <Link
              href="#support-request"
              className="mt-5 inline-flex min-h-11 items-center gap-2 border-2 border-heroDark-950 bg-rent-surface px-4 font-display text-sm font-bold shadow-glass-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rent-coral"
            >
              Gửi yêu cầu hỗ trợ
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </section>
        </aside>
      </div>
    </section>
  );
}
