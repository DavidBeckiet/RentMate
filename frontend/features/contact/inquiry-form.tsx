"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import { MediaImage } from "../../components/ui/media-image";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { Inquiry } from "../../types/api";
import { InquiryConversationCore, statusLabel, useInquiryConversation } from "./inquiry-conversation";
import { InquirySafetyMenu } from "./inquiry-safety-menu";
import { formatVnd } from "../listings/format";

const inquiryLookupPageSize = 100;
const maximumInquiryLookupPages = 50;

const INQUIRY_QUICK_QUESTIONS = [
  "Phòng này hiện tại còn trống không ạ?",
  "Chi phí dịch vụ, điện nước của phòng tính thế nào ạ?",
  "Em có thể hẹn qua xem phòng trực tiếp được không ạ?"
] as const;

type LookupState = "idle" | "loading" | "new" | "conversation" | "error";

function inquiryError(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Chỉ tài khoản người thuê mới có thể nhắn tin.";
  if (error?.status === 404) return "Tin đăng không còn công khai hoặc chủ trọ đã ngừng hoạt động.";
  if (error?.status === 409) return "Bạn đã có một cuộc trò chuyện đang mở cho tin này.";
  if (error?.status === 429) return "Bạn đang gửi hơi nhiều tin nhắn. Vui lòng thử lại sau ít phút.";
  if (error?.status === 422) return "Vui lòng kiểm tra lại nội dung tin nhắn.";
  return "Không thể gửi tin nhắn lúc này. Vui lòng thử lại.";
}

