"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { IconButton } from "../../components/ui/icon-button";
import styles from "./roommate-conversation.module.css";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { useNotificationRealtime } from "../contact/notification-unread-store";
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
  RoommateAvatar,
  RoommateProfileSummary,
  RoommateReportControl,
  RoommateSafetyNotice,
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

function mergeRoommateMessages(
  current: readonly RoommateMessage[],
  updates: readonly RoommateMessage[]
): readonly RoommateMessage[] {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  updates.forEach((message) => messagesById.set(message.id, message));
  return [...messagesById.values()].sort((left, right) => {
    const timeDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return timeDifference || left.id - right.id;
  });
}

function MessageBubble({
  message,
  animate,
  selectingReport,
  reportDialogOpen,
  reported,
  onSelectForReport,
  onReportDialogOpenChange,
  onReported
}: Readonly<{
  message: RoommateMessage;
  animate: boolean;
  selectingReport: boolean;
  reportDialogOpen: boolean;
  reported: boolean;
  onSelectForReport: (messageId: number) => void;
  onReportDialogOpenChange: (open: boolean) => void;
  onReported: (messageId: number) => void;
}>) {
  const self = message.sender === "SELF";
  const selectable = selectingReport && !self && !reported;
  const body =
    message.body === "This message is no longer available." ? "Tin nhắn này hiện không còn hiển thị." : message.body;
  const warning = self ? null : warningText(message);

  return (
    <article
      aria-label={
        selectable
          ? `Chọn tin nhắn của người còn lại, ${formatRoommateDateTime(message.createdAt)}`
          : self
            ? "Tin nhắn của bạn"
            : "Tin nhắn của người còn lại"
      }
      className={`${styles.message} ${selectable ? styles.selectableMessage : ""} ${animate ? "rm-roommate-message-new" : ""}`}
      data-sender={self ? "self" : "counterpart"}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable && !reportDialogOpen ? () => onSelectForReport(message.id) : undefined}
      onKeyDown={
        selectable && !reportDialogOpen
          ? (event: React.KeyboardEvent<HTMLElement>) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onSelectForReport(message.id);
            }
          : undefined
      }
    >
      <p className="sr-only">{self ? "Bạn" : "Người còn lại"}</p>
      <p className={styles.messageBody}>{body}</p>
      <div className={styles.messageMeta}>
        <time dateTime={message.createdAt}>{formatRoommateDateTime(message.createdAt)}</time>
        {self ? <span>{message.isRead ? "Đã đọc" : "Đã gửi"}</span> : null}
      </div>
      {selectable ? <p className={styles.reportSelectionHint}>Chọn để báo cáo tin nhắn</p> : null}
      {reported ? (
        <p className={styles.reportConfirmation} role="status">
          Báo cáo đã được gửi tới đội ngũ an toàn.
        </p>
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
        </aside>
      ) : null}
      {reportDialogOpen ? (
        <RoommateReportControl
          target="ROOMMATE_MESSAGE"
          messageId={message.id}
          open
          onOpenChange={onReportDialogOpenChange}
          onSubmitted={() => onReported(message.id)}
        />
      ) : null}
    </article>
  );
}

