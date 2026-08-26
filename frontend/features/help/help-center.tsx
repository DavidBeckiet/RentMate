"use client";

import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { SupportRequestCategory } from "../../types/api";

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
            Mở{" "}
            <Link className="font-bold text-teal-800 underline" href="/search">
              Tìm phòng
            </Link>
            , sau đó kết hợp khu vực, ngân sách, diện tích, số người ở, tiện ích và cách sắp xếp kết quả. Bạn có thể lưu
            bộ lọc để quay lại nhanh hơn.
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
            Có. Trang{" "}
            <Link className="font-bold text-teal-800 underline" href="/recently-viewed">
              Đã xem
            </Link>{" "}
            lưu danh sách phòng gần đây trên thiết bị của bạn. Lịch sử này không chứa tin nhắn, mật khẩu hay thông tin
            riêng tư khác.
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
            Chọn các tin muốn đối chiếu rồi mở trang{" "}
            <Link className="font-bold text-teal-800 underline" href="/compare">
              So sánh tin
            </Link>
            . Chức năng này giúp xem nhanh giá, diện tích, khu vực, loại phòng và tiện ích.
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

const supportCategoryLabels: Readonly<Record<SupportRequestCategory, string>> = {
  ACCOUNT: "Tài khoản",
  LISTING: "Tin đăng",
  SAFETY: "An toàn và báo cáo",
  TECHNICAL: "Lỗi kỹ thuật",
  OTHER: "Vấn đề khác"
};

const supportCategories: readonly SupportRequestCategory[] = ["ACCOUNT", "LISTING", "SAFETY", "TECHNICAL", "OTHER"];

function supportRequestError(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại để gửi yêu cầu.";
  if (error?.status === 429) return "Bạn đã gửi khá nhiều yêu cầu. Vui lòng thử lại sau một giờ.";
  if (error?.status === 422) return "Vui lòng kiểm tra lại tiêu đề và nội dung yêu cầu.";
  return "Chưa thể gửi yêu cầu lúc này. Vui lòng thử lại sau.";
}