function inquiryRecency(inquiry: Inquiry): number {
  const timestamp = Date.parse(inquiry.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareInquiryRecency(left: Inquiry, right: Inquiry): number {
  return inquiryRecency(right) - inquiryRecency(left) || right.id - left.id;
}

async function findListingInquiry(listingId: number, signal: AbortSignal): Promise<Inquiry | null> {
  let latestClosed: Inquiry | null = null;

  for (let page = 1; page <= maximumInquiryLookupPages; page += 1) {
    const result = await api.contact.listTenantInquiries({ page, pageSize: inquiryLookupPageSize }, signal);
    const relevant = result.data.filter((item) => item.listingId === listingId);
    const open = relevant.filter((item) => item.status !== "CLOSED").sort(compareInquiryRecency)[0];
    if (open) return open;

    const closed = relevant.filter((item) => item.status === "CLOSED").sort(compareInquiryRecency)[0];
    if (closed && (!latestClosed || compareInquiryRecency(closed, latestClosed) < 0)) latestClosed = closed;
    if (!result.pagination.hasNextPage) return latestClosed;
  }

  throw new Error("Inquiry lookup exceeded the safe page limit.");
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

function FloatingListingContext({
  inquiry,
  listingTitle,
  monthlyRent,
  areaName
}: Readonly<{
  inquiry: Inquiry | null;
  listingTitle: string;
  monthlyRent: number | null;
  areaName?: string | null;
}>) {
  const listing = inquiry?.listingSummary ?? null;

  if (inquiry?.listingContextState === "UNAVAILABLE") {
    return (
      <section className="rounded-card border border-border bg-surface-subtle p-3" aria-label="Thông tin tin đăng">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Tin đăng</p>
        <p className="mt-1 text-sm font-bold text-foreground">Tin đăng không còn khả dụng</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Cuộc trò chuyện vẫn được lưu.</p>
      </section>
    );
  }

  if (inquiry?.listingContextState === "TEMPORARILY_UNAVAILABLE") {
    return (
      <section className="rounded-card border border-border bg-surface-subtle p-3" aria-label="Thông tin tin đăng">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Tin đăng</p>
        <p className="mt-1 text-sm font-bold text-foreground">Thông tin tin đăng tạm thời chưa tải được</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Bạn vẫn có thể xem lại cuộc trò chuyện.</p>
      </section>
    );
  }

  const title = listing?.title ?? listingTitle;
  const metadata = listing
    ? listingMetadata(listing)
    : [monthlyRent === null ? null : formatVnd(monthlyRent), areaName].filter(Boolean).join(" · ");
  const canViewListing = listing !== null && listing.businessStatus === "AVAILABLE";

  return (
    <section
      className="flex min-w-0 items-start gap-3 rounded-card border border-border bg-surface-subtle p-3"
      aria-label="Thông tin tin đăng"
    >
      {listing?.coverImage ? (
        <div className="relative h-14 w-16 shrink-0 overflow-hidden rounded-control bg-info-subtle">
          <MediaImage src={listing.coverImage.url} alt="" fill sizes="4rem" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-bold uppercase tracking-wider text-muted-foreground">Tin đăng</p>
        <p className="mt-1 line-clamp-2 font-display text-base font-bold leading-5 text-foreground">{title}</p>
        {metadata ? <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{metadata}</p> : null}
      </div>
      {canViewListing ? (
        <Link
          href={`/listings/${listing.id}`}
          className="min-h-11 shrink-0 self-center rounded-control px-2 text-xs font-bold text-primary-hover underline underline-offset-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/30"
        >
          Xem tin
        </Link>
      ) : null}
    </section>
  );
}

export interface InquiryFormProps {
  readonly listingId?: number;
  readonly listingTitle?: string;
  readonly monthlyRent?: number | null;
  readonly areaName?: string | null;
  readonly inquiryId?: number;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onCloseFocus?: () => void;
  readonly showLauncher?: boolean;
}

export function InquiryForm({
  listingId,
  listingTitle = "Thông tin tin đăng",
  monthlyRent = null,
  areaName,
  inquiryId,
  open: controlledOpen,
  onOpenChange,
  onCloseFocus,
  showLauncher = true
}: InquiryFormProps) {
  const knownInquiryMode = inquiryId !== undefined;
  const domId = listingId ?? inquiryId ?? "inquiry";
  const { status: authStatus, user, refresh } = useAuth();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedInquiryId, setSelectedInquiryId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const lookupTokenRef = useRef(0);
  const newMessageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const open = knownInquiryMode ? Boolean(controlledOpen) : uncontrolledOpen;
  const activeInquiryId = knownInquiryMode ? inquiryId : selectedInquiryId;
  const conversation = useInquiryConversation(activeInquiryId, sessionActive);

  const setWidgetOpen = useCallback(
    (nextOpen: boolean) => {
      if (!knownInquiryMode) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [knownInquiryMode, onOpenChange]
  );

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    return () => lookupAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (knownInquiryMode && open && inquiryId !== undefined) setSessionActive(true);
  }, [inquiryId, knownInquiryMode, open]);

  const focusLauncher = useCallback(() => {
    launcherRef.current?.focus({ preventScroll: true });
  }, []);

  const closeWidget = useCallback(() => {
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
    lookupTokenRef.current += 1;
    setWidgetOpen(false);
    setSessionActive(false);
    if (onCloseFocus) onCloseFocus();
    else (lastTriggerRef.current ?? launcherRef.current)?.focus({ preventScroll: true });
  }, [onCloseFocus, setWidgetOpen]);

  const minimizeWidget = useCallback(() => {
    setWidgetOpen(false);
    if (showLauncher) focusLauncher();
  }, [focusLauncher, setWidgetOpen, showLauncher]);

  const beginLookup = useCallback(() => {
    if (knownInquiryMode || listingId === undefined) return;
    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    const token = lookupTokenRef.current + 1;
    lookupTokenRef.current = token;
    lookupAbortRef.current = controller;
    setWidgetOpen(true);
    setSessionActive(true);
    setLookupState("loading");
    setLookupError(null);
    setSelectedInquiryId(null);
    setFeedback(null);
    setSuccessMessage(null);

    void findListingInquiry(listingId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || token !== lookupTokenRef.current) return;
        lookupAbortRef.current = null;
        if (result) {
          setSelectedInquiryId(result.id);
          setLookupState("conversation");
        } else {
          setLookupState("new");
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || token !== lookupTokenRef.current) return;
        lookupAbortRef.current = null;
        setLookupState("error");
        setLookupError(
          caught instanceof ApiError && caught.status === 401
            ? "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại."
            : "Không thể kiểm tra cuộc trò chuyện lúc này. Vui lòng thử lại."
        );
      });
  }, [knownInquiryMode, listingId, setWidgetOpen]);

  const openWidget = useCallback(
    (trigger: HTMLButtonElement | null) => {
      lastTriggerRef.current = trigger;
      setWidgetOpen(true);
      if (knownInquiryMode) {
        setSessionActive(true);
        return;
      }
      if (sessionActive) return;
      if (lookupState === "new" || (lookupState === "conversation" && selectedInquiryId !== null)) {
        setSessionActive(true);
        return;
      }
      beginLookup();
    },
    [beginLookup, knownInquiryMode, lookupState, selectedInquiryId, sessionActive, setWidgetOpen]
  );

  const startNewInquiry = useCallback(() => {
    setSelectedInquiryId(null);
    setLookupState("new");
    setLookupError(null);
    setFeedback(null);
    setSuccessMessage(null);
    setMessage("");
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !message.trim() || listingId === undefined) return;
    setPending(true);
    setFeedback(null);
    try {
      const created = await api.contact.createInquiry({
        listingId,
        message: message.trim(),
        contactPhone: null,
        preferredContactAt: null
      });
      setSelectedInquiryId(created.id);
      setLookupState("conversation");
      setSuccessMessage("Tin nhắn đã được gửi. Chủ trọ sẽ nhận được thông báo.");
      setMessage("");
    } catch (caught: unknown) {
      const error = caught instanceof ApiError ? caught : null;
      if (error?.status === 401) await refresh().catch(() => undefined);
      setFeedback(inquiryError(error));
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    panelRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeWidget();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeWidget, open]);

  const effectiveLookupState: LookupState = knownInquiryMode ? "conversation" : lookupState;
  const resolvedListingTitle = conversation.inquiry?.listingSummary?.title ?? listingTitle;
  const conversationView = effectiveLookupState === "conversation" && conversation.inquiry !== null;
  const chatPanelSizeClass = conversationView
    ? "h-[min(76dvh,42rem)] sm:h-[min(40rem,calc(100dvh-8rem))]"
    : "h-auto max-h-[min(76dvh,42rem)] sm:max-h-[min(40rem,calc(100dvh-8rem))]";

  const resizeNewMessageTextarea = useCallback(() => {
    const textarea = newMessageTextareaRef.current;
    if (!textarea) return;

    const minHeight = 48;
    const maxHeight = 144;
    textarea.style.height = "auto";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    if (effectiveLookupState === "new") resizeNewMessageTextarea();
  }, [effectiveLookupState, message, resizeNewMessageTextarea]);

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

  return (
    <>
      {!knownInquiryMode ? (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Mở cuộc trò chuyện để trao đổi trực tiếp với chủ trọ.
          </p>
          <Button
            ref={triggerRef}
            onClick={(event) => openWidget(event.currentTarget)}
            aria-expanded={open}
            aria-controls={`listing-chat-panel-${domId}`}
            className="w-full sm:w-auto"
          >
            <Icon name="message" className="h-4 w-4" />
            Nhắn tin cho chủ trọ
          </Button>
        </div>
      ) : null}

      {portalTarget
        ? createPortal(
            <div
              data-testid="floating-chat-portal"
              className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-drawer flex w-auto flex-col items-end gap-3 sm:bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:left-auto sm:right-6 sm:w-auto lg:bottom-6"
            >
              {open ? (
                <div
                  ref={panelRef}
                  id={`listing-chat-panel-${domId}`}
                  data-testid="floating-chat-panel"
                  role="dialog"
                  aria-modal="false"
                  aria-labelledby={`listing-chat-title-${domId}`}
                  tabIndex={-1}
                  className={`rm-floating-chat-panel flex w-full min-w-0 max-w-[25rem] flex-col overflow-hidden rounded-overlay border border-border bg-surface shadow-overlay-soft outline-none ${chatPanelSizeClass} sm:w-[min(24rem,calc(100vw-3rem))] lg:w-[25rem]`}
                >
                  <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surface px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-primary-hover">
                        Trao đổi về tin đăng
                      </p>
                      <h2
                        id={`listing-chat-title-${domId}`}
                        className="mt-1 font-display text-lg font-bold text-foreground"
                      >
                        Nhắn tin với chủ trọ
                      </h2>
                      <p className="mt-1 line-clamp-1 text-xs font-semibold text-muted-foreground">
                        {resolvedListingTitle}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {conversation.inquiry ? (
                        <InquirySafetyMenu
                          inquiry={conversation.inquiry}
                          onInquiryChange={(nextState) =>
                            conversation.updateInquiry((current) =>
                              current === null ? current : { ...current, ...nextState }
                            )
                          }
                        />
                      ) : null}
                      <IconButton label="Thu gọn nhắn tin" variant="ghost" size="sm" onClick={minimizeWidget}>
                        <Icon name="minus" className="h-5 w-5" />
                      </IconButton>
                      <IconButton label="Đóng nhắn tin" variant="ghost" size="sm" onClick={closeWidget}>
                        <Icon name="close" className="h-5 w-5" />
                      </IconButton>
                    </div>
                  </header>

                  <div className={conversationView ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 overflow-y-auto"}>
                    <div
                      className={
                        conversationView
                          ? "flex h-full min-h-0 min-w-0 flex-col gap-4 p-4"
                          : "flex min-w-0 flex-col gap-4 p-4"
                      }
                    >
                      <FloatingListingContext
                        inquiry={conversation.inquiry}
                        listingTitle={listingTitle}
                        monthlyRent={monthlyRent}
                        areaName={areaName}
                      />

                      {effectiveLookupState === "loading" ? (
                        <LoadingState className="min-h-32 shadow-none" message="Đang kiểm tra cuộc trò chuyện…" />
                      ) : effectiveLookupState === "error" ? (
                        <ErrorState
                          className="shadow-none"
                          message={lookupError ?? "Không thể kiểm tra cuộc trò chuyện lúc này."}
                          action={<Button onClick={beginLookup}>Thử lại</Button>}
                        />
                      ) : effectiveLookupState === "new" ? (
                        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
                          <div>
                            <h3 className="font-display text-xl font-bold">Bắt đầu cuộc trò chuyện</h3>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              Tin nhắn đầu tiên sẽ được gửi đến chủ trọ.
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Gợi ý câu hỏi nhanh:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {INQUIRY_QUICK_QUESTIONS.map((question) => (
                                <button
                                  key={question}
                                  type="button"
                                  onClick={() => setMessage(question)}
                                  aria-pressed={message === question}
                                  className={`rounded-full border px-2.5 py-1 text-left text-xs font-semibold transition hover:border-primary/40 hover:bg-primary-subtle hover:text-primary-hover active:scale-95 ${
                                    message === question
                                      ? "border-primary/60 bg-primary-subtle text-primary-hover"
                                      : "border-border bg-surface-subtle text-foreground"
                                  }`}
                                >
                                  &ldquo;{question}&rdquo;
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-bold" htmlFor={`inquiry-message-${domId}`}>
                              Nội dung lời nhắn
                            </label>
                            <div className="mt-2 flex min-w-0 items-end gap-2">
                              <textarea
                                id={`inquiry-message-${domId}`}
                                required
                                minLength={1}
                                maxLength={4000}
                                rows={1}
                                ref={newMessageTextareaRef}
                                value={message}
                                onChange={(event) => setMessage(event.target.value)}
                                onInput={resizeNewMessageTextarea}
                                placeholder="Nhập tin nhắn…"
                                className="min-h-12 min-w-0 max-h-36 flex-1 resize-none overflow-hidden rounded-control border border-border-strong bg-surface px-3 py-2.5 text-sm font-medium leading-6 outline-none transition focus:border-primary focus:ring-[3px] focus:ring-primary/20"
                              />
                              <IconButton
                                type="submit"
                                label="Gửi tin nhắn"
                                variant="primary"
                                size="sm"
                                pending={pending}
                                pendingLabel="Đang gửi…"
                                className="rounded-full"
                              >
                                <Icon name="send" className="h-4 w-4" />
                              </IconButton>
                            </div>
                          </div>
                          {feedback ? (
                            <p
                              role="alert"
                              className="rounded-control border border-danger/30 bg-danger-subtle p-3 text-sm font-semibold text-danger"
                            >
                              {feedback}
                            </p>
                          ) : null}
                        </form>
                      ) : effectiveLookupState === "conversation" && conversation.state === "error" ? (
                        <ErrorState
                          className="shadow-none"
                          message={
                            conversation.error?.status === 404
                              ? "Cuộc trò chuyện không tồn tại hoặc bạn không có quyền xem."
                              : "Không thể tải cuộc trò chuyện lúc này."
                          }
                          action={<Button onClick={conversation.reload}>Thử lại</Button>}
                        />
                      ) : effectiveLookupState === "conversation" && conversation.state !== "success" ? (
                        <LoadingState className="min-h-32 shadow-none" message="Đang mở cuộc trò chuyện…" />
                      ) : conversation.inquiry ? (
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                          {successMessage ? (
                            <p
                              role="status"
                              className="shrink-0 rounded-control border border-success/30 bg-success-subtle p-3 text-sm font-semibold text-success-foreground"
                            >
                              {successMessage}
                            </p>
                          ) : null}
                          <p className="shrink-0 text-sm font-semibold text-muted-foreground">
                            Trạng thái:{" "}
                            <span className="text-foreground">
                              {statusLabel(conversation.inquiry.status, user.role)}
                            </span>
                          </p>
                          <InquiryConversationCore
                            conversation={conversation}
                            currentUserRole={user.role}
                            variant="floating"
                            textareaId={`inquiry-floating-reply-${domId}`}
                            showRealtimeStatus
                            className="min-h-0 flex-1"
                          />
                          {!knownInquiryMode && conversation.inquiry.status === "CLOSED" ? (
                            <Button variant="secondary" onClick={startNewInquiry} className="w-full shrink-0">
                              Bắt đầu cuộc trò chuyện mới
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {showLauncher ? (
                <button
                  ref={launcherRef}
                  type="button"
                  data-testid="floating-chat-launcher"
                  aria-label={open ? "Thu gọn trò chuyện với chủ trọ" : "Mở trò chuyện với chủ trọ"}
                  aria-expanded={open}
                  aria-controls={`listing-chat-panel-${domId}`}
                  onClick={(event) => (open ? minimizeWidget() : openWidget(event.currentTarget))}
                  className="inline-grid h-14 w-14 shrink-0 place-items-center rounded-full border border-primary-hover/20 bg-primary text-primary-foreground shadow-raised outline-none transition-[background-color,box-shadow,transform] duration-standard ease-standard hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-overlay-soft focus-visible:ring-[3px] focus-visible:ring-focus motion-reduce:transition-none"
                >
                  <Icon name={open ? "minus" : "message"} className="h-6 w-6" />
                </button>
              ) : null}
            </div>,
            portalTarget
          )
        : null}
    </>
  );
}

// The listing-detail form and the inbox launcher share one floating chat implementation.
export const FloatingInquiryChat = InquiryForm;