function ConversationContent({
  interestId,
  embedded = false,
  onRead
}: Readonly<{ interestId: number; embedded?: boolean; onRead?: () => void }>) {
  const { status: authStatus, user } = useAuth();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const notificationRealtime = useNotificationRealtime(tenantReady ? user.id : null);
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
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [selectingMessageReport, setSelectingMessageReport] = useState(false);
  const [reportTargetMessageId, setReportTargetMessageId] = useState<number | null>(null);
  const [reportedMessageIds, setReportedMessageIds] = useState<ReadonlySet<number>>(() => new Set());
  const knownMessageIds = useRef<ReadonlySet<number>>(new Set());
  const messagesRef = useRef<readonly RoommateMessage[]>([]);
  const realtimeRefreshController = useRef<AbortController | null>(null);
  const previousRealtimeStatus = useRef(notificationRealtime.realtimeStatus);
  const messageListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nearBottomRef = useRef(true);
  const previousLatestMessageIdRef = useRef<number | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDetailsElement>(null);
  const safetyButtonRef = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (state !== "success" || embedded) return;
    const resize = () => {
      const chat = chatRef.current;
      if (!chat) return;
      const viewport = window.visualViewport;
      const bottomNav = document.querySelector(".rm-mobile-nav")?.getBoundingClientRect().height ?? 0;
      const top = chat.getBoundingClientRect().top;
      chat.style.height = `${Math.max(320, (viewport?.height ?? window.innerHeight) - top - bottomNav - 16)}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [state, embedded]);

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
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const mergeMessages = useCallback((updates: readonly RoommateMessage[], animateNew: boolean) => {
    const merged = mergeRoommateMessages(messagesRef.current, updates);
    const nextIds = new Set(merged.map((message) => message.id));
    if (animateNew) {
      const addedIds = new Set([...nextIds].filter((id) => !knownMessageIds.current.has(id)));
      if (addedIds.size > 0) setNewMessageIds(addedIds);
    } else {
      setNewMessageIds(new Set());
    }
    knownMessageIds.current = nextIds;
    messagesRef.current = merged;
    setMessages(merged);
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
        void api.roommates
          .markMessagesRead(interestId)
          .then(() => {
            if (!controller.signal.aborted) onRead?.();
          })
          .catch(() => undefined);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setState("error");
        }
      });
    return () => controller.abort();
  }, [interestId, messagePage, replaceMessages, retryKey, tenantReady, onRead]);

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

  const refreshMessagesFromRealtime = useCallback(() => {
    if (!tenantReady || state !== "success") return;
    realtimeRefreshController.current?.abort();
    const controller = new AbortController();
    realtimeRefreshController.current = controller;
    void api.roommates
      .listMessages(interestId, { page: messagePage, pageSize: 100 }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        mergeMessages(page.data, true);
        setMessagePagination(page.pagination);
        void api.roommates
          .markMessagesRead(interestId)
          .then(() => onRead?.())
          .catch(() => undefined);
      })
      .catch(() => undefined)
      .finally(() => {
        if (realtimeRefreshController.current === controller) realtimeRefreshController.current = null;
      });
  }, [interestId, messagePage, mergeMessages, onRead, state, tenantReady]);

  useEffect(() => {
    const notification = notificationRealtime.latestNotification;
    if (
      state !== "success" ||
      notification?.eventType !== "ROOMMATE_MESSAGE_RECEIVED" ||
      notification.roommateInterestId !== interestId
    ) {
      return;
    }
    refreshMessagesFromRealtime();
  }, [
    interestId,
    notificationRealtime.latestNotification,
    notificationRealtime.latestNotificationVersion,
    refreshMessagesFromRealtime,
    state
  ]);

  useEffect(() => {
    const previousStatus = previousRealtimeStatus.current;
    previousRealtimeStatus.current = notificationRealtime.realtimeStatus;
    if (notificationRealtime.realtimeStatus === "connected" && previousStatus !== "connected") {
      refreshMessagesFromRealtime();
    }
  }, [notificationRealtime.realtimeStatus, refreshMessagesFromRealtime]);

  useEffect(
    () => () => {
      realtimeRefreshController.current?.abort();
      realtimeRefreshController.current = null;
    },
    [interestId, messagePage]
  );

  const writable = interest?.status === "PENDING" || interest?.status === "ACCEPTED";
  const highCaution = messages.some(
    (message) => message.sender === "COUNTERPART" && message.safetyWarning?.outcome === "HIGH_CAUTION"
  );

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(event.target.value);
    const textarea = event.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
    setSendError(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || pending) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendingRef.current || !writable) return;
    if (!body.trim()) {
      setSendError("Hãy nhập tin nhắn trước khi gửi.");
      return;
    }
    sendingRef.current = true;
    setPending(true);
    setSendError(null);
    try {
      const message = await api.roommates.sendMessage(interestId, body.trim());
      if (!messagePagination.hasNextPage) {
        mergeMessages([message], true);
      }
      setBody("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      scrollToLatest("smooth");
    } catch (caught) {
      setSendError(roommateErrorMessage(caught));
    } finally {
      sendingRef.current = false;
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
    <div className={`${styles.page} ${embedded ? styles.embedded : ""}`}>
      <nav className={styles.breadcrumb} aria-label="Điều hướng cuộc trò chuyện">
        <Link href="/roommates/interests">
          <Icon name="arrow" className="h-4 w-4 rotate-180" /> Lời quan tâm
        </Link>
        <span>Cuộc trò chuyện ở ghép</span>
      </nav>
      <div ref={chatRef} className={styles.chat}>
        <header className={styles.header}>
          <div className={styles.person}>
            <RoommateAvatar displayName={interest.counterpart?.displayName ?? "Người ở ghép"} />
            <div className="min-w-0">
              <h1>{interest.counterpart?.displayName ?? "Người ở ghép"}</h1>
              <p>{roommateInterestStatusLabels[interest.status]}</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Button
              ref={safetyButtonRef}
              className={styles.safetyButton}
              variant="secondary"
              size="sm"
              aria-haspopup="dialog"
              onClick={() => setSafetyOpen(true)}
            >
              <Icon name="shield" className="h-4 w-4" />
              <span>An toàn</span>
            </Button>
            <details ref={infoRef} className={styles.info}>
              <summary>
                <Icon name="user" className="h-4 w-4" />
                <span>Thông tin</span>
              </summary>
              <aside className={styles.infoPanel} aria-label="Thông tin cuộc trò chuyện">
                <div className={styles.infoHeading}>
                  <h2>Thông tin cuộc trò chuyện</h2>
                  <IconButton
                    label="Đóng thông tin"
                    size="sm"
                    onClick={() => {
                      if (infoRef.current) {
                        infoRef.current.open = false;
                        infoRef.current.querySelector("summary")?.focus();
                      }
                    }}
                  >
                    <Icon name="close" className="h-4 w-4" />
                  </IconButton>
                </div>
                <RoommateProfileSummary profile={interest.counterpart} heading="Hồ sơ người còn lại" />
                <RoommateListingContext request={interest.request} />
                <RoommateSafetyNotice kind="checklist" />
                <p className="text-ui-xs leading-5 text-muted-foreground">
                  Kết nối không tự động chia sẻ email, số điện thoại, địa chỉ chính xác hoặc dữ liệu tài chính.
                </p>
                {interest.status === "ACCEPTED" ? (
                  <Link className="font-bold text-primary-hover underline" href="/roommates/connection">
                    Mở kết nối hiện tại
                  </Link>
                ) : null}
              </aside>
            </details>
          </div>
        </header>
        <Dialog
          open={safetyOpen}
          title="An toàn cuộc trò chuyện"
          description="Báo cáo và chặn là hai thao tác riêng. Báo cáo tin nhắn sẽ yêu cầu bạn chọn nội dung cụ thể."
          mode="drawer"
          triggerRef={safetyButtonRef}
          onClose={() => setSafetyOpen(false)}
        >
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="font-bold text-foreground">Báo cáo</h3>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => {
                  setSafetyOpen(false);
                  setSelectingMessageReport(true);
                  setReportTargetMessageId(null);
                }}
              >
                <Icon name="flag" className="h-4 w-4" /> Báo cáo tin nhắn
              </Button>
              <RoommateReportControl target="ROOMMATE_PROFILE" interestId={interest.id} label="Báo cáo hồ sơ" />
            </section>
            <section className="space-y-3 border-t border-border pt-5">
              <h3 className="font-bold text-foreground">Chặn</h3>
              <p className="text-ui-sm leading-6 text-muted-foreground">
                Chặn không tự động gửi báo cáo. Quy tắc tương tác hiện tại vẫn được áp dụng.
              </p>
              <RoommateBlockControl
                context="interest"
                id={interest.id}
                onBlocked={() => {
                  setSafetyOpen(false);
                  setRetryKey((key) => key + 1);
                }}
              />
            </section>
          </div>
        </Dialog>
        <RoommateSafetyNotice kind="short" className={styles.safetyStrip} />
        {highCaution ? (
          <section
            className={`rm-roommate-safety ${styles.highCaution}`}
            data-level="high"
            role="alert"
            aria-label="Lưu ý an toàn cho cuộc trò chuyện"
          >
            <h2 className="font-bold">Hãy thận trọng trong cuộc trò chuyện này</h2>
            <p>Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính. Hãy tự xác minh trước khi gửi tiền.</p>
          </section>
        ) : null}
        {selectingMessageReport ? (
          <div className={styles.reportModeNotice} role="status">
            <p>Chọn tin nhắn cần báo cáo.</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSelectingMessageReport(false);
                setReportTargetMessageId(null);
              }}
            >
              Hủy chọn tin nhắn
            </Button>
          </div>
        ) : null}
        <div className={styles.messageRegion}>
          <div
            ref={messageListRef}
            onScroll={handleMessageListScroll}
            className={styles.messageList}
            role="log"
            aria-live="polite"
            aria-label="Tin nhắn ở ghép"
          >
            {messages.length === 0 ? <p className={styles.empty}>Gửi lời chào để bắt đầu cuộc trò chuyện.</p> : null}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                animate={newMessageIds.has(message.id)}
                selectingReport={selectingMessageReport}
                reportDialogOpen={reportTargetMessageId === message.id}
                reported={reportedMessageIds.has(message.id)}
                onSelectForReport={setReportTargetMessageId}
                onReportDialogOpenChange={(open) => setReportTargetMessageId(open ? message.id : null)}
                onReported={(messageId) => setReportedMessageIds((current) => new Set([...current, messageId]))}
              />
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
          <div className={styles.composer}>
            <form ref={formRef} className="space-y-2.5" onSubmit={(event) => void submit(event)} noValidate>
              <label htmlFor={`roommate-message-${interest.id}`} className="sr-only">
                Tin nhắn (bắt buộc)
              </label>
              <div className={styles.inputRow}>
                <textarea
                  ref={textareaRef}
                  id={`roommate-message-${interest.id}`}
                  name="message"
                  required
                  maxLength={2000}
                  rows={1}
                  readOnly={pending}
                  aria-describedby={`roommate-message-${interest.id}-hint`}
                  value={body}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Nhập tin nhắn…"
                />
                <IconButton
                  type="submit"
                  label="Gửi tin nhắn"
                  variant="primary"
                  disabled={pending || !body.trim()}
                  pending={pending}
                  pendingLabel="Đang gửi…"
                  className={styles.sendButton}
                >
                  <Icon name="send" className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="flex items-center justify-between gap-2 px-1 text-ui-xs font-semibold text-rent-secondary">
                <span id={`roommate-message-${interest.id}-hint`} className="sr-only">
                  Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính.
                </span>
                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                  Nhấn Enter để gửi, Shift+Enter để xuống dòng
                </span>
                <p className={body.length >= 1800 ? "ml-auto" : "sr-only"}>{Array.from(body).length}/2000 ký tự</p>
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
                <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
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
      </div>
    </div>
  );
}

export function RoommateConversationPage({
  interestId,
  embedded = false,
  onRead
}: Readonly<{ interestId: string; embedded?: boolean; onRead?: () => void }>) {
  const parsedId = useMemo(() => parseInterestId(interestId), [interestId]);
  return (
    <RoommateTenantBoundary>
      {parsedId ? (
        <ConversationContent key={parsedId} interestId={parsedId} embedded={embedded} onRead={onRead} />
      ) : (
        <ErrorState message="Cuộc trò chuyện ở ghép hiện không còn khả dụng." />
      )}
    </RoommateTenantBoundary>
  );
}
