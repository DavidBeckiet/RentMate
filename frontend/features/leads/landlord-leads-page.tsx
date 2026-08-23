"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, LandlordLead, LeadView } from "../../types/api";

const views: readonly { readonly value: LeadView; readonly label: string }[] = [
  { value: "NEEDS_REPLY", label: "Cần phản hồi" },
  { value: "NEW", label: "Mới" },
  { value: "ACTIVE", label: "Đang xử lý" },
  { value: "CLOSED", label: "Đã đóng" },
  { value: "ALL", label: "Tất cả" }
];

const statusLabels: Record<LandlordLead["status"], string> = {
  NEW: "Mới",
  CONTACTED: "Đang trao đổi",
  CLOSED: "Đã đóng"
};

function LeadCard({
  lead,
  onNoteChanged
}: Readonly<{ lead: LandlordLead; onNoteChanged: (lead: LandlordLead) => void }>) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(lead.note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (nextNote: string | null) => {
    if (pending) return;
    if (nextNote !== null && !nextNote.trim()) {
      setError("Ghi chú không được để trống. Bạn có thể chọn Xóa ghi chú.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const state = await api.leads.saveNote(lead.inquiryId, nextNote === null ? null : nextNote.trim());
      onNoteChanged({ ...lead, note: state.note, noteUpdatedAt: state.updatedAt });
      setNote(state.note ?? "");
      setEditing(false);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(
        apiError?.status === 404 ? "Lead không còn tồn tại hoặc không thuộc tài khoản này." : "Chưa thể lưu ghi chú."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <article className="border-2 border-heroDark-950 bg-rent-surface p-5 shadow-glass-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rm-eyebrow">LEAD #{lead.inquiryId}</span>
            {lead.hasUnreadTenantMessages ? (
              <span className="border-2 border-heroDark-950 bg-rent-coral px-2 py-1 text-[0.65rem] font-extrabold uppercase">
                Chưa đọc
              </span>
            ) : null}
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold">Tin đăng #{lead.listingId}</h2>
        </div>
        <span className="border-2 border-heroDark-950 bg-rent-accent px-3 py-1 text-xs font-extrabold uppercase">
          {lead.needsReply ? "Cần phản hồi" : statusLabels[lead.status]}
        </span>
      </div>

      {lead.lastMessage ? (
        <blockquote className="mt-5 border-l-4 border-heroDark-950 bg-[#e5eefc] p-4 text-sm font-medium leading-6 text-slate-700">
          <span className="mb-1 block text-xs font-extrabold uppercase text-slate-600">
            Tin cuối từ {lead.lastMessage.senderRole === "TENANT" ? "người thuê" : "bạn"}
          </span>
          {lead.lastMessage.snippet}
        </blockquote>
      ) : null}

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="border-2 border-heroDark-950 p-3">
          <dt className="text-xs font-extrabold uppercase text-slate-600">Liên hệ</dt>
          <dd className="mt-1 font-bold">
            {lead.contactPhone ? (
              <a className="underline" href={`tel:${lead.contactPhone}`}>
                {lead.contactPhone}
              </a>
            ) : (
              "Chưa có số điện thoại"
            )}
          </dd>
        </div>
        <div className="border-2 border-heroDark-950 p-3">
          <dt className="text-xs font-extrabold uppercase text-slate-600">Thời gian mong muốn</dt>
          <dd className="mt-1 font-bold">
            {lead.preferredContactAt ? new Date(lead.preferredContactAt).toLocaleString("vi-VN") : "Không chỉ định"}
          </dd>
        </div>
      </dl>

      <section
        className="mt-4 border-t-2 border-heroDark-950 pt-4"
        aria-label={`Ghi chú nội bộ lead ${lead.inquiryId}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-sm font-bold uppercase">Ghi chú nội bộ</h3>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="cursor-pointer text-xs font-extrabold underline decoration-2 underline-offset-4 focus-visible:ring-4 focus-visible:ring-blue-300"
            >
              {lead.note ? "Chỉnh sửa" : "Thêm ghi chú"}
            </button>
          ) : null}
        </div>
        {!editing ? (
          <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-700">
            {lead.note ?? "Chưa có ghi chú. Nội dung này chỉ chủ trọ nhìn thấy."}
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            <label htmlFor={`lead-note-${lead.inquiryId}`} className="sr-only">
              Ghi chú nội bộ
            </label>
            <textarea
              id={`lead-note-${lead.inquiryId}`}
              rows={4}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="resize-y border-2 border-heroDark-950 bg-white p-3 text-sm font-medium outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
              placeholder="Ví dụ: khách muốn xem phòng sau 18 giờ…"
            />
            <div className="flex flex-wrap gap-3">
              <Button pending={pending} pendingLabel="Đang lưu…" onClick={() => void save(note)}>
                Lưu ghi chú
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setNote(lead.note ?? "");
                  setEditing(false);
                  setError(null);
                }}
              >
                Hủy
              </Button>
              {lead.note ? (
                <Button variant="danger" pending={pending} onClick={() => void save(null)}>
                  Xóa ghi chú
                </Button>
              ) : null}
            </div>
          </div>
        )}
        {error ? (
          <p role="alert" className="mt-3 border-l-4 border-red-700 pl-3 text-sm font-bold text-red-800">
            {error}
          </p>
        ) : null}
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t-2 border-heroDark-950 pt-4">
        <time className="text-xs font-bold text-slate-600">
          Cập nhật {new Date(lead.updatedAt).toLocaleString("vi-VN")}
        </time>
        <Link
          href={`/inquiries/${lead.inquiryId}`}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 border-2 border-heroDark-950 bg-[#c9f269] px-4 py-2 text-sm font-extrabold shadow-glass-sm transition-colors hover:bg-rent-accent focus-visible:ring-4 focus-visible:ring-blue-300"
        >
          Mở cuộc trao đổi <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export function LandlordLeadsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const allowed = authStatus === "authenticated" && user?.role === "LANDLORD";
  const [view, setView] = useState<LeadView>("NEEDS_REPLY");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<LandlordLead> | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    void api.leads
      .list({ view, page, pageSize: 20 }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          setStatus("success");
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setStatus("error");
        }
      });
    return () => controller.abort();
  }, [allowed, page, retryKey, view]);

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous")
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản chủ trọ."
        action={
          <Link className="font-bold underline" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  if (authStatus === "error")
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  if (!allowed) return <ErrorState message="Trang này dành cho tài khoản chủ trọ." />;

  return (
    <section className="rm-workspace my-8 space-y-6" aria-labelledby="landlord-leads-heading">
      <header className="border-2 border-heroDark-950 bg-rent-accent p-6 shadow-glass sm:p-8">
        <span className="rm-eyebrow inline-flex items-center gap-2">
          <Icon name="users" className="h-4 w-4" /> LANDLORD OPERATIONS
        </span>
        <h1
          id="landlord-leads-heading"
          className="mt-3 font-display text-4xl font-bold tracking-[-0.055em] sm:text-6xl"
        >
          Khách quan tâm cần xử lý
        </h1>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-700">
          Ưu tiên người thuê đang chờ phản hồi, tiếp tục cuộc trao đổi và lưu ngữ cảnh riêng cho lần liên hệ tiếp theo.
        </p>
      </header>

      <nav
        className="flex flex-wrap gap-2 border-2 border-heroDark-950 bg-white p-3 shadow-glass-sm"
        aria-label="Bộ lọc lead"
      >
        {views.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={view === item.value}
            onClick={() => {
              setView(item.value);
              setPage(1);
            }}
            className="min-h-11 cursor-pointer border-2 border-heroDark-950 px-4 text-sm font-extrabold transition-colors hover:bg-[#e5eefc] focus-visible:ring-4 focus-visible:ring-blue-300 aria-pressed:bg-rent-coral"
          >
            {item.label}
          </button>
        ))}
      </nav>

      {status === "loading" || status === "idle" ? <LoadingState message="Đang tải danh sách khách quan tâm…" /> : null}
      {status === "error" ? (
        <ErrorState
          message={error?.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Không thể tải danh sách khách quan tâm."}
          requestId={error?.requestId}
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}
      {status === "success" && result?.data.length === 0 ? (
        <EmptyState
          title="Không có lead trong nhóm này"
          description="Chọn một bộ lọc khác hoặc quay lại khi có inquiry mới."
        />
      ) : null}
      {status === "success" && result && result.data.length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2" aria-label="Danh sách khách quan tâm">
            {result.data.map((lead) => (
              <LeadCard
                key={lead.inquiryId}
                lead={lead}
                onNoteChanged={(updated) =>
                  setResult((current) =>
                    current
                      ? {
                          ...current,
                          data: current.data.map((item) => (item.inquiryId === updated.inquiryId ? updated : item))
                        }
                      : current
                  )
                }
              />
            ))}
          </div>
          <Pagination
            ariaLabel="Phân trang khách quan tâm"
            page={result.pagination.page}
            hasNextPage={result.pagination.hasNextPage}
            onPrevious={() => setPage((value) => value - 1)}
            onNext={() => setPage((value) => value + 1)}
          />
        </div>
      ) : null}
    </section>
  );
}
