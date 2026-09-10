"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import workspace from "../auth/tenant-workspace.module.css";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState, EmptyState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { formatVnd } from "../listings/format";
import type { ApiPage, Inquiry } from "../../types/api";
import { FloatingInquiryChat } from "./inquiry-form";
import { getInquirySenderLabel, getInquiryStatusLabel, getInquiryStatusVariant } from "./inquiry-presentation";

const tenantInboxPageSize = 20;
const conversationDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short"
});

function errorMessage(error: ApiError | null, landlord: boolean): string {
  if (error?.status === 401) return "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.";
  if (error?.status === 403)
    return landlord
      ? "Tài khoản này không có quyền xem các yêu cầu."
      : "Tài khoản này không có quyền xem các cuộc trò chuyện.";
  return landlord ? "Không thể tải các yêu cầu lúc này." : "Không thể tải tin nhắn lúc này.";
}

function formatConversationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Cập nhật gần đây" : conversationDateFormatter.format(date);
}

function latestMessage(inquiry: Inquiry): Inquiry["messages"][number] | null {
  return inquiry.lastMessage ?? inquiry.messages[inquiry.messages.length - 1] ?? null;
}

function conversationPreview(inquiry: Inquiry, viewerRole: "TENANT" | "LANDLORD"): string {
  const message = latestMessage(inquiry);
  if (!message) return "Chưa có nội dung trò chuyện.";
  return `${getInquirySenderLabel(message.senderRole, viewerRole)}: ${message.body}`;
}

function listingMetadata(listing: NonNullable<Inquiry["listingSummary"]>): string {
  return [
    formatVnd(listing.monthlyRent),
    listing.roomAreaSqm === null ? null : `${listing.roomAreaSqm} m²`,
    listing.areaName
  ]
    .filter(Boolean)
    .join(" · ");
}

function conversationAction(status: Inquiry["status"]): string {
  return status === "NEW" ? "Mở trò chuyện" : status === "CONTACTED" ? "Tiếp tục trò chuyện" : "Xem cuộc trò chuyện";
}

