"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, RoommateInterest, RoommateMessage } from "../../types/api";
import {
  formatRoommateDateTime,
  isTerminalRoommateInterest,
  paymentOrContactHint,
  roommateErrorMessage,
  roommateInterestStatusLabels
} from "./roommate-content";
import {
  RoommateBlockControl,
  RoommateListingContext,
  RoommatePageHeader,
  RoommateProfileSummary,
  RoommateReportControl,
  RoommateSafetyNotice,
  RoommateStatusPill,
  RoommateSubnav,
  RoommateTenantBoundary
} from "./roommate-shared";

function parseInterestId(value: string): number | null {
  if (!/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : null;
}

const safetyCopy: Record<string, { readonly title: string; readonly body: string }> = {
  ADVANCE_PAYMENT_REQUEST: {
    title: "Hãy cẩn thận trước khi gửi tiền",
    body: "Hãy xác minh chỗ ở và thông tin liên quan trước khi gửi tiền hoặc đặt cọc."
  },
  OTP_REQUEST: {
    title: "Không chia sẻ mã xác thực",
    body: "RentMate không bao giờ yêu cầu bạn gửi mã xác thực hoặc OTP cho người dùng khác qua chat."
  },
  CREDENTIAL_REQUEST: {
    title: "Không chia sẻ thông tin đăng nhập",
    body: "Không gửi mật khẩu hoặc thông tin đăng nhập."
  },
  OFF_PLATFORM_REDIRECTION: {
    title: "Cẩn thận khi chuyển cuộc trò chuyện ra ngoài",
    body: "Hãy xác minh thông tin trước khi tiếp tục trao đổi trên nền tảng khác."
  },
  EXTERNAL_PAYMENT_REQUEST: {
    title: "Xác minh trước khi thanh toán ngoài RentMate",
    body: "Chỉ dùng phương thức thanh toán sau khi bạn đã tự kiểm tra đầy đủ thông tin."
  },
  URGENCY_PRESSURE: {
    title: "Đừng vội vì áp lực thời gian",
    body: "Dành thời gian kiểm tra thông tin trước khi quyết định."
  },
  SENSITIVE_FINANCIAL_INFO_REQUEST: {
    title: "Không chia sẻ thông tin tài chính nhạy cảm",
    body: "Không gửi số tài khoản, thông tin thẻ hoặc dữ liệu tài chính riêng tư qua chat."
  }
};

function warningText(message: RoommateMessage): { readonly title: string; readonly body: string } | null {
  const code = message.safetyWarning?.signalCodes[0];
  return code ? (safetyCopy[code] ?? null) : null;
}

function MessageBubble({ message, animate }: Readonly<{ message: RoommateMessage; animate: boolean }>) {
  const self = message.sender === "SELF";
  const body =
    message.body === "This message is no longer available." ? "Tin nhắn này hiện không còn hiển thị." : message.body;
  const warning = self ? null : warningText(message);
  return (
    <article
      aria-label={self ? "Tin nhắn của bạn" : "Tin nhắn của người còn lại"}
      className={`rm-roommate-message ${animate ? "rm-roommate-message-new" : ""}`}
      data-sender={self ? "self" : "counterpart"}
    >
      <p className="mb-1 text-ui-xs font-bold uppercase tracking-wide text-rent-secondary">
        {self ? "Bạn" : "Người còn lại"}
      </p>
      <p className="whitespace-pre-wrap break-words text-ui-sm leading-6 text-heroDark-950">{body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-ui-xs font-semibold text-rent-secondary">
        <time dateTime={message.createdAt}>{formatRoommateDateTime(message.createdAt)}</time>
        {self ? <span>{message.isRead ? "Đã đọc" : "Đã gửi"}</span> : null}
      </div>
      {!self ? (
        <div className="mt-3">
          <RoommateReportControl target="ROOMMATE_MESSAGE" messageId={message.id} label="Báo cáo tin nhắn" />
        </div>
      ) : null}
      {warning ? (
        <aside
          className="rm-roommate-safety mt-3 text-ui-sm leading-6"
          data-level={message.safetyWarning?.outcome === "HIGH_CAUTION" ? "high" : "caution"}
          role={message.safetyWarning?.outcome === "HIGH_CAUTION" ? "alert" : "status"}
          aria-label={warning.title}
        >
          <p className="font-bold">Tin nhắn này có dấu hiệu cần thận trọng.</p>
          <p className="mt-1 font-bold">{warning.title}</p>
          <p>{warning.body}</p>
          <div className="mt-2">
            <RoommateReportControl target="ROOMMATE_MESSAGE" messageId={message.id} label="Báo cáo tin nhắn này" />
          </div>
        </aside>
      ) : null}
    </article>
  );
}

function ConversationContent({ interestId }: Readonly<{ interestId: number }>) {
  const { status: authStatus, user } = useAuth();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const [interest, setInterest] = useState<RoommateInterest | null>(null);
  const [messages, setMessages] = useState<readonly RoommateMessage[]>([]);
  const [messagePage, setMessagePage] = useState(1);
  const [messagePagination, setMessagePagination] = useState<ApiPage<RoommateMessage>["pagination"]>({
    page: 1,
    pageSize: 100,
    hasNextPage: false
  });
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [newMessageIds, setNewMessageIds] = useState<ReadonlySet<number>>(() => new Set());
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);
  const knownMessageIds = useRef<ReadonlySet<number>>(new Set());
  const pollInFlight = useRef(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nearBottomRef = useRef(true);
  const previousLatestMessageIdRef = useRef<number | null>(null);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const list = messageListRef.current;
    if (!list) return;
    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resolvedBehavior = reducedMotion ? "auto" : behavior;

    if (typeof list.scrollTo === "function") {
      try {
        list.scrollTo({ top: list.scrollHeight, behavior: resolvedBehavior });
      } catch {
        list.scrollTop = list.scrollHeight;
      }
    } else {
      list.scrollTop = list.scrollHeight;
    }
    nearBottomRef.current = true;
    setShowNewMessageIndicator(false);
  }, []);

  const handleMessageListScroll = useCallback(() => {
    const list = messageListRef.current;
    if (!list) return;
    const distanceFromBottom = Math.max(0, list.scrollHeight - list.scrollTop - list.clientHeight);
    const nearBottom = distanceFromBottom <= 100;
    nearBottomRef.current = nearBottom;
    if (nearBottom) setShowNewMessageIndicator(false);
  }, []);

  const replaceMessages = useCallback((next: readonly RoommateMessage[], animateNew: boolean) => {
    const nextIds = new Set(next.map((message) => message.id));
    if (animateNew) {
      const addedIds = new Set([...nextIds].filter((id) => !knownMessageIds.current.has(id)));
      if (addedIds.size > 0) setNewMessageIds(addedIds);
    } else {
      setNewMessageIds(new Set());
    }
    knownMessageIds.current = nextIds;
    setMessages(next);
  }, []);

  useEffect(() => {
    if (!tenantReady) return;
    const controller = new AbortController();
    setState("loading");
    setError(null);
    void Promise.all([
      api.roommates.getInterest(interestId, controller.signal),
      api.roommates.listMessages(interestId, { page: messagePage, pageSize: 100 }, controller.signal)
    ])
      .then(([interestValue, page]) => {
        if (controller.signal.aborted) return;
        setInterest(interestValue);
        replaceMessages(page.data, false);
        setMessagePagination(page.pagination);
        setState("success");
        void api.roommates.markMessagesRead(interestId).catch(() => undefined);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setState("error");
        }
      });
    return () => controller.abort();
  }, [interestId, messagePage, replaceMessages, retryKey, tenantReady]);

  // Auto-scroll when messages update
  useEffect(() => {
    if (!messageListRef.current || messages.length === 0) return;
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage) return;

    if (previousLatestMessageIdRef.current === null) {
      previousLatestMessageIdRef.current = latestMessage.id;
      scrollToLatest("auto");
      return;
    }

    if (latestMessage.id === previousLatestMessageIdRef.current) return;
    previousLatestMessageIdRef.current = latestMessage.id;

    if (latestMessage.sender === "SELF" || nearBottomRef.current) {
      scrollToLatest("smooth");
    } else {
      setShowNewMessageIndicator(true);
    }
  }, [messages, scrollToLatest]);

  const pollingEligible =
    tenantReady &&
    state === "success" &&
    messagePage === 1 &&
    messages.some((message) => message.sender === "COUNTERPART") &&
    !messages.some((message) => message.safetyWarning);

  useEffect(() => {
    if (!pollingEligible) return;
    const startedAt = Date.now();
    let disposed = false;
    let timer: number | null = null;
    let requestController: AbortController | null = null;

    const clearTimer = () => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    };

    const abortRequest = () => {
      requestController?.abort();
      requestController = null;
    };

    const stop = () => {
      disposed = true;
      clearTimer();
      abortRequest();
    };

    const refresh = async (): Promise<void> => {
      if (disposed || document.visibilityState !== "visible" || pollInFlight.current) return;
      pollInFlight.current = true;
      const controller = new AbortController();
      requestController = controller;
      try {
        const page = await api.roommates.listMessages(interestId, { page: 1, pageSize: 100 }, controller.signal);
        if (disposed || controller.signal.aborted || document.visibilityState !== "visible") return;
        replaceMessages(page.data, true);
        setMessagePagination(page.pagination);
        if (page.data.some((message) => message.safetyWarning)) stop();
      } catch {
        // Polling is advisory: normal chat remains usable when a refresh fails.
      } finally {
        if (requestController === controller) requestController = null;
        pollInFlight.current = false;
      }
    };

    const schedule = () => {
      if (disposed || timer !== null || document.visibilityState !== "visible") return;
      const remaining = 30_000 - (Date.now() - startedAt);
      if (remaining <= 0) {
        stop();
        return;
      }
      timer = window.setTimeout(
        () => {
          timer = null;
          if (Date.now() - startedAt >= 30_000) {
            stop();
            return;
          }
          void refresh().finally(schedule);
        },
        Math.min(5_000, remaining)
      );
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearTimer();
        abortRequest();
        return;
      }
      schedule();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule();
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stop();
    };
  }, [interestId, pollingEligible, replaceMessages]);

  const writable = interest?.status === "PENDING" || interest?.status === "ACCEPTED";
  const highCaution = messages.some(
    (message) => message.sender === "COUNTERPART" && message.safetyWarning?.outcome === "HIGH_CAUTION"
  );

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(event.target.value);
    const textarea = event.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim()) {
      setSendError("Hãy nhập tin nhắn trước khi gửi.");
      return;
    }
    setPending(true);
    setSendError(null);
    try {
      const message = await api.roommates.sendMessage(interestId, body.trim());
      if (!messagePagination.hasNextPage) {
        knownMessageIds.current = new Set([...knownMessageIds.current, message.id]);
        setNewMessageIds(new Set([message.id]));
        setMessages((current) => [...current, message]);
      }
      setBody("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      scrollToLatest("smooth");
    } catch (caught) {
      setSendError(roommateErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  if (state === "loading") return <LoadingState message="Đang tải cuộc trò chuyện ở ghép…" />;
  if (state === "error" || !interest) {
    return (
      <ErrorState
        message={roommateErrorMessage(error)}
        requestId={error?.requestId}
        action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
      />
    );
  }

  return (
    <div className="rm-roommate-page space-y-6">
      <RoommatePageHeader
        title="Cuộc trò chuyện ở ghép"
        description="Trao đổi trong RentMate và tự kiểm tra điều kiện thuê trước khi giao dịch. Không dùng cuộc trò chuyện này để chia sẻ OTP, mật khẩu hoặc thông tin tài chính."
      />
      <RoommateSubnav />
      <RoommateSafetyNotice kind="short" className="sticky top-20 z-20" />
      {highCaution ? (
        <section
          className="rm-roommate-safety"
          data-level="high"
          role="alert"
          aria-label="Lưu ý an toàn cho cuộc trò chuyện"
        >
          <h2 className="font-bold">Hãy thận trọng trong cuộc trò chuyện này</h2>
          <p>Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính. Hãy tự xác minh trước khi gửi tiền.</p>
        </section>
      ) : null}
      <div className="rm-roommate-chat-layout">
        <aside
          className="rm-roommate-chat-panel order-2 space-y-4 p-4 lg:order-1"
          aria-label="Bối cảnh cuộc trò chuyện"
        >
          <div>
            <p className="rm-roommate-section-label">Bối cảnh</p>
            <h2 className="mt-1 font-display text-heading-sm font-bold">Người và nhu cầu ở ghép</h2>
            <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
              Xem lại hồ sơ, nhu cầu và khu vực trước khi tiếp tục trao đổi.
            </p>
          </div>
          <RoommateProfileSummary profile={interest.counterpart} heading="Hồ sơ người còn lại" />
          <RoommateListingContext request={interest.request} />
        </aside>
        <main className="rm-roommate-chat-panel order-1 flex min-w-0 flex-col overflow-hidden lg:order-2">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-surface/50 p-4 backdrop-blur-xs sm:p-5">
            <div>
              <p className="rm-roommate-section-label">Cuộc trò chuyện</p>
              <h2 className="mt-1 font-display text-heading-sm font-bold">
                {roommateInterestStatusLabels[interest.status]}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <RoommateStatusPill status={interest.status} label={roommateInterestStatusLabels[interest.status]} />
              {interest.status === "ACCEPTED" ? (
                <Link
                  className="text-right text-ui-sm font-bold underline decoration-2 underline-offset-4"
                  href="/roommates/connection"
                >
                  Mở kết nối hiện tại
                </Link>
              ) : null}
            </div>
          </div>
          <div className="relative min-h-[20rem] flex-1">
            <div
              ref={messageListRef}
              onScroll={handleMessageListScroll}
              className="max-h-[min(38rem,60vh)] space-y-3 overflow-y-auto p-4 sm:p-5"
              aria-live="polite"
              aria-label="Tin nhắn ở ghép"
            >
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} animate={newMessageIds.has(message.id)} />
              ))}
            </div>
            {showNewMessageIndicator ? (
              <button
                type="button"
                onClick={() => scrollToLatest("smooth")}
                className="absolute bottom-3 left-1/2 z-10 min-h-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/20 bg-surface px-4 py-1.5 text-xs font-bold text-primary-hover shadow-raised outline-none transition hover:bg-primary-subtle focus-visible:ring-[3px] focus-visible:ring-focus/30 active:scale-95"
              >
                Tin nhắn mới ↓
              </button>
            ) : null}
          </div>
          {messagePagination.hasNextPage || messagePage > 1 ? (
            <div className="border-t border-border px-4 py-3 sm:px-5">
              <Pagination
                ariaLabel="Phân trang tin nhắn ở ghép"
                page={messagePagination.page}
                hasNextPage={messagePagination.hasNextPage}
                onPrevious={() => setMessagePage((current) => Math.max(1, current - 1))}
                onNext={() => setMessagePage((current) => current + 1)}
              />
            </div>
          ) : null}
          {writable ? (
            <div className="rm-roommate-composer border-t border-border bg-surface/95 p-3.5 backdrop-blur-md sm:p-4">
              <form ref={formRef} className="space-y-2.5" onSubmit={(event) => void submit(event)} noValidate>
                <label htmlFor={`roommate-message-${interest.id}`} className="sr-only">
                  Tin nhắn (bắt buộc)
                </label>
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    id={`roommate-message-${interest.id}`}
                    name="message"
                    required
                    maxLength={2000}
                    rows={1}
                    aria-describedby={`roommate-message-${interest.id}-hint`}
                    value={body}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Nhập tin nhắn… (Nhấn Enter để gửi)"
                    className="min-h-12 max-h-24 flex-1 resize-none overflow-y-auto rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-ui-sm font-medium leading-6 text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-[3px] focus:ring-primary/20"
                  />
                  <Button
                    type="submit"
                    aria-label="Gửi tin nhắn"
                    disabled={pending || !body.trim()}
                    pending={pending}
                    pendingLabel="Đang gửi…"
                    className="h-12 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold shadow-xs transition hover:shadow-sm"
                  >
                    <Icon name="send" className="h-4 w-4" />
                    <span className="hidden sm:inline">Gửi tin nhắn</span>
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2 px-1 text-ui-xs font-semibold text-rent-secondary">
                  <span id={`roommate-message-${interest.id}-hint`} className="sr-only">
                    Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính.
                  </span>
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    Nhấn Enter để gửi, Shift+Enter để xuống dòng
                  </span>
                  <p aria-live="polite" className="ml-auto">
                    {Array.from(body).length}/2000 ký tự
                  </p>
                </div>
                {paymentOrContactHint(body) ? (
                  <p
                    role="note"
                    className="rm-roommate-callout py-2 text-ui-sm font-semibold leading-6"
                    data-tone="warning"
                  >
                    {
                      "Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính. Thận trọng với yêu cầu chuyển tiền hoặc đặt cọc."
                    }
                  </p>
                ) : null}
                {sendError ? (
                  <p
                    role="alert"
                    className="rm-roommate-callout text-ui-sm font-semibold text-danger"
                    data-tone="danger"
                  >
                    {sendError}
                  </p>
                ) : null}
              </form>
            </div>
          ) : (
            <div className="rm-roommate-callout m-4 sm:m-5" data-tone="info">
              <h2 className="font-display text-ui-base font-bold">Cuộc trò chuyện chỉ đọc</h2>
              <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
                {isTerminalRoommateInterest(interest.status)
                  ? "Lời quan tâm này đã kết thúc nên không thể gửi thêm tin nhắn."
                  : "Cuộc trò chuyện này hiện không thể nhận tin nhắn mới."}
              </p>
            </div>
          )}
        </main>
        <aside
          className="rm-roommate-chat-panel order-3 space-y-4 p-4 lg:order-3"
          aria-label="Thông tin và an toàn ở ghép"
        >
          <div>
            <p className="rm-roommate-section-label">An toàn</p>
            <h2 className="mt-1 font-display text-heading-sm font-bold">Giữ cuộc trò chuyện rõ ràng</h2>
          </div>
          <RoommateSafetyNotice kind="checklist" />
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <RoommateReportControl target="ROOMMATE_PROFILE" interestId={interest.id} label="Báo cáo" />
            <RoommateBlockControl context="interest" id={interest.id} onBlocked={() => setRetryKey((key) => key + 1)} />
          </div>
          <div className="rm-roommate-callout" data-tone="info">
            <h3 className="font-display text-ui-base font-bold">Riêng tư</h3>
            <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
              Kết nối không tự động chia sẻ email, số điện thoại, địa chỉ chính xác hoặc dữ liệu tài chính.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function RoommateConversationPage({ interestId }: Readonly<{ interestId: string }>) {
  const parsedId = useMemo(() => parseInterestId(interestId), [interestId]);
  return (
    <RoommateTenantBoundary>
      {parsedId ? (
        <ConversationContent interestId={parsedId} />
      ) : (
        <ErrorState message="Cuộc trò chuyện ở ghép hiện không còn khả dụng." />
      )}
    </RoommateTenantBoundary>
  );
}
