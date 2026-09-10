"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { MediaImage } from "../../components/ui/media-image";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ContactReportCategory, Inquiry } from "../../types/api";
import { formatVnd } from "../listings/format";
import { getInquiryStatusLabel, getInquiryStatusVariant } from "./inquiry-presentation";
import { InquiryConversationCore, mergeMessages, useInquiryConversation } from "./inquiry-conversation";
import { TenantReviewPanel } from "../reviews/tenant-review-panel";

function parseId(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

const contactReportCategories: readonly { readonly value: ContactReportCategory; readonly label: string }[] = [
  { value: "SPAM", label: "Spam hoặc quảng cáo" },
  { value: "FRAUD", label: "Nghi ngờ lừa đảo" },
  { value: "HARASSMENT", label: "Quấy rối" },
  { value: "INAPPROPRIATE", label: "Nội dung không phù hợp" },
  { value: "OTHER", label: "Lý do khác" }
];

function InquiryListingContext({ inquiry }: Readonly<{ inquiry: Inquiry }>) {
  if (inquiry.listingContextState === "AVAILABLE" && inquiry.listingSummary) {
    const listing = inquiry.listingSummary;
    return (
      <section
        className="flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-surface sm:flex-row sm:items-center"
        aria-label="Thông tin tin đăng"
      >
        <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-control bg-info-subtle sm:h-20 sm:w-28">
          {listing.coverImage ? (
            <MediaImage
              src={listing.coverImage.url}
              alt={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
              fill
              sizes="(min-width: 640px) 7rem, 100vw"
            />
          ) : (
            <div className="grid h-full place-items-center text-sm font-semibold text-info-foreground">RentMate</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Tin đăng</p>
          <h2 className="mt-1 line-clamp-2 font-display text-lg font-bold leading-6 text-foreground">
            {listing.title}
          </h2>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold text-muted-foreground">
            <span className="font-display text-base font-bold text-primary-hover">
              {formatVnd(listing.monthlyRent)}
            </span>
            <span>· {listing.areaName}</span>
          </p>
        </div>
        <Link
          href={`/listings/${listing.id}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-control border border-primary/30 px-4 text-sm font-bold text-primary-hover transition-colors duration-fast hover:border-primary hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/30"
        >
          Xem tin đăng
        </Link>
      </section>
    );
  }

  const unavailable = inquiry.listingContextState === "UNAVAILABLE";
  return (
    <section className="rounded-card border border-border bg-surface-subtle p-4" aria-label="Thông tin tin đăng">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Tin đăng</p>
      <h2 className="mt-1 font-display text-lg font-bold text-foreground">
        {unavailable ? "Tin đăng không còn khả dụng" : "Thông tin tin đăng tạm thời chưa tải được"}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {unavailable ? "Cuộc trò chuyện vẫn được lưu." : "Bạn vẫn có thể xem lại và tiếp tục cuộc trò chuyện."}
      </p>
    </section>
  );
}

export function InquiryDetailPage({ inquiryId }: Readonly<{ inquiryId: string }>) {
  const id = useMemo(() => parseId(inquiryId), [inquiryId]);
  const { status: authStatus, user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const conversation = useInquiryConversation(id, mounted && authStatus === "authenticated" && Boolean(user));
  const { inquiry, state } = conversation;
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [statusPending, setStatusPending] = useState(false);
  const [safetyPending, setSafetyPending] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [safetyMenuOpen, setSafetyMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<ContactReportCategory>("SPAM");
  const [reportDetails, setReportDetails] = useState("");
  const [reportMessageId, setReportMessageId] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || authStatus === "loading") {
    return <LoadingState message="Đang mở cuộc trò chuyện…" />;
  }
  if (authStatus !== "authenticated" || !user)
    return (
      <ErrorState
        message="Vui lòng đăng nhập để xem cuộc trò chuyện."
        action={
          <Link className="font-bold text-teal-800 underline" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  if (id === null || state === "error")
    return (
      <ErrorState
        message={
          conversation.error?.status === 404
            ? "Cuộc trò chuyện không tồn tại hoặc bạn không có quyền xem."
            : "Không thể tải cuộc trò chuyện."
        }
        action={<Button onClick={conversation.reload}>Thử lại</Button>}
      />
    );
  if (state === "loading" || state === "idle" || !inquiry) {
    return <LoadingState message="Đang mở cuộc trò chuyện…" />;
  }

  const changeStatus = async (nextStatus: "CONTACTED" | "CLOSED") => {
    setStatusPending(true);
    setActionError(null);
    try {
      const updated = await api.contact.updateInquiryStatus(inquiry.id, nextStatus);
      conversation.updateInquiry((current) =>
        current === null ? updated : { ...updated, messages: mergeMessages(current.messages, updated.messages) }
      );
    } catch (caught: unknown) {
      setActionError(caught instanceof ApiError ? caught : null);
    } finally {
      setStatusPending(false);
    }
  };

  const updateBlockState = (nextState: {
    readonly canSendMessage: boolean;
    readonly blockedByCurrentUser: boolean;
  }) => {
    conversation.updateInquiry((current) => (current === null ? current : { ...current, ...nextState }));
  };

  const toggleBlock = async () => {
    if (!inquiry || safetyPending) return;
    if (!inquiry.blockedByCurrentUser && !window.confirm("Chặn liên hệ này? Hai bên sẽ không thể gửi tin nhắn mới."))
      return;
    setSafetyPending(true);
    setSafetyError(null);
    try {
      const nextState = inquiry.blockedByCurrentUser
        ? await api.contact.unblockInquiry(inquiry.id)
        : await api.contact.blockInquiry(inquiry.id);
      updateBlockState(nextState);
      setSafetyMenuOpen(false);
    } catch (caught: unknown) {
      setSafetyError(
        caught instanceof ApiError ? "Chưa thể cập nhật trạng thái chặn. Vui lòng thử lại." : "Đã có lỗi xảy ra."
      );
    } finally {
      setSafetyPending(false);
    }
  };

  const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inquiry || safetyPending) return;
    setSafetyPending(true);
    setSafetyError(null);
    try {
      await api.contact.createContactReport(inquiry.id, {
        category: reportCategory,
        details: reportDetails.trim() || null,
        messageId: reportMessageId ? Number(reportMessageId) : null
      });
      setReportSubmitted(true);
      setReportOpen(false);
      setSafetyMenuOpen(false);
      setReportDetails("");
      setReportMessageId("");
    } catch (caught: unknown) {
      setSafetyError(
        caught instanceof ApiError && caught.status === 409
          ? "Bạn đã có một báo cáo đang được xử lý cho cuộc trò chuyện này."
          : "Chưa thể gửi báo cáo. Vui lòng thử lại."
      );
    } finally {
      setSafetyPending(false);
    }
  };

  const isLandlord = user.role === "LANDLORD";
  const viewerRole = isLandlord ? "LANDLORD" : "TENANT";
  return (
    <section
      className="rm-workspace rm-workspace-page mx-auto my-4 max-w-5xl space-y-5"
      aria-labelledby="inquiry-detail-heading"
    >
      <Link
        href={isLandlord ? "/landlord/inquiries" : "/inquiries"}
        className="inline-flex min-h-11 items-center font-bold text-primary-hover underline decoration-2 underline-offset-4"
      >
        ← {isLandlord ? "Danh sách yêu cầu" : "Tin nhắn"}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div className="min-w-0">
          <span className="rm-workspace-eyebrow">Cuộc trò chuyện</span>
          <h1
            id="inquiry-detail-heading"
            className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            {isLandlord ? "Trao đổi với người thuê" : "Nhắn tin với chủ trọ"}
          </h1>
          <div className="mt-3">
            <Badge variant={getInquiryStatusVariant(inquiry.status)} context="Trạng thái cuộc trò chuyện" showIndicator>
              {getInquiryStatusLabel(inquiry.status, viewerRole)}
            </Badge>
          </div>
        </div>
        {isLandlord && inquiry.status !== "CLOSED" ? (
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" pending={statusPending} onClick={() => void changeStatus("CONTACTED")}>
              Đã liên hệ
            </Button>
            <Button variant="danger" pending={statusPending} onClick={() => void changeStatus("CLOSED")}>
              Đóng yêu cầu
            </Button>
          </div>
        ) : null}
      </header>
      <InquiryListingContext inquiry={inquiry} />
      <div className="flex flex-col items-end gap-3">
        <div className="relative">
          <Button
            variant="secondary"
            aria-expanded={safetyMenuOpen}
            aria-haspopup="menu"
            onClick={() => setSafetyMenuOpen((open) => !open)}
          >
            Thao tác khác
          </Button>
          {safetyMenuOpen ? (
            <div
              className="absolute right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-2 shadow-overlay"
              role="menu"
            >
              <Button
                variant="secondary"
                className="w-full justify-start text-left"
                pending={safetyPending}
                onClick={() => void toggleBlock()}
              >
                {inquiry.blockedByCurrentUser ? "Bỏ chặn liên hệ" : "Chặn liên hệ"}
              </Button>
              <Button
                variant="secondary"
                className="mt-2 w-full justify-start text-left"
                disabled={safetyPending}
                onClick={() => {
                  setReportOpen(true);
                  setSafetyMenuOpen(false);
                  setReportSubmitted(false);
                }}
              >
                Báo cáo cuộc trò chuyện
              </Button>
            </div>
          ) : null}
        </div>
        {reportSubmitted ? (
          <p
            role="status"
            className="rm-workspace-card w-full border-l-4 border-success bg-success-subtle p-3 text-sm font-semibold text-success-foreground"
          >
            Đã gửi báo cáo. RentMate sẽ xem xét thông tin này.
          </p>
        ) : null}
        {safetyError ? (
          <p
            role="alert"
            className="rm-workspace-card w-full border-l-4 border-danger bg-danger-subtle p-3 text-sm font-semibold text-danger"
          >
            {safetyError}
          </p>
        ) : null}
      </div>
      {reportOpen ? (
        <form
          onSubmit={(event) => void submitReport(event)}
          className="rm-workspace-card space-y-4 p-5 sm:p-6"
          aria-label="Báo cáo cuộc trò chuyện"
        >
          <div>
            <h2 className="font-display text-xl font-bold">Báo cáo cuộc trò chuyện</h2>
            <p className="mt-1 text-sm text-rent-secondary">
              Chỉ gửi báo cáo khi bạn phát hiện spam, lừa đảo hoặc hành vi không phù hợp.
            </p>
          </div>
          <label className="block text-sm font-bold" htmlFor="contact-report-category">
            Lý do
            <select
              id="contact-report-category"
              value={reportCategory}
              onChange={(event) => setReportCategory(event.target.value as ContactReportCategory)}
              className="mt-2 block min-h-12 w-full rounded-control border border-border-strong bg-surface px-4"
            >
              {contactReportCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold" htmlFor="contact-report-message">
            Tin nhắn liên quan (không bắt buộc)
            <select
              id="contact-report-message"
              value={reportMessageId}
              onChange={(event) => setReportMessageId(event.target.value)}
              className="mt-2 block min-h-12 w-full rounded-control border border-border-strong bg-surface px-4"
            >
              <option value="">Toàn bộ cuộc trò chuyện</option>
              {inquiry.messages.map((item) => (
                <option key={item.id} value={item.id}>
                  Tin #{item.id} · {item.senderRole === "TENANT" ? "Người thuê" : "Chủ trọ"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold" htmlFor="contact-report-details">
            Chi tiết (không bắt buộc)
            <textarea
              id="contact-report-details"
              value={reportDetails}
              onChange={(event) => setReportDetails(event.target.value)}
              maxLength={2000}
              rows={4}
              className="mt-2 block min-h-28 w-full resize-y rounded-control border border-border-strong bg-surface p-3 font-medium outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" pending={safetyPending} pendingLabel="Đang gửi…">
              Gửi báo cáo
            </Button>
            <Button variant="secondary" type="button" disabled={safetyPending} onClick={() => setReportOpen(false)}>
              Hủy
            </Button>
          </div>
        </form>
      ) : null}
      {actionError ? (
        <p
          role="alert"
          className="rm-workspace-card border-l-4 border-danger bg-danger-subtle p-4 text-sm font-semibold text-danger"
        >
          Không thể cập nhật cuộc trò chuyện. Vui lòng thử lại.
        </p>
      ) : null}
      <InquiryConversationCore conversation={conversation} currentUserRole={user.role} variant="page" />
      {!isLandlord && inquiry.status === "CLOSED" ? <TenantReviewPanel inquiryId={inquiry.id} /> : null}
    </section>
  );
}