function TenantConversationRow({
  inquiry,
  selected,
  onOpen
}: Readonly<{ inquiry: Inquiry; selected: boolean; onOpen: (inquiryId: number, trigger: HTMLButtonElement) => void }>) {
  const listing = inquiry.listingContextState === "AVAILABLE" ? inquiry.listingSummary : null;
  const title = listing
    ? listing.title
    : inquiry.listingContextState === "UNAVAILABLE"
      ? "Tin đăng không còn khả dụng"
      : "Thông tin tin đăng tạm thời chưa tải được";
  const listingMeta = listing ? listingMetadata(listing) : null;
  const status = getInquiryStatusLabel(inquiry.status, "TENANT");
  const preview = conversationPreview(inquiry, "TENANT");
  const latest = latestMessage(inquiry);
  const updatedAt = formatConversationDate(latest?.createdAt ?? inquiry.updatedAt);
  const action = conversationAction(inquiry.status);

  return (
    <button
      type="button"
      onClick={(event) => onOpen(inquiry.id, event.currentTarget)}
      aria-label={`${title}, ${status}, ${preview}, ${updatedAt}. ${action}`}
      aria-pressed={selected}
      className={`${workspace.conversation} group`}
    >
      <span
        aria-hidden="true"
        className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-primary/15 bg-primary-subtle text-primary-hover"
      >
        {listing?.coverImage ? (
          <MediaImage src={listing.coverImage.url} alt="" fill sizes="5rem" className="object-cover" />
        ) : (
          <Icon name="home" className="h-7 w-7 sm:h-8 sm:w-8" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-4">
          <span className="min-w-0 max-w-full">
            <span className="block line-clamp-2 font-display text-base font-bold text-foreground">{title}</span>
            {listingMeta ? (
              <span className="mt-1 block truncate text-ui-xs font-semibold text-muted-foreground">{listingMeta}</span>
            ) : null}
          </span>
          <Badge variant={getInquiryStatusVariant(inquiry.status)} context="Trạng thái cuộc trò chuyện" showIndicator>
            {status}
          </Badge>
        </span>

        <span className={workspace.preview}>{preview}</span>

        <span className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-ui-xs font-semibold text-muted-foreground">
          <time dateTime={inquiry.updatedAt}>{updatedAt}</time>
          <span className="inline-flex items-center gap-1.5 font-bold text-primary-hover">
            <span className="hidden sm:inline">{action}</span>
            <Icon
              name="arrowUpRight"
              className="h-4 w-4 transition-transform duration-fast group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
            />
          </span>
        </span>
      </span>
    </button>
  );
}

function LandlordConversationRow({ inquiry }: Readonly<{ inquiry: Inquiry }>) {
  const listing = inquiry.listingSummary;
  const title = listing?.title ?? "Cuộc trò chuyện với người thuê";
  const metadata = listing ? `${formatVnd(listing.monthlyRent)} · ${listing.areaName}` : null;
  const preview = conversationPreview(inquiry, "LANDLORD");

  return (
    <Link
      href={`/inquiries/${inquiry.id}`}
      aria-label={`${title}, ${getInquiryStatusLabel(inquiry.status, "LANDLORD")}, ${preview}, cập nhật ${formatConversationDate(inquiry.updatedAt)}`}
      className="rm-inquiry-card block p-5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus/25 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="rm-workspace-eyebrow">Trao đổi với người thuê</p>
          <h2 className="mt-2 line-clamp-2 font-display text-xl font-bold text-foreground">{title}</h2>
          {metadata ? <p className="mt-1 text-sm font-semibold text-muted-foreground">{metadata}</p> : null}
        </div>
        <Badge variant={getInquiryStatusVariant(inquiry.status)} context="Trạng thái yêu cầu" showIndicator>
          {getInquiryStatusLabel(inquiry.status, "LANDLORD")}
        </Badge>
      </div>
      <p className="mt-4 line-clamp-2 text-sm font-medium leading-6 text-slate-600">{preview}</p>
      <p className="mt-3 text-sm font-medium text-slate-600">Cập nhật {formatConversationDate(inquiry.updatedAt)}</p>
    </Link>
  );
}

function TenantConversationSkeleton() {
  return (
    <div role="status" aria-label="Đang tải tin nhắn" className="space-y-3">
      <span className="sr-only">Đang tải tin nhắn…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="rm-inquiry-card flex min-w-0 items-center gap-4 p-4 sm:gap-5 sm:p-5"
        >
          <div className="h-16 w-16 shrink-0 animate-pulse rounded-card bg-surface-subtle sm:h-20 sm:w-20" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-5 w-3/5 animate-pulse rounded-control bg-surface-subtle" />
            <div className="h-3 w-2/5 animate-pulse rounded-control bg-surface-subtle" />
            <div className="h-4 w-4/5 animate-pulse rounded-control bg-surface-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InquiriesPage({ landlord = false }: Readonly<{ landlord?: boolean }>) {
  const { status: authStatus, user, refresh } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<readonly Inquiry[]>([]);
  const [tenantPage, setTenantPage] = useState<ApiPage<Inquiry> | null>(null);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retry, setRetry] = useState(0);
  const [activeInquiryId, setActiveInquiryId] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const originatingRowRef = useRef<HTMLButtonElement | null>(null);
  const allowed =
    mounted &&
    authStatus === "authenticated" &&
    ((landlord && user?.role === "LANDLORD") || (!landlord && user?.role === "TENANT"));

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!allowed) return;

    const controller = new AbortController();
    setState("loading");
    setError(null);
    const request = landlord
      ? api.contact.listLandlordInquiries({}, controller.signal)
      : api.contact.listTenantInquiries({ page, pageSize: tenantInboxPageSize }, controller.signal);

    void request
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result.data);
        setTenantPage(landlord ? null : result);
        setState("success");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof ApiError ? caught : null);
        setState("error");
      });
    return () => controller.abort();
  }, [allowed, landlord, page, retry]);

  const openTenantConversation = useCallback((inquiryId: number, trigger: HTMLButtonElement) => {
    originatingRowRef.current = trigger;
    setActiveInquiryId(inquiryId);
    setChatOpen(true);
  }, []);

  const restoreInboxFocus = useCallback(() => {
    originatingRowRef.current?.focus({ preventScroll: true });
  }, []);

  if (!mounted || authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous") {
    return (
      <EmptyState
        title={landlord ? "Đăng nhập để xem yêu cầu" : "Đăng nhập để xem tin nhắn"}
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
  if (state === "loading" || state === "idle") {
    return landlord ? <LoadingState message="Đang tải yêu cầu…" /> : <TenantConversationSkeleton />;
  }
  if (state === "error")
    return (
      <ErrorState
        message={errorMessage(error, landlord)}
        requestId={error?.requestId}
        action={<Button onClick={() => setRetry((value) => value + 1)}>Thử lại</Button>}
      />
    );

  return (
    <section
      className={landlord ? "rm-workspace rm-workspace-page my-4 space-y-8" : workspace.page}
      aria-labelledby="inquiries-heading"
    >
      {landlord ? (
        <>
          <header className="rm-workspace-hero" data-tone="info">
            <div className="min-w-0">
              <span className="rm-workspace-eyebrow">Kết nối RentMate</span>
              <h1 id="inquiries-heading" className="rm-workspace-title mt-3">
                Yêu cầu cần xử lý
              </h1>
              <p className="rm-workspace-description mt-3">
                Theo dõi khách thuê đang chờ phản hồi và tiếp tục cuộc trao đổi.
              </p>
            </div>
            <div className="rounded-card border border-border bg-surface/80 px-4 py-3 text-ui-sm">
              <p className="font-semibold text-foreground">{data.length} yêu cầu</p>
              <p className="mt-1 text-ui-xs text-muted-foreground">Đang hiển thị từ tài khoản của bạn</p>
            </div>
          </header>
          {data.length === 0 ? (
            <EmptyState
              title="Chưa có yêu cầu nào"
              description="Khi khách thuê nhắn tin, yêu cầu mới sẽ xuất hiện ở đây."
            />
          ) : (
            <div className="space-y-4" aria-label="Danh sách yêu cầu">
              {data.map((inquiry) => (
                <LandlordConversationRow key={inquiry.id} inquiry={inquiry} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <header className={workspace.header}>
            <div className="min-w-0">
              <span className="rm-workspace-eyebrow inline-flex items-center gap-2">
                <Icon name="message" className="h-4 w-4" /> Kết nối RentMate
              </span>
              <h1 id="inquiries-heading">Tin nhắn</h1>
              <p>Các cuộc trò chuyện của bạn với chủ trọ.</p>
            </div>
            {data.length > 0 ? (
              <Link href="/search" className={workspace.link}>
                <Icon name="search" className="h-4 w-4" /> Tìm phòng
              </Link>
            ) : null}
          </header>

          {data.length === 0 ? (
            <EmptyState
              visual={<Icon name="message" className="h-8 w-8" />}
              title="Bạn chưa có cuộc trò chuyện nào."
              description="Khám phá phòng trọ và nhắn tin cho chủ trọ khi bạn tìm thấy nơi phù hợp."
              action={
                <Link className="font-bold text-teal-800 underline" href="/search">
                  Tìm phòng
                </Link>
              }
            />
          ) : (
            <div className={workspace.list} aria-label="Danh sách cuộc trò chuyện">
              {data.map((inquiry) => (
                <TenantConversationRow
                  key={inquiry.id}
                  inquiry={inquiry}
                  selected={chatOpen && activeInquiryId === inquiry.id}
                  onOpen={openTenantConversation}
                />
              ))}
            </div>
          )}

          {tenantPage && (tenantPage.pagination.page > 1 || tenantPage.pagination.hasNextPage) ? (
            <Pagination
              ariaLabel="Phân trang tin nhắn"
              page={tenantPage.pagination.page}
              hasNextPage={tenantPage.pagination.hasNextPage}
              compact
              onPrevious={() => setPage(Math.max(1, tenantPage.pagination.page - 1))}
              onNext={() => setPage(tenantPage.pagination.page + 1)}
            />
          ) : null}
          {activeInquiryId !== null ? (
            <FloatingInquiryChat
              inquiryId={activeInquiryId}
              open={chatOpen}
              onOpenChange={setChatOpen}
              onCloseFocus={restoreInboxFocus}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
