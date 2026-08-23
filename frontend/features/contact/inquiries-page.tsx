"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { Inquiry } from "../../types/api";

function statusLabel(status: Inquiry["status"]): string {
  return status === "NEW" ? "Mới" : status === "CONTACTED" ? "Đang trao đổi" : "Đã đóng";
}

function errorMessage(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Tài khoản này không có quyền xem các yêu cầu.";
  return "Không thể tải các yêu cầu lúc này.";
}

export function InquiriesPage({ landlord = false }: Readonly<{ landlord?: boolean }>) {
  const { status: authStatus, user, refresh } = useAuth();
  const [data, setData] = useState<readonly Inquiry[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retry, setRetry] = useState(0);
  const allowed =
    authStatus === "authenticated" &&
    ((landlord && user?.role === "LANDLORD") || (!landlord && user?.role === "TENANT"));

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setState("loading");
    const request = landlord
      ? api.contact.listLandlordInquiries({}, controller.signal)
      : api.contact.listTenantInquiries({}, controller.signal);
    void request
      .then((page) => {
        if (controller.signal.aborted) return;
        setData(page.data);
        setState("success");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof ApiError ? caught : null);
        setState("error");
      });
    return () => controller.abort();
  }, [allowed, landlord, retry]);

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous") {
    return (
      <EmptyState
        title="Đăng nhập để xem yêu cầu"
        description="Các cuộc trò chuyện với chủ trọ sẽ xuất hiện ở đây."
        action={
          <Link className="font-bold text-teal-800 underline" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  }
  if (authStatus === "error")
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản."
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  if (!allowed)
    return (
      <EmptyState title="Bạn không có quyền truy cập" description="Khu vực này dành cho đúng loại tài khoản của bạn." />
    );
  if (state === "loading" || state === "idle") return <LoadingState message="Đang tải yêu cầu…" />;
  if (state === "error")
    return (
      <ErrorState
        message={errorMessage(error)}
        requestId={error?.requestId}
        action={<Button onClick={() => setRetry((value) => value + 1)}>Thử lại</Button>}
      />
    );

  return (
    <section className="rm-workspace my-4 space-y-8" aria-labelledby="inquiries-heading">
      <header className="space-y-3 border-2 border-heroDark-950 bg-rent-accent p-6 shadow-glass sm:p-8">
        <span className="rm-eyebrow">KẾT NỐI RENTMATE</span>
        <h1 id="inquiries-heading" className="font-display text-4xl font-bold tracking-[-0.055em] sm:text-6xl">
          {landlord ? "Yêu cầu cần xử lý" : "Yêu cầu của tôi"}
        </h1>
        <p className="max-w-2xl text-sm font-medium leading-6 text-slate-700">
          {landlord
            ? "Theo dõi khách thuê đang chờ phản hồi và tiếp tục cuộc trao đổi."
            : "Theo dõi những tin đăng bạn đã chủ động liên hệ."}
        </p>
      </header>
      {data.length === 0 ? (
        <EmptyState
          title="Chưa có yêu cầu nào"
          description={
            landlord
              ? "Khi khách thuê nhắn tin, yêu cầu mới sẽ xuất hiện ở đây."
              : "Mở một tin đăng công khai để gửi yêu cầu liên hệ."
          }
          action={
            !landlord ? (
              <Link className="font-bold text-teal-800 underline" href="/search">
                Tìm phòng
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4" aria-label="Danh sách yêu cầu">
          {data.map((inquiry) => (
            <Link
              key={inquiry.id}
              href={`/inquiries/${inquiry.id}`}
              className="block border-2 border-heroDark-950 bg-rent-surface p-5 shadow-glass-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:shadow-glass"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Tin đăng #{inquiry.listingId}
                  </p>
                  <h2 className="mt-1 font-display text-xl font-bold">Yêu cầu liên hệ #{inquiry.id}</h2>
                </div>
                <span className="border-2 border-heroDark-950 bg-rent-yellow px-3 py-1 text-xs font-bold">
                  {statusLabel(inquiry.status)}
                </span>
              </div>
              <p className="mt-4 text-sm font-medium text-slate-600">
                Cập nhật {new Date(inquiry.updatedAt).toLocaleString("vi-VN")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
