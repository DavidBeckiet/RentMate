"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";

function inquiryError(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Chỉ tài khoản người thuê mới có thể gửi yêu cầu.";
  if (error?.status === 404) return "Tin đăng không còn công khai hoặc chủ trọ đã ngừng hoạt động.";
  if (error?.status === 409) return "Bạn đã có một yêu cầu đang mở cho tin này.";
  if (error?.status === 429) return "Bạn đang gửi hơi nhiều yêu cầu. Vui lòng thử lại sau ít phút.";
  if (error?.status === 422) return "Vui lòng kiểm tra lại nội dung và số điện thoại.";
  return "Không thể gửi yêu cầu lúc này. Vui lòng thử lại.";
}

export function InquiryForm({ listingId }: Readonly<{ listingId: number }>) {
  const { status: authStatus, user, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [preferredContactAt, setPreferredContactAt] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [createdInquiryId, setCreatedInquiryId] = useState<number | null>(null);

  if (authStatus === "loading") {
    return <p className="text-sm font-medium text-slate-600">Đang kiểm tra quyền nhắn tin…</p>;
  }
  if (authStatus === "anonymous") {
    return (
      <p className="text-sm leading-6 text-slate-600">
        <Link className="font-bold text-teal-800 underline decoration-2 underline-offset-4" href="/login">
          Đăng nhập để nhắn tin
        </Link>{" "}
        để nhắn tin cho chủ trọ.
      </p>
    );
  }
  if (authStatus === "error") {
    return (
      <div className="space-y-3" role="alert">
        <p className="text-sm text-red-700">Không thể kiểm tra quyền nhắn tin.</p>
        <Button variant="secondary" onClick={() => void refresh()}>
          Thử lại
        </Button>
      </div>
    );
  }
  if (!user || user.role !== "TENANT") {
    return <p className="text-sm text-slate-600">Chức năng nhắn tin dành cho tài khoản người thuê.</p>;
  }
  if (createdInquiryId !== null) {
    return (
      <div className="space-y-3" role="status">
        <p className="text-sm font-bold text-teal-800">Đã gửi yêu cầu. Chủ trọ sẽ nhận được thông báo.</p>
        <Link
          className="inline-flex min-h-11 items-center border-2 border-heroDark-950 bg-rent-accent px-5 py-2.5 font-display text-sm font-bold shadow-glass-sm transition-transform hover:-translate-y-0.5"
          href={`/inquiries/${createdInquiryId}`}
        >
          Mở cuộc trò chuyện
        </Link>
      </div>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const inquiry = await api.contact.createInquiry({
        listingId,
        message,
        contactPhone: phone.trim() || null,
        preferredContactAt: preferredContactAt ? new Date(preferredContactAt).toISOString() : null
      });
      setCreatedInquiryId(inquiry.id);
      setMessage("");
    } catch (caught: unknown) {
      const error = caught instanceof ApiError ? caught : null;
      if (error?.status === 401) await refresh().catch(() => undefined);
      setFeedback(inquiryError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={() => {
          setOpen((value) => !value);
          setFeedback(null);
        }}
        aria-expanded={open}
      >
        {open ? "Đóng khung nhắn tin" : "Nhắn tin cho chủ trọ"}
      </Button>
      {open ? (
        <form className="space-y-4 border-t-2 border-heroDark-950 pt-4" onSubmit={(event) => void submit(event)}>
          <div>
            <label
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500"
              htmlFor="inquiry-message"
            >
              Nội dung lời nhắn
            </label>
            <textarea
              id="inquiry-message"
              required
              minLength={1}
              maxLength={4000}
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ví dụ: Mình muốn hỏi phòng còn trống và chi phí đầu vào…"
              className="w-full border-2 border-heroDark-950 bg-white p-3 text-sm font-medium outline-none transition-shadow focus-visible:shadow-glass-sm"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500"
              htmlFor="inquiry-phone"
            >
              Số điện thoại liên hệ
            </label>
            <input
              id="inquiry-phone"
              type="tel"
              maxLength={32}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Dùng số trong hồ sơ nếu để trống"
              className="w-full border-2 border-heroDark-950 bg-white p-3 text-sm font-medium outline-none transition-shadow focus-visible:shadow-glass-sm"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500"
              htmlFor="inquiry-time"
            >
              Thời gian mong muốn được liên hệ (tùy chọn)
            </label>
            <input
              id="inquiry-time"
              type="datetime-local"
              value={preferredContactAt}
              onChange={(event) => setPreferredContactAt(event.target.value)}
              className="w-full border-2 border-heroDark-950 bg-white p-3 text-sm font-medium outline-none transition-shadow focus-visible:shadow-glass-sm"
            />
          </div>
          {feedback ? (
            <p role="alert" className="border-2 border-heroDark-950 bg-rent-coral p-3 text-sm font-bold">
              {feedback}
            </p>
          ) : null}
          <Button type="submit" pending={pending} pendingLabel="Đang gửi…">
            Gửi yêu cầu liên hệ
          </Button>
        </form>
      ) : null}
    </div>
  );
}