function SupportRequestForm() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const [category, setCategory] = useState<SupportRequestCategory>("ACCOUNT");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);

  if (authStatus === "loading") {
    return <p className="text-sm font-semibold text-rent-secondary">Đang kiểm tra tài khoản…</p>;
  }
  if (authStatus === "anonymous") {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-6 text-slate-700">Bạn cần đăng nhập để RentMate biết nơi gửi phản hồi.</p>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center border-2 border-heroDark-950 bg-rent-surface px-4 font-display text-sm font-bold shadow-glass-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rent-coral"
        >
          Đăng nhập để gửi yêu cầu
        </Link>
      </div>
    );
  }
  if (authStatus === "error") {
    return (
      <div className="space-y-3" role="alert">
        <p className="text-sm font-semibold text-danger">Không thể kiểm tra tài khoản lúc này.</p>
        {authError?.requestId ? (
          <p className="text-xs font-semibold text-danger">Mã yêu cầu: {authError.requestId}</p>
        ) : null}
        <Button variant="secondary" onClick={() => void refresh()}>
          Thử lại
        </Button>
      </div>
    );
  }
  if (!user) return <p className="text-sm font-semibold text-rent-secondary">Chưa thể xác định tài khoản.</p>;

  if (createdId !== null) {
    return (
      <div className="space-y-4" role="status">
        <p className="text-sm font-bold text-teal-900">
          Đã gửi yêu cầu hỗ trợ #{createdId}. Đội ngũ RentMate sẽ xem và phản hồi trong ứng dụng.
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            setCreatedId(null);
            setSubject("");
            setMessage("");
            setFeedback(null);
          }}
        >
          Gửi yêu cầu khác
        </Button>
      </div>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const receipt = await api.contact.createSupportRequest({
        category,
        subject,
        message
      });
      setCreatedId(receipt.id);
    } catch (caught: unknown) {
      const error = caught instanceof ApiError ? caught : null;
      if (error?.status === 401) await refresh().catch(() => undefined);
      setFeedback(supportRequestError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-bold" htmlFor="support-category">
          Chủ đề
          <select
            id="support-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as SupportRequestCategory)}
            className="mt-2 min-h-12 w-full border-2 border-heroDark-950 bg-white px-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-rent-coral"
          >
            {supportCategories.map((value) => (
              <option key={value} value={value}>
                {supportCategoryLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold" htmlFor="support-subject">
          Tiêu đề
          <input
            id="support-subject"
            required
            maxLength={160}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Ví dụ: Không thể đăng nhập"
            className="mt-2 min-h-12 w-full border-2 border-heroDark-950 bg-white px-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-rent-coral"
          />
        </label>
      </div>
      <label className="block text-sm font-bold" htmlFor="support-message">
        Nội dung
        <textarea
          id="support-message"
          required
          minLength={1}
          maxLength={4000}
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Mô tả ngắn gọn vấn đề bạn đang gặp…"
          className="mt-2 w-full border-2 border-heroDark-950 bg-white p-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-rent-coral"
        />
      </label>
      {feedback ? (
        <p role="alert" className="border-2 border-heroDark-950 bg-rent-coral p-3 text-sm font-bold">
          {feedback}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending} pendingLabel="Đang gửi…">
          Gửi yêu cầu hỗ trợ
        </Button>
        <p className="text-xs font-medium text-rent-secondary">Không gửi mật khẩu hoặc mã OTP trong nội dung.</p>
      </div>
    </form>
  );
}

export function HelpCenter() {
  return (
    <section className="rm-workspace my-4 space-y-8" aria-labelledby="help-center-heading">
      <header className="border-2 border-heroDark-950 bg-rent-accent p-6 shadow-glass sm:p-8">
        <span className="rm-eyebrow">
          <Icon name="message" className="h-4 w-4" /> HỖ TRỢ RENTMATE
        </span>
        <h1
          id="help-center-heading"
          className="mt-4 max-w-3xl font-display text-4xl font-bold tracking-[-0.055em] sm:text-6xl"
        >
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
              <section
                key={group.title}
                className="border-2 border-heroDark-950 bg-rent-surface p-4 shadow-glass-sm sm:p-5"
              >
                <h3 className="font-display text-xl font-bold">{group.title}</h3>
                <div className="mt-3 divide-y-2 divide-heroDark-950 border-t-2 border-heroDark-950">
                  {group.items.map((item) => (
                    <details key={item.question} className="group py-4">
                      <summary className="flex min-h-11 list-none items-center justify-between gap-4 font-bold outline-none marker:hidden focus-visible:ring-4 focus-visible:ring-rent-coral">
                        <span>{item.question}</span>
                        <span
                          aria-hidden="true"
                          className="font-display text-2xl leading-none transition-transform group-open:rotate-45"
                        >
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
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 shrink-0 place-items-center border-2 border-heroDark-950 bg-white font-display text-sm font-bold"
                  >
                    {index + 1}
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="border-2 border-heroDark-950 bg-rent-yellow p-5 shadow-glass-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-700">Cần hỗ trợ thêm?</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.04em]">
              Gửi yêu cầu cho đội ngũ RentMate
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Nếu FAQ chưa giải đáp được vấn đề của bạn, hãy gửi yêu cầu hỗ trợ để đội ngũ tiếp nhận và phản hồi trong
              ứng dụng.
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

      <section
        id="support-request"
        className="border-2 border-heroDark-950 bg-rent-surface p-5 shadow-glass sm:p-8"
        aria-labelledby="support-request-heading"
      >
        <div className="max-w-2xl">
          <span className="rm-eyebrow">YÊU CẦU HỖ TRỢ</span>
          <h2 id="support-request-heading" className="mt-4 font-display text-3xl font-bold tracking-[-0.045em]">
            Gửi vấn đề cho RentMate
          </h2>
          <p className="mt-3 text-sm leading-6 text-rent-secondary">
            Chọn đúng chủ đề và mô tả ngắn gọn. Yêu cầu sẽ được đưa vào hàng đợi để admin tiếp nhận.
          </p>
        </div>
        <div className="mt-6 max-w-3xl">
          <SupportRequestForm />
        </div>
      </section>
    </section>
  );
}
