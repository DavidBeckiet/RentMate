"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, type BadgeVariant } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, LandlordLead, LeadView } from "../../types/api";

const views: readonly { readonly value: LeadView; readonly label: string }[] = [
  { value: "NEEDS_REPLY", label: "Cần phản hồi" },
  { value: "REMINDERS", label: "Nhắc việc" },
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

function statusVariant(status: LandlordLead["status"], needsReply: boolean): BadgeVariant {
  if (needsReply) return "danger";
  return status === "NEW" ? "info" : status === "CONTACTED" ? "primary" : "neutral";
}

function toDateTimeLocalValue(value: Date): string {
  const part = (number: number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${part(value.getMonth() + 1)}-${part(value.getDate())}T${part(value.getHours())}:${part(value.getMinutes())}`;
}

function defaultReminderValue(): string {
  return toDateTimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1_000));
}

function LeadCard({
  lead,
  onLeadChanged
}: Readonly<{ lead: LandlordLead; onLeadChanged: (lead: LandlordLead) => void }>) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(lead.note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingReminder, setEditingReminder] = useState(false);
  const [reminderValue, setReminderValue] = useState(() =>
    lead.reminderAt ? toDateTimeLocalValue(new Date(lead.reminderAt)) : defaultReminderValue()
  );
  const [reminderPending, setReminderPending] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());

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
      onLeadChanged({ ...lead, note: state.note, noteUpdatedAt: state.updatedAt });
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

  const saveReminder = async (nextValue: string | null) => {
    if (reminderPending) return;
    let normalized: string | null = null;
    if (nextValue !== null) {
      const parsed = new Date(nextValue);
      if (!nextValue || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        setReminderError("Thời gian nhắc phải nằm trong tương lai.");
        return;
      }
      normalized = parsed.toISOString();
    }
    setReminderPending(true);
    setReminderError(null);
    try {
      const state = await api.leads.saveReminder(lead.inquiryId, normalized);
      onLeadChanged({ ...lead, reminderAt: state.remindAt, reminderUpdatedAt: state.updatedAt });
      setReminderValue(state.remindAt ? toDateTimeLocalValue(new Date(state.remindAt)) : defaultReminderValue());
      setEditingReminder(false);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setReminderError(
        apiError?.status === 404
          ? "Lead không còn tồn tại hoặc không thuộc tài khoản này."
          : apiError?.status === 422
            ? "Thời gian nhắc phải trong tương lai và không quá 365 ngày."
            : "Chưa thể lưu nhắc việc."
      );
    } finally {
      setReminderPending(false);
    }
  };

  const reminderDue = lead.reminderAt !== null && new Date(lead.reminderAt).getTime() <= renderedAt;

  return (
    <article className="rm-lead-card">
      <div className="rm-lead-card-body">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rm-workspace-eyebrow">Lead #{lead.inquiryId}</span>
              {lead.hasUnreadTenantMessages ? (
                <Badge variant="warning" context="Tin nhắn của người thuê" showIndicator>
                  Chưa đọc
                </Badge>
              ) : null}
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold">Tin đăng #{lead.listingId}</h2>
          </div>
          <Badge variant={statusVariant(lead.status, lead.needsReply)} context="Trạng thái lead" showIndicator>
            {lead.needsReply ? "Cần phản hồi" : statusLabels[lead.status]}
          </Badge>
        </div>

        {lead.lastMessage ? (
          <blockquote className="mt-5 rounded-control border-l-4 border-info bg-info-subtle/60 p-4 text-sm font-medium leading-6 text-info-foreground">
            <span className="mb-1 block text-xs font-extrabold uppercase text-slate-600">
              Tin cuối từ {lead.lastMessage.senderRole === "TENANT" ? "người thuê" : "bạn"}
            </span>
            {lead.lastMessage.snippet}
          </blockquote>
        ) : null}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-control border border-border bg-surface-subtle/60 p-3">
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
          <div className="rounded-control border border-border bg-surface-subtle/60 p-3">
            <dt className="text-xs font-extrabold uppercase text-slate-600">Thời gian mong muốn</dt>
            <dd className="mt-1 font-bold">
              {lead.preferredContactAt ? new Date(lead.preferredContactAt).toLocaleString("vi-VN") : "Không chỉ định"}
            </dd>
          </div>
        </dl>

        <section className="mt-5 border-t border-border pt-5" aria-label={`Ghi chú nội bộ lead ${lead.inquiryId}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-sm font-bold uppercase">Ghi chú nội bộ</h3>
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="min-h-11 cursor-pointer text-xs font-extrabold underline decoration-2 underline-offset-4 focus-visible:ring-4 focus-visible:ring-focus/25"
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
                className="min-h-28 w-full resize-y rounded-control border border-border-strong bg-surface px-4 py-3 text-sm font-medium outline-none transition focus:border-primary focus:ring-[3px] focus:ring-primary/20"
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

        <section className="mt-5 border-t border-border pt-5" aria-label={`Nhắc việc lead ${lead.inquiryId}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-sm font-bold uppercase">Nhắc việc</h3>
              {lead.reminderAt ? (
                <Badge variant={reminderDue ? "warning" : "info"} context="Trạng thái nhắc việc" showIndicator>
                  {reminderDue ? "Đã đến hạn" : "Đã lên lịch"}
                </Badge>
              ) : null}
            </div>
            {!editingReminder ? (
              <button
                type="button"
                onClick={() => {
                  setReminderValue(
                    lead.reminderAt ? toDateTimeLocalValue(new Date(lead.reminderAt)) : defaultReminderValue()
                  );
                  setReminderError(null);
                  setEditingReminder(true);
                }}
                className="min-h-11 cursor-pointer text-xs font-extrabold underline decoration-2 underline-offset-4 focus-visible:ring-4 focus-visible:ring-focus/25"
              >
                {lead.reminderAt ? "Đổi thời gian" : "Thêm nhắc việc"}
              </button>
            ) : null}
          </div>

          {!editingReminder ? (
            <p className="mt-2 text-sm font-medium text-slate-700">
              {lead.reminderAt
                ? `${reminderDue ? "Đến hạn" : "Nhắc lúc"} ${new Date(lead.reminderAt).toLocaleString("vi-VN")}`
                : "Chưa có mốc theo dõi tiếp theo. Nhắc việc này chỉ chủ trọ nhìn thấy."}
            </p>
          ) : (
            <div className="mt-3 grid gap-3">
              <label htmlFor={`lead-reminder-${lead.inquiryId}`} className="text-xs font-extrabold text-slate-700">
                Thời gian nhắc
              </label>
              <input
                id={`lead-reminder-${lead.inquiryId}`}
                type="datetime-local"
                required
                value={reminderValue}
                onChange={(event) => setReminderValue(event.target.value)}
                aria-describedby={`lead-reminder-help-${lead.inquiryId}`}
                className="min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-sm font-bold outline-none transition focus:border-primary focus:ring-[3px] focus:ring-primary/20"
              />
              <p id={`lead-reminder-help-${lead.inquiryId}`} className="text-xs font-medium text-slate-600">
                Dùng giờ trên thiết bị của bạn. Reminder sẽ hiện trong bộ lọc Nhắc việc, không gửi push notification.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  pending={reminderPending}
                  pendingLabel="Đang lưu…"
                  onClick={() => void saveReminder(reminderValue)}
                >
                  Lưu nhắc việc
                </Button>
                <Button
                  variant="secondary"
                  disabled={reminderPending}
                  onClick={() => {
                    setEditingReminder(false);
                    setReminderError(null);
                  }}
                >
                  Hủy
                </Button>
                {lead.reminderAt ? (
                  <Button variant="danger" pending={reminderPending} onClick={() => void saveReminder(null)}>
                    Xóa nhắc việc
                  </Button>
                ) : null}
              </div>
            </div>
          )}
          {reminderError ? (
            <p role="alert" className="mt-3 border-l-4 border-red-700 pl-3 text-sm font-bold text-red-800">
              {reminderError}
            </p>
          ) : null}
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <time className="text-xs font-bold text-slate-600">
            Cập nhật {new Date(lead.updatedAt).toLocaleString("vi-VN")}
          </time>
          <Link
            href={`/inquiries/${lead.inquiryId}`}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-extrabold text-white shadow-surface transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-raised focus-visible:ring-4 focus-visible:ring-focus/25"
          >
            Mở cuộc trao đổi <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function LandlordLeadsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const [mounted, setMounted] = useState(false);
  const allowed = mounted && authStatus === "authenticated" && user?.role === "LANDLORD";
  const [view, setView] = useState<LeadView>("NEEDS_REPLY");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<LandlordLead> | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => setMounted(true), []);

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

  if (!mounted || authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
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
    <section className="rm-workspace rm-workspace-page space-y-6 my-8" aria-labelledby="landlord-leads-heading">
      <header className="rm-workspace-hero" data-tone="info">
        <div className="min-w-0">
          <span className="rm-workspace-eyebrow inline-flex items-center gap-2">
            <Icon name="users" className="h-4 w-4" /> LANDLORD OPERATIONS
          </span>
          <h1 id="landlord-leads-heading" className="rm-workspace-title mt-3">
            Khách quan tâm cần xử lý
          </h1>
          <p className="rm-workspace-description mt-3">
            Ưu tiên người thuê đang chờ phản hồi, tiếp tục cuộc trao đổi và lưu ngữ cảnh riêng cho lần liên hệ tiếp
            theo.
          </p>
        </div>
      </header>

      <nav className="rm-workspace-card flex flex-wrap gap-2 p-3" aria-label="Bộ lọc lead">
        {views.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={view === item.value}
            onClick={() => {
              setView(item.value);
              setPage(1);
            }}
            className="min-h-11 cursor-pointer rounded-full border border-border px-4 text-sm font-extrabold transition-[background-color,border-color,color] hover:border-primary/40 hover:bg-primary-subtle focus-visible:ring-4 focus-visible:ring-focus/25 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-white"
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
                onLeadChanged={(updated) =>
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
